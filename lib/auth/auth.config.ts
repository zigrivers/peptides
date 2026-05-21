import type { NextAuthConfig } from 'next-auth';

// Edge-safe auth configuration — no Prisma, no Node.js-only modules.
// Used by middleware.ts (Edge runtime) for JWT session verification.
// The Credentials provider (which needs Prisma) lives in lib/auth/index.ts
// and is merged here at server startup via the NextAuth({ ...authConfig, providers: [...] }) call.

export const authConfig = {
  providers: [], // Credentials merged in lib/auth/index.ts (Node.js runtime only)
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  callbacks: {
    jwt({ token, user }) {
      // Only runs on sign-in; subsequent calls return the existing token.
      if (user) {
        token.id = user.id;
        token.role = (user as { id: string; role?: string }).role ?? null;
      }
      return token;
    },
    session({ session, token }) {
      // role is required — deny session if missing rather than defaulting to a privileged role.
      if (!token.id || !token.role) return null as unknown as typeof session;
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
