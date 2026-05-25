'use server';

import { z } from 'zod';
import { auth } from '@/lib/auth';
import { withAudit } from '@/lib/audit/application/withAudit';

const InputSchema = z.object({
  syringeStandard: z.enum(['U100', 'U40']),
  syringeSize: z.enum(['0.3', '0.5', '1.0']),
});

export type SaveSyringePreferencesError =
  | 'unauthorized'
  | 'validation_error'
  | 'system_error';

export type SaveSyringePreferencesResult =
  | { ok: true }
  | { ok: false; error: SaveSyringePreferencesError };

export async function saveSyringePreferencesAction(
  syringeStandard: unknown,
  syringeSize: unknown
): Promise<SaveSyringePreferencesResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };

  const parsed = InputSchema.safeParse({ syringeStandard, syringeSize });
  if (!parsed.success) return { ok: false, error: 'validation_error' };

  const userId = session.user.id;

  try {
    await withAudit(
      async (tx) => {
        return tx.user.update({
          where: { id: userId },
          data: {
            syringeStandard: parsed.data.syringeStandard,
            syringeSize: parsed.data.syringeSize,
          },
        });
      },
      () => ({
        actorUserId: userId,
        category: 'Reconstitution' as const,
        action: 'SYRINGE_PREFERENCES_UPDATED' as const,
        resourceId: userId,
        resourceType: 'User',
        newValues: parsed.data,
      })
    );

    return { ok: true };
  } catch (err) {
    console.error('[saveSyringePreferencesAction] system error:', err);
    return { ok: false, error: 'system_error' };
  }
}
