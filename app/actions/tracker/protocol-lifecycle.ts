'use server';

import { z } from 'zod';
import { auth } from '@/lib/auth';
import {
  pauseProtocol,
  resumeProtocol,
  cloneProtocol,
  deactivateProtocol,
} from '@/lib/tracker/application/ProtocolService';
import { revalidatePath } from 'next/cache';

const ProtocolIdSchema = z.object({ protocolId: z.string().uuid() });

export type LifecycleResult =
  | { ok: true; protocolId: string }
  | { ok: false; error: 'unauthorized' | 'not_found' | 'invalid_transition' | 'system_error'; message?: string };

async function runLifecycle(
  rawInput: unknown,
  fn: (actorUserId: string, protocolId: string) => Promise<{ id: string }>
): Promise<LifecycleResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  const parsed = ProtocolIdSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_transition', message: parsed.error.message };

  try {
    const result = await fn(session.user.id, parsed.data.protocolId);
    revalidatePath('/tracker');
    revalidatePath('/regimen');
    revalidatePath('/dashboard');
    revalidatePath(`/tracker/protocols/${result.id}`);
    return { ok: true, protocolId: result.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/not found/i.test(msg)) return { ok: false, error: 'not_found' };
    if (/paused|resumed|deactivated|already|not paused|completed|cannot/i.test(msg)) {
      return { ok: false, error: 'invalid_transition', message: msg };
    }
    console.error('[protocol-lifecycle] error:', err);
    return { ok: false, error: 'system_error' };
  }
}

export async function pauseProtocolAction(rawInput: unknown): Promise<LifecycleResult> {
  return runLifecycle(rawInput, (actorUserId, protocolId) =>
    pauseProtocol({ actorUserId, protocolId })
  );
}

export async function resumeProtocolAction(rawInput: unknown): Promise<LifecycleResult> {
  return runLifecycle(rawInput, (actorUserId, protocolId) =>
    resumeProtocol({ actorUserId, protocolId })
  );
}

export async function deactivateProtocolAction(rawInput: unknown): Promise<LifecycleResult> {
  return runLifecycle(rawInput, (actorUserId, protocolId) =>
    deactivateProtocol({ actorUserId, protocolId })
  );
}

const CloneSchema = z.object({
  protocolId: z.string().uuid(),
  newStartDate: z.coerce.date(),
});

export async function cloneProtocolAction(rawInput: unknown): Promise<LifecycleResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  const parsed = CloneSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_transition', message: parsed.error.message };
  }

  try {
    const result = await cloneProtocol({
      actorUserId: session.user.id,
      protocolId: parsed.data.protocolId,
      newStartDate: parsed.data.newStartDate,
    });
    revalidatePath('/tracker');
    revalidatePath('/regimen');
    revalidatePath('/dashboard');
    revalidatePath(`/tracker/protocols/${result.id}`);
    return { ok: true, protocolId: result.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/not found/i.test(msg)) return { ok: false, error: 'not_found' };
    if (/cannot clone|deactivated/i.test(msg)) return { ok: false, error: 'invalid_transition', message: msg };
    console.error('[cloneProtocolAction] error:', err);
    return { ok: false, error: 'system_error' };
  }
}
