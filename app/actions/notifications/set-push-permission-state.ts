'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { setPushPermissionState } from '@/lib/notifications/application/ReminderService';
import type { PushPermissionState } from '@/lib/notifications/domain/types';

export interface SetPushPermissionStateResult {
  ok: boolean;
  error?: string;
}

const VALID: ReadonlySet<PushPermissionState> = new Set(['NOT_PROMPTED', 'GRANTED', 'DENIED']);

export async function setPushPermissionStateAction(state: string): Promise<SetPushPermissionStateResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  if (!VALID.has(state as PushPermissionState)) {
    return { ok: false, error: 'invalid_state' };
  }

  try {
    await setPushPermissionState(session.user.id, state as PushPermissionState);
    revalidatePath('/settings');
    return { ok: true };
  } catch {
    return { ok: false, error: 'update_failed' };
  }
}
