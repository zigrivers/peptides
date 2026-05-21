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
      // Only runs on sign-in; subsequent calls return the existing token.
      if (user) {
        token.id = user.id;
        token.role = (user as { id: string; role?: string }).role ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (!token.id || !token.role) {
        // Token is missing required claims — treat as an invalid session.
        throw new Error('Session token is missing required claims');
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
