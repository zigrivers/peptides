'use server';

import { confirmPasswordReset } from '@/lib/auth/application/confirmPasswordReset';

export type ResetPasswordConfirmError =
  | 'token_not_found'
  | 'token_already_used'
  | 'token_expired'
  | 'password_too_short'
  | 'password_too_long';

const ALLOWED_ERRORS = new Set<ResetPasswordConfirmError>([
  'token_not_found',
  'token_already_used',
  'token_expired',
  'password_too_short',
  'password_too_long',
]);

export type ResetPasswordConfirmResult =
  | { ok: true }
  | { ok: false; error: ResetPasswordConfirmError };

export async function resetPasswordConfirmAction(
  rawToken: string,
  newPassword: string
): Promise<ResetPasswordConfirmResult> {
  try {
    await confirmPasswordReset({ rawToken, newPassword });
    return { ok: true };
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    const safeError: ResetPasswordConfirmError = ALLOWED_ERRORS.has(
      code as ResetPasswordConfirmError
    )
      ? (code as ResetPasswordConfirmError)
      : 'token_not_found';
    return { ok: false, error: safeError };
  }
}
