import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
// bcryptjs v3+ ships its own TypeScript definitions; @types/bcryptjs not needed.
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/shared/prisma';
import { authConfig } from './auth.config';
import { PasswordHash } from './domain/PasswordHash';
import { getGoogleOAuthCredentials } from './googleOAuth';
import { AuthRepository } from './infrastructure/AuthRepository';

// Pre-computed bcrypt hash (cost 12) used for constant-time response when no user is found.
// Prevents timing-based user enumeration: bcryptjs short-circuits on an obviously invalid
// hash, so using a real 60-char hash ensures comparable work to a real verify() call.
const DUMMY_HASH = '$2b$12$uBubSQ6J8844KtMFcKvLsuIqchm3gaZe0Jt3VEbqY7KWYKvZWKvgG';
const googleOAuthCredentials = getGoogleOAuthCredentials();

export const authOptions: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  ...authConfig,
  providers: [
    ...(googleOAuthCredentials
      ? [
          Google({
            clientId: googleOAuthCredentials.clientId,
            clientSecret: googleOAuthCredentials.clientSecret,
            // Allow linking google login to email-created accounts (safe because we check verification)
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (typeof credentials?.email !== 'string' || typeof credentials?.password !== 'string') {
          return null;
        }
        // AuthRepository is the approved boundary for userId-scope-exempt auth lookups.
        // See lib/auth/infrastructure/AuthRepository.ts, CLAUDE.md, and AGENTS.md for the
        // documented exception to the Identity Scoping rule.
        const user = await AuthRepository.findByEmailForAuth(credentials.email.toLowerCase());
        // Allow ACTIVE users normally; also allow DELETION_PENDING users to
        // sign in during their 48h cancellation window so they can reach
        // the cancel flow at /settings. Task 6.1 / US-AUT-02.
        const canAuthenticate =
          user?.status === 'ACTIVE' || user?.status === 'DELETION_PENDING';
        if (!user?.passwordHash || !canAuthenticate) {
          // Constant-time guard: prevents timing-based user enumeration.
          await bcrypt.compare(credentials.password, DUMMY_HASH);
          return null;
        }
        const ph = PasswordHash.fromHash(user.passwordHash);
        const valid = await ph.verify(credentials.password);
        if (!valid) return null;
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          passwordVersion: user.passwordVersion,
          status: user.status,
        };
      },
    }),
  ],
  callbacks: {
    // Override the signIn callback to enforce status check & verified email for Google login
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google') {
        // 1. Enforce Google-side email verification to prevent hijack takeovers
        const isVerified = (profile as { email_verified?: boolean })?.email_verified === true;
        if (!isVerified) {
          console.warn(`[NextAuth signIn] Blocked Google login for unverified email: ${user.email}`);
          return false;
        }

        // 2. Perform DB status query based on verified profile email
        const email = user.email?.toLowerCase();
        if (!email) {
          return false;
        }

        try {
          const dbUser = await prisma.user.findFirst({
            where: { email },
            select: { status: true },
          });

          // If user already exists in DB, ensure status is ACTIVE or DELETION_PENDING
          if (dbUser) {
            const isAllowed = dbUser.status === 'ACTIVE' || dbUser.status === 'DELETION_PENDING';
            if (!isAllowed) {
              console.warn(`[NextAuth signIn] Blocked login for user ${email} with status ${dbUser.status}`);
              return false;
            }
          }
        } catch (err) {
          console.error('[NextAuth signIn callback] Database lookup failed:', err);
          // Fail-closed for security: do not authenticate if status cannot be verified
          return false;
        }
      }
      return true;
    },

    // Re-use the edge-safe session callback from authConfig unchanged.
    session: authConfig.callbacks!.session!,

    // Override the jwt callback to add passwordVersion-based session revocation.
    // This runs in the Node.js runtime (not the edge middleware which uses authConfig directly).
    async jwt({ token, user }) {
      if (user) {
        // Sign-in: embed identity claims and passwordVersion.
        token.id = user.id;
        token.role = user.role ?? null;
        token.passwordVersion = user.passwordVersion ?? 1;
        // Task 6.1 — embed user status so edge middleware can route
        // DELETION_PENDING users to /settings without a DB roundtrip.
        token.status = (user as { status?: string }).status ?? 'ACTIVE';
        return token;
      }

      // Subsequent requests: validate that passwordVersion in the JWT still matches
      // the DB. A mismatch, missing claim, or deleted user revokes this session by
      // removing id/role so the session callback returns a session without user.id,
      // which middleware treats as unauthenticated.
      if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id },
          select: { passwordVersion: true, status: true },
        });
        const shouldRevoke =
          !dbUser ||
          typeof token.passwordVersion !== 'number' ||
          dbUser.passwordVersion !== token.passwordVersion;
        if (shouldRevoke) {
          const stripped = { ...token };
          delete stripped.id;
          delete stripped.role;
          delete stripped.passwordVersion;
          delete stripped.status;
          return stripped;
        }
        // Refresh status so a transition (DELETION_PENDING ↔ ACTIVE) made
        // since sign-in propagates to the next request's middleware check.
        if (dbUser && dbUser.status !== token.status) {
          token.status = dbUser.status;
        }
      }

      return token;
    },
  },
  events: {
    async signIn({ user, account, isNewUser }) {
      if (!user.id) return;

      try {
        // 1. Audit USER_REGISTERED if this is a newly created account
        if (isNewUser) {
          await prisma.auditEvent.create({
            data: {
              actorUserId: user.id,
              subjectUserId: user.id,
              category: 'Auth',
              action: 'USER_REGISTERED',
              resourceId: user.id,
              resourceType: 'User',
              metadata: { method: account?.provider ?? 'google' },
            },
          });
        }

        // 2. Audit USER_LOGGED_IN for every successful session creation
        await prisma.auditEvent.create({
          data: {
            actorUserId: user.id,
            subjectUserId: user.id,
            category: 'Auth',
            action: 'USER_LOGGED_IN',
            resourceId: user.id,
            resourceType: 'User',
            metadata: { method: account?.provider ?? 'credentials' },
          },
        });
      } catch (err) {
        console.error('[NextAuth events:signIn] Failed to create audit logs:', err);
      }
    },
    async signOut(message: { session?: unknown; token?: { id?: string } | null }) {
      const token = message && 'token' in message ? message.token : null;
      if (!token?.id) return;
      try {
        await prisma.auditEvent.create({
          data: {
            actorUserId: token.id,
            subjectUserId: token.id,
            category: 'Auth',
            action: 'USER_LOGGED_OUT',
            resourceId: token.id,
            resourceType: 'User',
          },
        });
      } catch (err) {
        console.error('[NextAuth events:signOut] Failed to create audit log:', err);
      }
    },
    async linkAccount({ user, account }) {
      if (!user.id) return;
      try {
        await prisma.auditEvent.create({
          data: {
            actorUserId: user.id,
            subjectUserId: user.id,
            category: 'Auth',
            action: 'OAUTH_ACCOUNT_LINKED',
            resourceId: user.id,
            resourceType: 'User',
            metadata: { provider: account.provider },
          },
        });
      } catch (err) {
        console.error('[NextAuth events:linkAccount] Failed to create audit log:', err);
      }
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);


