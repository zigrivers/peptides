import { PasswordResetToken } from '@/lib/auth/domain/PasswordResetToken';
import { PasswordResetRepo } from '@/lib/auth/infrastructure/PasswordResetRepo';
import { PasswordHash } from '@/lib/auth/domain/PasswordHash';
import { withAudit } from '@/lib/audit/application/withAudit';

export interface ConfirmPasswordResetInput {
  rawToken: string;
  newPassword: string;
}

/**
 * US-AUT-04 AC-1: Validates token (single-use, 1h), updates passwordHash atomically.
 *
 * Two-phase approach:
 * 1. Pre-fetch via PasswordResetRepo.findByRawToken (approved pre-auth boundary) — outside
 *    the transaction to get the id + userId needed for the scoped claim.
 * 2. Inside the transaction, claim via PasswordResetRepo.claimById (userId-scoped updateMany)
 *    to prevent concurrent double-consumption (TOCTOU safe: only one caller gets count === 1).
 *
 * All direct DB access is delegated to PasswordResetRepo (the documented pre-auth boundary).
 * The only non-repo DB call here is tx.user.update which is userId-scoped (id from the token).
 */
export async function confirmPasswordReset(input: ConfirmPasswordResetInput): Promise<void> {
  const { rawToken, newPassword } = input;

  // Phase 1: pre-fetch (outside transaction, approved pre-auth boundary).
  const record = await PasswordResetRepo.findByRawToken(rawToken);
  if (!record) throw new Error('token_not_found');

  // Fast-fail validation before acquiring a transaction.
  PasswordResetToken.validate(record);

  // Validate + hash BEFORE the transaction (bcrypt is slow; no point holding the TX open).
  // Throws 'password_too_short' or 'password_too_long' if rules are violated.
  const newHash = await PasswordHash.create(newPassword);

  await withAudit(
    async (tx) => {
      // Phase 2: userId-scoped atomic claim — concurrent requests get count === 0.
      const claimed = await PasswordResetRepo.claimById(tx, record.id, record.userId);
      if (!claimed) throw new Error('token_already_used');

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash: newHash.toString() },
      });

      return record.userId;
    },
    (userId: string) => ({
      actorUserId: userId,
      category: 'Auth' as const,
      action: 'PASSWORD_RESET_COMPLETED' as const,
      resourceId: userId,
      resourceType: 'User',
    })
  );
}
