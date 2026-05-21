import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/shared/prisma';
import { PasswordHash } from './domain/PasswordHash';

export const authConfig = {
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
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          select: { id: true, email: true, passwordHash: true, role: true, status: true },
        });
        // Status already checked here — signIn callback re-check is not needed
        if (!user?.passwordHash || user.status !== 'ACTIVE') return null;
        const ph = PasswordHash.fromHash(user.passwordHash);
        const valid = await ph.verify(credentials.password);
        if (!valid) return null;
        return { id: user.id, email: user.email, role: user.role };
      },
    }),
  ],
  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60,   // rolling: extend expiry once per day
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
    async session({ session, user }) {
      const typedUser = user as unknown as { id: string; role: string };
      // role is required — the authorize function always populates it from the DB.
      // If it's missing, deny the session rather than defaulting to a privileged role.
      if (!typedUser.role) return null as unknown as typeof session;
      return {
        ...session,
        user: {
          ...session.user,
          id: typedUser.id,
          role: typedUser.role,
        },
      };
    },
  },
  pages: {
    signIn: '/login',
    newUser: '/onboarding',
  },
} satisfies NextAuthConfig;
