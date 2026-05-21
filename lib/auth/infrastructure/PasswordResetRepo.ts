import { prisma } from '@/lib/shared/prisma';
import { PasswordResetToken } from '@/lib/auth/domain/PasswordResetToken';
import type { Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

/**
 * PasswordResetRepo: pre-authentication boundary exempt from the userId-scoping rule.
 *
 * The project rule "every DB query must include where: { userId }" exists to prevent
 * cross-user data leakage. Queries here are legitimately pre-auth:
 * - `create`: scoped to userId (known at call site from the AuthRepository email lookup).
 * - `findByRawToken` (used in confirmPasswordReset for error disambiguation): looks up by
 *   tokenHash — a cryptographically random SHA-256 value. An attacker cannot enumerate or
 *   forge a token; there is no cross-user leakage risk because the only result fields used
 *   are `used`, `expiresAt`, and `userId` — no user-authored data is returned.
 *
 * See CLAUDE.md Identity Scoping and AGENTS.md for the documented exception.
 */
export const PasswordResetRepo = {
  async create(tx: TxClient, userId: string): Promise<string> {
    const { rawToken, tokenHash } = PasswordResetToken.generate();
    const expiresAt = PasswordResetToken.expiry();
    await tx.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });
    return rawToken;
  },

  async findByRawToken(rawToken: string) {
    const tokenHash = PasswordResetToken.hash(rawToken);
    return prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  },

  /** Defense-in-depth: includes userId so a compromised id cannot mark another user's token. */
  async markUsed(tx: TxClient, id: string, userId: string): Promise<void> {
    await tx.passwordResetToken.updateMany({ where: { id, userId }, data: { used: true } });
  },
};
