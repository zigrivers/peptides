'use server';

import { z } from 'zod';
import { auth } from '@/lib/auth';
import { resendInvite } from '@/lib/auth/application/resendInvite';

const InputSchema = z.object({
  inviteId: z.string().uuid(),
});

const DOMAIN_ERRORS = new Set(['invite_not_found', 'invite_already_accepted', 'invite_revoked', 'invite_email_exists']);

export type ResendInviteError =
  | 'unauthorized'
  | 'forbidden'
  | 'validation_error'
  | 'invite_not_found'
  | 'invite_already_accepted'
  | 'invite_revoked'
  | 'invite_email_exists'
  | 'system_error';

export type ResendInviteResult =
  | { ok: true; inviteId: string; expiresAt: Date }
  | { ok: false; error: ResendInviteError };

export async function resendInviteAction(inviteId: unknown): Promise<ResendInviteResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };
  if (session.user.role !== 'POWER_USER') return { ok: false, error: 'forbidden' };

  const parsed = InputSchema.safeParse({ inviteId });
  if (!parsed.success) return { ok: false, error: 'validation_error' };

  try {
    const result = await resendInvite({
      powerUserId: session.user.id,
      inviteId: parsed.data.inviteId,
    });
    return { ok: true, inviteId: result.inviteId, expiresAt: result.expiresAt };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (DOMAIN_ERRORS.has(msg)) return { ok: false, error: msg as ResendInviteError };
    console.error('[resendInviteAction] internal error:', err);
    return { ok: false, error: 'system_error' };
  }
}
