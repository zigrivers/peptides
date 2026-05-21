import { prisma } from '@/lib/shared/prisma';

/**
 * AuthRepository: identity-establishment queries exempt from the userId-scoping rule.
 *
 * The project rule "every DB query must include where: { userId: session.user.id }" exists
 * to prevent cross-user data access. The query here is the mechanism BY WHICH userId is
 * established and cannot be scoped by a userId that does not yet exist in the session.
 *
 * Methods here are intentionally email-based (pre-authentication) and select only the
 * fields required for authentication — never user-authored content.
 * See CLAUDE.md Identity Scoping exception for the documented approval.
 */
export const AuthRepository = {
  /**
   * Locate a user by email for authentication.
   *
   * The caller MUST pass a lowercased email. `mode: 'insensitive'` is kept as a safety
   * net for any legacy records stored before write-time normalization was enforced (Task 1.6).
   * Once Task 1.6 is shipped and a migration normalizes existing emails, this can switch to
   * `findUnique` with a case-sensitive match for better index utilization.
   */
  async findByEmailForAuth(email: string) {
    return prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true, passwordHash: true, passwordVersion: true, role: true, status: true },
    });
  },
};
