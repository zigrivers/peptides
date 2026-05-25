'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { parseStrictUTCDate, utcMidnightToday } from '@/lib/shared/date';
import { logDose } from '@/lib/tracker/application/DoseLogService';
import type { DoseLog, SafetyWarning } from '@/lib/tracker/domain/types';

const InjectionSiteSchema = z.object({
  bodyPart: z.string().min(1),
  side: z.enum(['left', 'right']),
});

const InputSchema = z.object({
  protocolId: z.string().min(1),
  amount: z.object({
    amount: z.string(),
    unit: z.enum(['mcg', 'mg', 'IU', 'mL']),
  }),
  status: z.enum(['LOGGED', 'SKIPPED']),
  injectionSite: InjectionSiteSchema.optional(),
  note: z.string().max(1000).optional(),
  vialId: z.string().optional(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (must be YYYY-MM-DD)').optional(),
});

type LogDoseActionResult =
  | { ok: true; doseLog: DoseLog; warnings: SafetyWarning[] }
  | { ok: false; error: string; message: string };

export async function logDoseAction(input: unknown): Promise<LogDoseActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'unauthorized', message: 'You must be signed in.' };
  }

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const { protocolId, amount, status, injectionSite, note, vialId, scheduledDate: inputScheduledDate } = parsed.data;
  const actorUserId = session.user.id;

  let scheduledDate: Date;
  if (inputScheduledDate) {
    const parsedDate = parseStrictUTCDate(inputScheduledDate);
    if (!parsedDate) {
      return { ok: false, error: 'invalid_input', message: 'Invalid scheduled date value.' };
    }
    scheduledDate = parsedDate;
  } else {
    scheduledDate = utcMidnightToday();
  }

  try {
    const result = await logDose({
      actorUserId,
      protocolId,
      scheduledDate,
      amount,
      status,
      injectionSite,
      note,
      vialId,
      requireInjectionSite: true,
    });

    revalidatePath(`/tracker/protocols/${protocolId}`);
    revalidatePath('/tracker');
    revalidatePath('/dashboard');

    return { ok: true, doseLog: result.doseLog, warnings: result.warnings };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (/dose_log_too_late|future/i.test(msg)) {
      return { ok: false, error: 'dose_log_too_late', message: 'Cannot log a dose for a future date.' };
    }
    if (/dose_log_off_schedule/i.test(msg)) {
      return { ok: false, error: 'dose_log_off_schedule', message: 'Cannot log a dose for an off-schedule date.' };
    }
    if (/invalid_injection_site/i.test(msg)) {
      return { ok: false, error: 'invalid_injection_site', message: 'Invalid injection site for this protocol route.' };
    }
    if (/injection_site_required/i.test(msg)) {
      return { ok: false, error: 'injection_site_required', message: 'Please select an injection site before logging.' };
    }
    if (/protocol not found/i.test(msg)) {
      return { ok: false, error: 'protocol_not_found', message: msg };
    }
    if (/protocol is not active/i.test(msg)) {
      return { ok: false, error: 'protocol_not_active', message: msg };
    }
    return { ok: false, error: 'unknown', message: msg };
  }
}
