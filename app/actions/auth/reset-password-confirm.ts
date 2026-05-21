'use server';

import { z } from 'zod';
import { confirmPasswordReset } from '@/lib/auth/application/confirmPasswordReset';

export type ResetPasswordConfirmError =
  | 'token_not_found'
  | 'token_already_used'
  | 'token_expired'
  | 'password_too_short'
  | 'password_too_long'
  | 'system_error';

const InputSchema = z.object({
  rawToken: z.string(),
  newPassword: z.string(),
});

const DOMAIN_ERRORS = new Set<ResetPasswordConfirmError>([
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
  rawToken: unknown,
  newPassword: unknown
): Promise<ResetPasswordConfirmResult> {
  const parsed = InputSchema.safeParse({ rawToken, newPassword });
  if (!parsed.success) return { ok: false, error: 'system_error' };

  try {
    await confirmPasswordReset({ rawToken: parsed.data.rawToken, newPassword: parsed.data.newPassword });
    return { ok: true };
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (DOMAIN_ERRORS.has(code as ResetPasswordConfirmError)) {
      return { ok: false, error: code as ResetPasswordConfirmError };
    }
    return { ok: false, error: 'system_error' };
  }
}
