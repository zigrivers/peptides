'use server';

import { auth } from '@/lib/auth';
import { changePassword } from '@/lib/auth/application/changePassword';

export type ChangePasswordError =
  | 'unauthenticated'
  | 'current_password_invalid'
  | 'password_too_short'
  | 'password_too_long'
  | 'password_same_as_current';

const ALLOWED_ERRORS = new Set<ChangePasswordError>([
  'current_password_invalid',
  'password_too_short',
  'password_too_long',
  'password_same_as_current',
]);

export type ChangePasswordResult =
  | { ok: true; otherSessionsRevoked: number }
  | { ok: false; error: ChangePasswordError };

export async function changePasswordAction(
  currentPassword: string,
  newPassword: string
): Promise<ChangePasswordResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'unauthenticated' };
  }

  try {
    const result = await changePassword({
      userId: session.user.id,
      currentPassword,
      newPassword,
    });
    return { ok: true, otherSessionsRevoked: result.otherSessionsRevoked };
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    const safeError: ChangePasswordError = ALLOWED_ERRORS.has(code as ChangePasswordError)
      ? (code as ChangePasswordError)
      : 'current_password_invalid';
    return { ok: false, error: safeError };
  }
}
