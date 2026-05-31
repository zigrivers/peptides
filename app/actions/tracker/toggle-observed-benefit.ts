'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { withAudit } from '@/lib/audit/application/withAudit';

const InputSchema = z.object({
  protocolId: z.string().uuid(),
  week: z.number().int().positive(),
  benefitText: z.string().min(1).max(1000),
});

type ToggleActionResult =
  | { ok: true; observedBenefits: string[] }
  | { ok: false; error: string; message: string };

export async function toggleObservedBenefitAction(input: unknown): Promise<ToggleActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'unauthorized', message: 'You must be signed in.' };
  }

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const { protocolId, week, benefitText } = parsed.data;
  const actorUserId = session.user.id;

  try {
    const result = await withAudit(async (tx) => {
      // 1. Fetch protocol and enforce security ownership boundary
      const protocol = await tx.protocol.findFirst({
        where: {
          id: protocolId,
          OR: [
            { userId: actorUserId },
            { user: { managedBy: actorUserId } }
          ]
        },
        select: {
          id: true,
          userId: true,
          observedBenefits: true,
        },
      });

      if (!protocol) {
        throw new Error('protocol_not_found');
      }

      // 2. Toggle observed benefit key: format is "week:benefitText"
      const key = `${week}:${benefitText}`;
      const currentList: string[] = Array.isArray(protocol.observedBenefits)
        ? (protocol.observedBenefits as string[])
        : [];
      
      const isObserved = currentList.includes(key);
      const newList = isObserved
        ? currentList.filter((x) => x !== key)
        : [...currentList, key];

      // 3. Persist update using a scoped predicate
      const updateResult = await tx.protocol.updateMany({
        where: {
          id: protocolId,
          OR: [
            { userId: actorUserId },
            { user: { managedBy: actorUserId } }
          ]
        },
        data: { observedBenefits: newList },
      });

      if (updateResult.count !== 1) {
        throw new Error('protocol_not_found');
      }

      return {
        observedBenefits: newList,
        oldList: currentList,
        subjectUserId: protocol.userId,
      };
    }, (res) => ({
      actorUserId,
      subjectUserId: res.subjectUserId,
      category: 'Protocol',
      action: 'OBSERVED_BENEFIT_TOGGLED',
      resourceId: protocolId,
      resourceType: 'Protocol',
      oldValues: { observedBenefits: res.oldList },
      newValues: { observedBenefits: res.observedBenefits },
    }));

    revalidatePath('/tracker');
    revalidatePath('/dashboard');

    return { ok: true, observedBenefits: result.observedBenefits };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'protocol_not_found') {
      return { ok: false, error: 'protocol_not_found', message: 'Protocol not found.' };
    }
    if (msg === 'unauthorized') {
      return { ok: false, error: 'unauthorized', message: 'You are not authorized to update this protocol.' };
    }
    return { ok: false, error: 'system_error', message: msg };
  }
}
