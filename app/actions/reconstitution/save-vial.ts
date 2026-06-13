'use server';

import { auth } from '@/lib/auth';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { saveVial } from '@/lib/reconstitution/application/VialService';
import { revalidatePath } from 'next/cache';
import { isAuthorizedSubject } from '@/lib/tracker/application/ProtocolService';

function isPositiveDecimal(v: string): boolean {
  try {
    return new Decimal(v).gt(0);
  } catch {
    return false;
  }
}

const schema = z.object({
  compoundId: z.string().min(1),
  totalMg: z.string().refine(isPositiveDecimal, 'Must be a positive number'),
  bacWaterMl: z.string().refine(isPositiveDecimal, 'Must be a positive number'),
  expiresAt: z.string().date().optional(),
  subjectUserId: z.string().uuid().optional(),
});

export async function saveVialAction(data: {
  compoundId: string;
  totalMg: string;
  bacWaterMl: string;
  expiresAt?: string;
  subjectUserId?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    return { ok: false, error: firstError ?? 'Invalid input' };
  }

  let targetUserId = session.user.id;
  if (parsed.data.subjectUserId && parsed.data.subjectUserId !== session.user.id) {
    const authorized = await isAuthorizedSubject(session.user.id, parsed.data.subjectUserId);
    if (!authorized) {
      return { ok: false, error: 'Unauthorized for this subject' };
    }
    targetUserId = parsed.data.subjectUserId;
  }

  try {
    const vial = await saveVial({
      userId: targetUserId,
      compoundId: parsed.data.compoundId,
      totalMg: new Decimal(parsed.data.totalMg),
      bacWaterMl: new Decimal(parsed.data.bacWaterMl),
      expiresAt: parsed.data.expiresAt ? new Date(`${parsed.data.expiresAt}T00:00:00Z`) : undefined,
    });

    revalidatePath('/reconstitution');
    return { ok: true, id: vial.id };
  } catch (err) {
    console.error('[saveVialAction]', err);
    return { ok: false, error: 'Could not save vial. Please try again.' };
  }
}
