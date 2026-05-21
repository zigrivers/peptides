'use server';

import { z } from 'zod';
import { auth } from '@/lib/auth';
import { createInvite } from '@/lib/auth/application/createInvite';

const InputSchema = z.object({
  email: z.string().email(),
});

const DOMAIN_ERRORS = new Set(['invite_email_exists', 'invite_already_pending']);

export type InviteUserError =
  | 'unauthorized'
  | 'forbidden'
  | 'validation_error'
  | 'invite_email_exists'
  | 'invite_already_pending'
  | 'system_error';

export type InviteUserResult =
  | { ok: true; inviteId: string; expiresAt: Date }
  | { ok: false; error: InviteUserError };

export async function inviteUserAction(email: unknown): Promise<InviteUserResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };
  if (session.user.role !== 'POWER_USER') return { ok: false, error: 'forbidden' };

  const parsed = InputSchema.safeParse({ email });
  if (!parsed.success) return { ok: false, error: 'validation_error' };

  try {
    const result = await createInvite({
      powerUserId: session.user.id,
      email: parsed.data.email.toLowerCase(),
    });
    return { ok: true, inviteId: result.inviteId, expiresAt: result.expiresAt };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (DOMAIN_ERRORS.has(msg)) return { ok: false, error: msg as InviteUserError };
    console.error('[inviteUserAction] internal error:', err);
    return { ok: false, error: 'system_error' };
  }
}
