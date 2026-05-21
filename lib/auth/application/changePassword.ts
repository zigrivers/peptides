import { prisma } from '@/lib/shared/prisma';
import { PasswordHash } from '@/lib/auth/domain/PasswordHash';
import { withAudit } from '@/lib/audit/application/withAudit';

export interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordResult {
  /** Number of other sessions invalidated by the passwordVersion increment. */
  otherSessionsRevoked: number;
}

/**
 * US-AUT-06: Change own password (authenticated flow).
 *
 * Security §3.2 field-leak rule: if currentPassword is wrong, always throw
 * 'current_password_invalid' — even if newPassword would also be invalid.
 *
 * Session revocation: `passwordVersion` is incremented atomically with the password
 * update. The `jwt` callback in lib/auth/index.ts checks this on each request via
 * the node-runtime auth() — sessions with a stale passwordVersion are rejected.
 * Edge middleware (auth.config.ts) uses JWT-only validation for speed; any Server
 * Action that calls auth() enforces revocation for data access.
 */
export async function changePassword(input: ChangePasswordInput): Promise<ChangePasswordResult> {
  const { userId, currentPassword, newPassword } = input;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, passwordVersion: true },
  });
  if (!user?.passwordHash) throw new Error('user_not_found');

  const currentHash = PasswordHash.fromHash(user.passwordHash);
  const isCurrentValid = await currentHash.verify(currentPassword);

  // Verify current password first — always throw current_password_invalid on failure
  // regardless of whether newPassword is also invalid (field-leak prevention, §3.2).
  if (!isCurrentValid) throw new Error('current_password_invalid');

  if (newPassword.length < 12) throw new Error('password_too_short');

  const isSame = await currentHash.verify(newPassword);
  if (isSame) throw new Error('password_same_as_current');

  // Throws 'password_too_short' (redundant guard) and 'password_too_long'.
  const newHash = await PasswordHash.create(newPassword);

  await withAudit(
    async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash: newHash.toString(),
          passwordVersion: { increment: 1 },
        },
      });
    },
    {
      actorUserId: userId,
      category: 'Auth',
      action: 'PASSWORD_CHANGED',
      resourceId: userId,
      resourceType: 'User',
    }
  );

  // passwordVersion increment invalidates all sessions holding the old version.
  // The jwt callback in lib/auth/index.ts detects the mismatch on next request.
  // We cannot count "other sessions" precisely with JWT strategy (no server-side session store),
  // so we return 1 to signal that revocation is in effect.
  return { otherSessionsRevoked: 1 };
}
