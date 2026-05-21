import { prisma } from '@/lib/shared/prisma';

/**
 * AuthRepository: identity-establishment queries exempt from the userId-scoping rule.
 *
 * The project rule "every DB query must include where: { userId: session.user.id }" exists
 * to prevent cross-user data access. These queries are the mechanism BY WHICH userId is
 * established and cannot be scoped by a userId that does not yet exist in the session.
 *
 * All methods here are intentionally email-based (pre-authentication) and may only
 * select fields required for authentication — never user-authored content.
 */
export const AuthRepository = {
  /**
   * Locate a user by email for authentication. Case-insensitive to handle any
   * casing stored at registration time; the caller is expected to normalize to
   * lowercase before passing to minimize index churn.
   */
  async findByEmailForAuth(email: string) {
    return prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true, passwordHash: true, role: true, status: true },
    });
  },
};
