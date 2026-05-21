import { prisma } from '@/lib/shared/prisma';
import { PasswordResetToken } from '@/lib/auth/domain/PasswordResetToken';
import type { Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

/**
 * PasswordResetRepo: pre-authentication boundary exempt from the userId-scoping rule.
 *
 * The project rule "every DB query must include where: { userId }" exists to prevent
 * cross-user data leakage. Methods here are legitimately pre-auth:
 *
 * - `create`: scoped to userId (derived from a prior AuthRepository email lookup).
 * - `findByRawToken`: pre-auth lookup by unforgeable SHA-256 token hash. Returns only
 *   `id`, `userId`, `used`, and `expiresAt` — no user-authored content.
 * - `claimById`: atomically marks the token used via `updateMany` WHERE `{ id, userId, used: false }`.
 *   Both `id` (specific record) and `userId` (domain scoping) are in the predicate.
 * - `markUsed`: includes userId in the predicate (defense-in-depth).
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
    return prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, used: true, expiresAt: true },
    });
  },

  /**
   * Atomically claims a token by id + userId (userId-scoped updateMany).
   * Returns `true` if claimed, `false` if already used or expired since pre-fetch.
   * Must be called inside a transaction after a `findByRawToken` pre-fetch.
   */
  async claimById(tx: TxClient, id: string, userId: string): Promise<boolean> {
    const { count } = await tx.passwordResetToken.updateMany({
      where: { id, userId, used: false, expiresAt: { gt: new Date() } },
      data: { used: true },
    });
    return count === 1;
  },

  /** Defense-in-depth: includes userId so a compromised id cannot mark another user's token. */
  async markUsed(tx: TxClient, id: string, userId: string): Promise<void> {
    await tx.passwordResetToken.updateMany({ where: { id, userId }, data: { used: true } });
  },
};
