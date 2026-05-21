import { PasswordResetToken } from '@/lib/auth/domain/PasswordResetToken';
import { PasswordResetRepo } from '@/lib/auth/infrastructure/PasswordResetRepo';
import { PasswordHash } from '@/lib/auth/domain/PasswordHash';
import { withAudit } from '@/lib/audit/application/withAudit';

export interface ConfirmPasswordResetInput {
  rawToken: string;
  newPassword: string;
}

/**
 * US-AUT-04 AC-1: Validates token (single-use, 1h), updates passwordHash, marks token used.
 * All three operations run in a single transaction via withAudit.
 */
export async function confirmPasswordReset(input: ConfirmPasswordResetInput): Promise<void> {
  const { rawToken, newPassword } = input;

  const record = await PasswordResetRepo.findByRawToken(rawToken);
  if (!record) throw new Error('token_not_found');

  PasswordResetToken.validate(record);

  // PasswordHash.create throws 'password_too_short' if < 12 chars (mirrors registration rule).
  const newHash = await PasswordHash.create(newPassword);

  await withAudit(
    async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash: newHash.toString() },
      });
      await PasswordResetRepo.markUsed(tx, record.id);
    },
    {
      actorUserId: record.userId,
      category: 'Auth',
      action: 'PASSWORD_RESET_COMPLETED',
      resourceId: record.userId,
      resourceType: 'User',
    }
  );
}
