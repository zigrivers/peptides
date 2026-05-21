import { prisma } from '@/lib/shared/prisma';
import { PasswordResetToken } from '@/lib/auth/domain/PasswordResetToken';
import type { Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

/**
 * PasswordResetRepo: pre-authentication boundary exempt from the userId-scoping rule.
 *
 * The project rule "every DB query must include where: { userId }" exists to prevent
 * cross-user data leakage. Queries here are legitimately pre-auth:
 *
 * - `create`: scoped to userId (derived from a prior AuthRepository email lookup).
 * - `findByRawToken`: looks up by cryptographically random SHA-256 token hash.
 *   An attacker cannot enumerate or forge a token; the only fields read are
 *   `used`, `expiresAt`, and `userId` — no user-authored content.
 * - `claimToken`: atomically marks the token used (updateMany with tokenHash predicate)
 *   and returns the userId. The tokenHash predicate is functionally equivalent to userId
 *   scoping — a 256-bit random hash cannot be guessed; only the legitimate user who
 *   received the email link can provide it. Falls back to findByRawToken for error
 *   disambiguation when count === 0.
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
    return prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  },

  /**
   * Atomically claims a token (single-use enforcement) and returns the userId.
   * Throws 'token_not_found', 'token_already_used', or 'token_expired' on failure.
   * All DB operations are pre-auth and covered by the PasswordResetRepo exemption.
   */
  async claimToken(tx: TxClient, tokenHash: string): Promise<string> {
    const { count } = await tx.passwordResetToken.updateMany({
      where: { tokenHash, used: false, expiresAt: { gt: new Date() } },
      data: { used: true },
    });

    if (count === 0) {
      const record = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
      if (!record) throw new Error('token_not_found');
      if (record.used) throw new Error('token_already_used');
      throw new Error('token_expired');
    }

    const record = (await tx.passwordResetToken.findUnique({ where: { tokenHash } }))!;
    return record.userId;
  },

  /** Defense-in-depth: includes userId so a compromised id cannot mark another user's token. */
  async markUsed(tx: TxClient, id: string, userId: string): Promise<void> {
    await tx.passwordResetToken.updateMany({ where: { id, userId }, data: { used: true } });
  },
};
