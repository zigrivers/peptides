'use server';

import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requestEmailChange } from '@/lib/auth/application/requestEmailChange';
import { createRateLimiter } from '@/lib/shared/rateLimiter';

const InputSchema = z.object({
  currentPassword: z.string(),
  newEmail: z.string().email(),
});

// 3 email-change requests per user per hour — limits verification-email spam.
const emailChangeRequestLimiter = createRateLimiter(3, 60 * 60 * 1000);

const DOMAIN_ERRORS = new Set([
  'user_not_found',
  'current_password_invalid',
  'email_same_as_current',
  'email_already_in_use',
  'rate_limited',
]);

export type RequestEmailChangeError =
  | 'unauthorized'
  | 'validation_error'
  | 'user_not_found'
  | 'current_password_invalid'
  | 'email_same_as_current'
  | 'email_already_in_use'
  | 'rate_limited'
  | 'system_error';

export type RequestEmailChangeResult =
  | { ok: true }
  | { ok: false; error: RequestEmailChangeError };

export async function requestEmailChangeAction(
  currentPassword: unknown,
  newEmail: unknown
): Promise<RequestEmailChangeResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  if (!emailChangeRequestLimiter.check(session.user.id)) {
    return { ok: false, error: 'rate_limited' };
  }

  const parsed = InputSchema.safeParse({ currentPassword, newEmail });
  if (!parsed.success) return { ok: false, error: 'validation_error' };

  try {
    await requestEmailChange({
      userId: session.user.id,
      currentPassword: parsed.data.currentPassword,
      newEmail: parsed.data.newEmail.toLowerCase(),
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (DOMAIN_ERRORS.has(msg)) return { ok: false, error: msg as RequestEmailChangeError };
    console.error('[requestEmailChangeAction] internal error:', err);
    return { ok: false, error: 'system_error' };
  }
}
