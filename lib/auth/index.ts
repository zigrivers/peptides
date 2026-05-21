import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/shared/prisma';
import { authConfig } from './auth.config';
import { PasswordHash } from './domain/PasswordHash';

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
        // Identity Scoping exception: this is the authentication query that establishes
        // WHO the user is, so no userId scope exists yet. All other data queries must
        // include `where: { userId: session.user.id }` per the project identity-scoping rule.
        // findFirst + insensitive handles any email casing stored at registration time.
        // Registration MUST also normalize to lowercase to prevent duplicate accounts.
        const user = await prisma.user.findFirst({
          where: { email: { equals: credentials.email.toLowerCase(), mode: 'insensitive' } },
          select: { id: true, email: true, passwordHash: true, role: true, status: true },
        });
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
