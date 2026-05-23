'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { upsertOutcome } from '@/lib/tracker/application/OutcomeLogService';

export interface LogOutcomeActionState {
  error?: string;
  success?: string;
}

export async function logOutcomeAction(
  _prev: LogOutcomeActionState | null,
  formData: FormData
): Promise<LogOutcomeActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' };

  const scheduledDateRaw = String(formData.get('scheduledDate') ?? '');
  const overallRatingRaw = Number(formData.get('overallRating'));
  const tagsRaw = String(formData.get('tags') ?? '');
  const note = String(formData.get('note') ?? '');
  const ratingsJson = String(formData.get('protocolRatings') ?? '[]');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDateRaw)) {
    return { error: 'Invalid date.' };
  }
  const [y, m, d] = scheduledDateRaw.split('-').map(Number);
  const scheduledDate = new Date(Date.UTC(y, m - 1, d));

  const tags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  let protocolRatings: { protocolId: string; rating: number }[] = [];
  try {
    const parsed = JSON.parse(ratingsJson);
    if (Array.isArray(parsed)) {
      protocolRatings = parsed
        .map((r) => ({
          protocolId: String(r.protocolId ?? ''),
          rating: Number(r.rating),
        }))
        .filter((r) => r.protocolId.length > 0 && Number.isFinite(r.rating));
    }
  } catch {
    return { error: 'Invalid protocol ratings payload.' };
  }

  try {
    await upsertOutcome(session.user.id, {
      scheduledDate,
      overallRating: overallRatingRaw,
      tags,
      note: note.length > 0 ? note : null,
      protocolRatings,
    });
    revalidatePath('/tracker/outcomes');
    revalidatePath('/dashboard');
    return { success: 'Outcome saved.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown_error';
    if (msg === 'protocol_not_owned') {
      return { error: 'One or more protocols are no longer available.' };
    }
    if (msg.includes('overallRating') || msg.includes('rating')) {
      return { error: 'Rating must be between 1 and 5.' };
    }
    if (msg.includes('note')) {
      return { error: 'Note must be 1000 characters or fewer.' };
    }
    return { error: 'Could not save the outcome. Please try again.' };
  }
}
