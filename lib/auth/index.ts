import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/shared/prisma';
import { authConfig } from './auth.config';
import { PasswordHash } from './domain/PasswordHash';

// Constant-time guard: bcrypt.compare when no user found prevents timing enumeration.
const DUMMY_HASH = '$2b$12$invalidhashfortimingconstancyx00000000000000000000000u';

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
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
          select: { id: true, email: true, passwordHash: true, role: true, status: true },
        });
        if (!user?.passwordHash || user.status !== 'ACTIVE') {
          await bcrypt.compare(credentials.password, DUMMY_HASH);
          return null;
        }
        const ph = PasswordHash.fromHash(user.passwordHash);
        const valid = await ph.verify(credentials.password);
        if (!valid) return null;
        return { id: user.id, email: user.email, role: user.role };
      },
    }),
  ],
});
