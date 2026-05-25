'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/shared/prisma';

const InputSchema = z.object({
  vialIds: z.array(z.string()),
});

type ReorderVialsResult =
  | { ok: true }
  | { ok: false; error: string; message: string };

export async function reorderVialsAction(input: unknown): Promise<ReorderVialsResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'unauthorized', message: 'You must be signed in.' };
  }

  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const { vialIds } = parsed.data;
  const userId = session.user.id;

  if (new Set(vialIds).size !== vialIds.length) {
    return { ok: false, error: 'invalid_vial_ids_list', message: 'Duplicates not allowed.' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Read active vials inside the transaction with a stable display ordering (F-003, F-006)
      const activeVials = await tx.vial.findMany({
        where: { userId, status: 'RECONSTITUTED' },
        orderBy: [{ shelfOrder: 'asc' }, { expiresAt: 'asc' }],
        select: { id: true }
      });

      if (activeVials.length > 50) {
        throw new Error('exceeds_maximum_vials_limit');
      }

      const activeIds = new Set(activeVials.map((v) => v.id));
      const uniqueProvided = new Set(vialIds.filter((id) => activeIds.has(id)));

      // Create final ordering by matching intersection and appending omitted active vials
      const orderedIds = vialIds.filter((id) => activeIds.has(id) && uniqueProvided.delete(id));
      const omittedIds = activeVials.map((v) => v.id).filter((id) => !orderedIds.includes(id));
      const finalOrder = [...orderedIds, ...omittedIds];

      // Perform re-indexing updates carrying 'status: RECONSTITUTED' for defence-in-depth safety (F-006)
      await Promise.all(
        finalOrder.map((id, index) =>
          tx.vial.updateMany({
            where: { id, userId, status: 'RECONSTITUTED' },
            data: { shelfOrder: index },
          })
        )
      );

      // Write audit event inside the transaction
      await tx.auditEvent.create({
        data: {
          actorUserId: userId,
          subjectUserId: userId,
          category: 'Reconstitution',
          action: 'VIALS_REORDERED',
          resourceId: userId,
          resourceType: 'Vial',
          newValues: {
            vialIds: finalOrder,
          },
        },
      });
    });

    revalidatePath('/reconstitution');
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'exceeds_maximum_vials_limit') {
      return { ok: false, error: 'exceeds_maximum_vials_limit', message: 'Reordering active vials limit of 50 has been exceeded.' };
    }
    return { ok: false, error: 'unknown', message: msg };
  }
}
