import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
// bcryptjs v3+ ships its own TypeScript definitions; @types/bcryptjs not needed.
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/shared/prisma';
import { authConfig } from './auth.config';
import { PasswordHash } from './domain/PasswordHash';
import { AuthRepository } from './infrastructure/AuthRepository';

// Pre-computed bcrypt hash (cost 12) used for constant-time response when no user is found.
// Prevents timing-based user enumeration: bcryptjs short-circuits on an obviously invalid
// hash, so using a real 60-char hash ensures comparable work to a real verify() call.
const DUMMY_HASH = '$2b$12$uBubSQ6J8844KtMFcKvLsuIqchm3gaZe0Jt3VEbqY7KWYKvZWKvgG';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  ...authConfig,
  providers: [
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
        if (!user?.passwordHash || user.status !== 'ACTIVE') {
          // Constant-time guard: prevents timing-based user enumeration.
          await bcrypt.compare(credentials.password, DUMMY_HASH);
          return null;
        }
        const ph = PasswordHash.fromHash(user.passwordHash);
        const valid = await ph.verify(credentials.password);
        if (!valid) return null;
        return { id: user.id, email: user.email, role: user.role, passwordVersion: user.passwordVersion };
      },
    }),
  ],
  callbacks: {
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
        return token;
      }

      // Subsequent requests: validate that passwordVersion in the JWT still matches
      // the DB. A mismatch means the password was changed → revoke this session by
      // removing id/role so the session callback returns a session without user.id,
      // which middleware treats as unauthenticated.
      if (token.id && typeof token.passwordVersion === 'number') {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id },
          select: { passwordVersion: true },
        });
        if (dbUser && dbUser.passwordVersion !== token.passwordVersion) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, role: _role, passwordVersion: _pv, ...rest } = token;
          return rest;
        }
      }

      return token;
    },
  },
});
