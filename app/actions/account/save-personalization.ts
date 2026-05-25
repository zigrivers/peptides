'use server';

import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { personalizationSchema } from '@/lib/shared/personalization';
import { updatePersonalizationSettings } from '@/lib/shared/personalization.server';

export async function savePersonalizationAction(input: unknown) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'unauthorized' };
  }

  const parsed = personalizationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'validation_error' };
  }

  const userId = session.user.id;

  try {
    const result = await updatePersonalizationSettings(userId, parsed.data);
    if (!result) {
      return { ok: false, error: 'system_error' };
    }

    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (err) {
    console.error('[savePersonalizationAction] system error:', err);
    return { ok: false, error: 'system_error' };
  }
}
