'use server';

import { z } from 'zod';
import { revertEmailChange } from '@/lib/auth/application/revertEmailChange';

const InputSchema = z.object({ rawToken: z.string() });

const DOMAIN_ERRORS = new Set([
  'token_not_found',
  'token_expired',
  'token_already_used',
  'email_already_in_use',
]);

export type RevertEmailChangeError =
  | 'validation_error'
  | 'token_not_found'
  | 'token_expired'
  | 'token_already_used'
  | 'email_already_in_use'
  | 'system_error';

export type RevertEmailChangeResult =
  | { ok: true }
  | { ok: false; error: RevertEmailChangeError };

export async function revertEmailChangeAction(rawToken: unknown): Promise<RevertEmailChangeResult> {
  const parsed = InputSchema.safeParse({ rawToken });
  if (!parsed.success) return { ok: false, error: 'validation_error' };

  try {
    await revertEmailChange({ rawToken: parsed.data.rawToken });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (DOMAIN_ERRORS.has(msg)) return { ok: false, error: msg as RevertEmailChangeError };
    console.error('[revertEmailChangeAction] internal error:', err);
    return { ok: false, error: 'system_error' };
  }
}
