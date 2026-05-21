import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

// Edge-safe auth configuration — no Prisma, no Node.js-only modules.
// Used by middleware.ts (Edge runtime) for JWT session verification.
// The Credentials provider (which needs Prisma) lives in lib/auth/index.ts
// and is merged here at server startup via the NextAuth({ ...authConfig, providers: [...] }) call.

const isProduction = process.env.NODE_ENV === 'production';

export const authConfig = {
  providers: [
    // Edge-safe stub required to satisfy NextAuth initialization in middleware.
    // authorize() always returns null — real auth logic lives in lib/auth/index.ts
    // (Node.js runtime only, with Prisma + bcrypt). lib/auth/index.ts overrides
    // this providers array entirely when constructing the server-side NextAuth instance.
    Credentials({ credentials: {}, authorize: () => null }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  cookies: {
    sessionToken: {
      name: isProduction ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        path: '/',
      },
    },
  },
  callbacks: {
    jwt({ token, user }) {
      // Only runs on sign-in in this edge config; subsequent requests return the
      // existing token unchanged (no Prisma available in edge runtime).
      //
      // Password-version revocation is a two-layer model:
      // Layer 1 (edge middleware, here): verifies token signature + required claims.
      //   Stale JWTs pass through until Layer 2 updates the cookie.
      // Layer 2 (node runtime, lib/auth/index.ts): on every auth() call, compares
      //   token.passwordVersion against DB. On mismatch, strips id/role/passwordVersion
      //   and writes an updated cookie — subsequent middleware requests then see
      //   a token without id and redirect to login.
      // Net effect: revocation propagates within one server-component render.
      if (user) {
        token.id = user.id;
        token.role = user.role ?? null;
        token.passwordVersion = (user as { passwordVersion?: number }).passwordVersion ?? 1;
      }
      return token;
    },
    session({ session, token }) {
      if (!token.id || !token.role) {
        // Token predates required claims, is malformed, or was revoked by Layer 2
        // (id/role stripped on passwordVersion mismatch). Return base session without
        // id/role — middleware treats req.auth?.user?.id as absent → redirects to login.
        return session;
      }
      return {
        ...session,
        user: { ...session.user, id: token.id as string, role: token.role as string },
      };
    },
  },
  pages: {
    signIn: '/login',
    newUser: '/onboarding',
  },
} satisfies NextAuthConfig;
