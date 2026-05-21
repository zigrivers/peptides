import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
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
        // See lib/auth/infrastructure/AuthRepository.ts and CLAUDE.md for the documented exception.
        const user = await AuthRepository.findByEmailForAuth(credentials.email.toLowerCase());
        if (!user?.passwordHash || user.status !== 'ACTIVE') {
          // Constant-time guard: prevents timing-based user enumeration.
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
