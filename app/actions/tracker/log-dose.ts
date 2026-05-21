'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { logDose } from '@/lib/tracker/application/DoseLogService';
import type { DoseLog, SafetyWarning, DoseAmount, DoseLogStatus, InjectionSite } from '@/lib/tracker/domain/types';

type LogDoseActionInput = {
  protocolId: string;
  scheduledDate: string; // ISO date string YYYY-MM-DD
  amount: DoseAmount;
  status: DoseLogStatus;
  injectionSite?: InjectionSite;
  note?: string;
  vialId?: string;
  idempotencyKey?: string;
};

type LogDoseActionResult =
  | { ok: true; doseLog: DoseLog; warnings: SafetyWarning[] }
  | { ok: false; error: string; message: string };

export async function logDoseAction(input: LogDoseActionInput): Promise<LogDoseActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'unauthorized', message: 'You must be signed in.' };
  }

  const actorUserId = session.user.id;
  const [year, month, day] = input.scheduledDate.split('-').map(Number);
  const scheduledDate = new Date(Date.UTC(year, month - 1, day));

  try {
    const result = await logDose({
      actorUserId,
      protocolId: input.protocolId,
      scheduledDate,
      amount: input.amount,
      status: input.status,
      injectionSite: input.injectionSite,
      note: input.note,
      vialId: input.vialId,
      idempotencyKey: input.idempotencyKey,
    });

    revalidatePath(`/tracker/protocols/${input.protocolId}`);
    revalidatePath('/tracker');
    revalidatePath('/dashboard');

    return { ok: true, doseLog: result.doseLog, warnings: result.warnings };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (/dose_log_too_late|future/i.test(msg)) {
      return { ok: false, error: 'dose_log_too_late', message: 'Cannot log a dose for a future date.' };
    }
    if (/protocol not found/i.test(msg)) {
      return { ok: false, error: 'protocol_not_found', message: msg };
    }
    return { ok: false, error: 'unknown', message: msg };
  }
}
