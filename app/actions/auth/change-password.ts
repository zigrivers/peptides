'use server';

import { z } from 'zod';
import { auth } from '@/lib/auth';
import { changePassword } from '@/lib/auth/application/changePassword';

export type ChangePasswordError =
  | 'unauthenticated'
  | 'current_password_invalid'
  | 'password_too_short'
  | 'password_too_long'
  | 'password_same_as_current'
  | 'system_error';

const InputSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string(),
});

const DOMAIN_ERRORS = new Set<ChangePasswordError>([
  'current_password_invalid',
  'password_too_short',
  'password_too_long',
  'password_same_as_current',
]);

export type ChangePasswordResult =
  | { ok: true; otherSessionsRevoked: number }
  | { ok: false; error: ChangePasswordError };

export async function changePasswordAction(
  currentPassword: unknown,
  newPassword: unknown
): Promise<ChangePasswordResult> {
  const parsed = InputSchema.safeParse({ currentPassword, newPassword });
  if (!parsed.success) return { ok: false, error: 'system_error' };

  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'unauthenticated' };
  }

  try {
    const result = await changePassword({
      userId: session.user.id,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    });
    return { ok: true, otherSessionsRevoked: result.otherSessionsRevoked };
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (DOMAIN_ERRORS.has(code as ChangePasswordError)) {
      return { ok: false, error: code as ChangePasswordError };
    }
    return { ok: false, error: 'system_error' };
  }
}
