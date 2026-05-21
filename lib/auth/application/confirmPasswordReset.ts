import { PasswordResetToken } from '@/lib/auth/domain/PasswordResetToken';
import { PasswordHash } from '@/lib/auth/domain/PasswordHash';
import { withAudit } from '@/lib/audit/application/withAudit';

export interface ConfirmPasswordResetInput {
  rawToken: string;
  newPassword: string;
}

/**
 * US-AUT-04 AC-1: Validates token (single-use, 1h), updates passwordHash atomically.
 *
 * The token is consumed inside the same transaction as the password update via a
 * conditional updateMany (F-006 fix): only one concurrent caller can claim count === 1.
 * If count === 0, a fallback read distinguishes not_found / already_used / expired.
 */
export async function confirmPasswordReset(input: ConfirmPasswordResetInput): Promise<void> {
  const { rawToken, newPassword } = input;
  const tokenHash = PasswordResetToken.hash(rawToken);

  // Validate + hash BEFORE the transaction (bcrypt is slow; no point holding the TX open).
  // Throws 'password_too_short' or 'password_too_long' if rules are violated.
  const newHash = await PasswordHash.create(newPassword);

  await withAudit(
    async (tx) => {
      // Atomic single-use enforcement: atomically marks the token used and captures it.
      // updateMany returns { count: 1 } only when the token is valid and not yet consumed.
      const { count } = await tx.passwordResetToken.updateMany({
        where: { tokenHash, used: false, expiresAt: { gt: new Date() } },
        data: { used: true },
      });

      if (count === 0) {
        // Distinguish error codes for the caller via a secondary read.
        const record = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
        if (!record) throw new Error('token_not_found');
        if (record.used) throw new Error('token_already_used');
        throw new Error('token_expired');
      }

      // Record now has used = true; read to retrieve userId for the password update.
      const record = (await tx.passwordResetToken.findUnique({ where: { tokenHash } }))!;
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
