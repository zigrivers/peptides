'use server';

import { z } from 'zod';
import { verifyEmailChange } from '@/lib/auth/application/verifyEmailChange';

const InputSchema = z.object({ rawToken: z.string() });

const DOMAIN_ERRORS = new Set([
  'token_not_found',
  'token_expired',
  'token_already_used',
]);

export type VerifyEmailChangeError =
  | 'validation_error'
  | 'token_not_found'
  | 'token_expired'
  | 'token_already_used'
  | 'system_error';

export type VerifyEmailChangeResult =
  | { ok: true }
  | { ok: false; error: VerifyEmailChangeError };

export async function verifyEmailChangeAction(rawToken: unknown): Promise<VerifyEmailChangeResult> {
  const parsed = InputSchema.safeParse({ rawToken });
  if (!parsed.success) return { ok: false, error: 'validation_error' };

  try {
    await verifyEmailChange({ rawToken: parsed.data.rawToken });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (DOMAIN_ERRORS.has(msg)) return { ok: false, error: msg as VerifyEmailChangeError };
    console.error('[verifyEmailChangeAction] internal error:', err);
    return { ok: false, error: 'system_error' };
  }
}
