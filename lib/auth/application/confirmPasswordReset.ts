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
 * All passwordResetToken DB access is delegated to PasswordResetRepo (the approved
 * pre-auth boundary). The only direct DB access here is the userId-scoped user.update.
 */
export async function confirmPasswordReset(input: ConfirmPasswordResetInput): Promise<void> {
  const { rawToken, newPassword } = input;
  const tokenHash = PasswordResetToken.hash(rawToken);

  // Validate + hash BEFORE the transaction (bcrypt is slow; no point holding the TX open).
  // Throws 'password_too_short' or 'password_too_long' if rules are violated.
  const newHash = await PasswordHash.create(newPassword);

  await withAudit(
    async (tx) => {
      // Delegates atomic token claim (single-use enforcement) to the approved repo boundary.
      // Throws 'token_not_found', 'token_already_used', or 'token_expired' on failure.
      const userId = await PasswordResetRepo.claimToken(tx, tokenHash);
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newHash.toString() },
      });
      return userId;
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
