'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { withAudit } from '@/lib/audit/application/withAudit';
import { getManagedUserIds } from '@/lib/tracker/application/ProtocolService';

type SetActiveVialResult =
  | { ok: true }
  | { ok: false; error: string; message: string };

/**
 * Sets the "drawing from" active vial pointer (`Vial.isActiveForCompound`) for a compound.
 *
 * Supports managed users: the actor may set the pointer for themselves OR for any user they
 * manage (same `getManagedUserIds` authorization the dose-log paths use). Every query is scoped
 * to `subjectUserId` (identity-scoping airtight).
 *
 * The mutation runs in ONE transaction via `withAudit` (mutation + AuditEvent atomic):
 *  1. capture the current active vial id (or null) for the audit's oldValues;
 *  2. set the target's flag — count-guarded `updateMany` asserts exactly one RECONSTITUTED vial
 *     owned by the subject matched (rolls back otherwise: not found / not reconstituted / raced);
 *  3. unset the flag on all other RECONSTITUTED siblings for (subject, compound).
 *
 * Idempotent: re-selecting the already-active vial still matches the count-guard (count === 1).
 */
export async function setActiveVialAction(
  subjectUserId: string,
  compoundId: string,
  vialId: string
): Promise<SetActiveVialResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'unauthorized', message: 'You must be signed in.' };
  }

  const actorUserId = session.user.id;

  if (actorUserId !== subjectUserId) {
    const managedIds = await getManagedUserIds(actorUserId);
    if (!managedIds.includes(subjectUserId)) {
      return { ok: false, error: 'unauthorized', message: 'You are not allowed to modify this user.' };
    }
  }

  try {
    await withAudit(
      async (tx) => {
        const previousActive = await tx.vial.findFirst({
          where: {
            userId: subjectUserId,
            compoundId,
            status: 'RECONSTITUTED',
            isActiveForCompound: true,
          },
          select: { id: true },
        });
        const previousActiveVialId = previousActive?.id ?? null;

        const setResult = await tx.vial.updateMany({
          where: { id: vialId, userId: subjectUserId, compoundId, status: 'RECONSTITUTED' },
          data: { isActiveForCompound: true },
        });
        if (setResult.count !== 1) {
          throw new Error('vial_not_found_or_not_reconstituted');
        }

        await tx.vial.updateMany({
          where: {
            userId: subjectUserId,
            compoundId,
            status: 'RECONSTITUTED',
            id: { not: vialId },
            isActiveForCompound: true,
          },
          data: { isActiveForCompound: false },
        });

        return { previousActiveVialId };
      },
      ({ previousActiveVialId }) => ({
        actorUserId,
        subjectUserId,
        category: 'Reconstitution' as const,
        action: 'VIAL_SET_ACTIVE' as const,
        resourceId: vialId,
        resourceType: 'Vial',
        oldValues: { previousActiveVialId },
        newValues: { vialId, compoundId },
      })
    );

    revalidatePath('/reconstitution');
    revalidatePath('/tracker');
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'vial_not_found_or_not_reconstituted') {
      return {
        ok: false,
        error: 'vial_not_found_or_not_reconstituted',
        message: 'That vial could not be set active — it may have been depleted or is not reconstituted.',
      };
    }
    return { ok: false, error: 'unknown', message: msg };
  }
}
