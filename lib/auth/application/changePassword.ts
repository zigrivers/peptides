import { prisma } from '@/lib/shared/prisma';
import { PasswordHash } from '@/lib/auth/domain/PasswordHash';
import { withAudit } from '@/lib/audit/application/withAudit';

export interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordResult {
  otherSessionsRevoked: number;
}

/**
 * US-AUT-06: Change own password (authenticated flow).
 *
 * Security §3.2 field-leak rule: if currentPassword is wrong, always throw
 * 'current_password_invalid' — even if newPassword would also be invalid.
 * This prevents an attacker from learning whether the newPassword rules are met.
 */
export async function changePassword(input: ChangePasswordInput): Promise<ChangePasswordResult> {
  const { userId, currentPassword, newPassword } = input;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user?.passwordHash) throw new Error('user_not_found');

  const currentHash = PasswordHash.fromHash(user.passwordHash);
  const isCurrentValid = await currentHash.verify(currentPassword);

  // Verify current password first — always throw current_password_invalid on failure
  // regardless of whether newPassword is also invalid (field-leak prevention).
  if (!isCurrentValid) throw new Error('current_password_invalid');

  if (newPassword.length < 12) throw new Error('password_too_short');

  const isSame = await currentHash.verify(newPassword);
  if (isSame) throw new Error('password_same_as_current');

  // PasswordHash.create throws 'password_too_short' (redundant guard) and 'password_too_long'.
  const newHash = await PasswordHash.create(newPassword);

  await withAudit(
    async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash: newHash.toString() } });
    },
    {
      actorUserId: userId,
      category: 'Auth',
      action: 'PASSWORD_CHANGED',
      resourceId: userId,
      resourceType: 'User',
    }
  );

  // JWT sessions have no server-side records to revoke. Revocation requires an
  // edge-compatible KV store (Upstash) as noted in lib/auth/index.ts.
  // TODO (Task 1.4 follow-up): implement KV-based JWT revocation list.
  return { otherSessionsRevoked: 0 };
}
