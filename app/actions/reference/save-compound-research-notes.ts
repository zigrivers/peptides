'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { saveNotesInputSchema } from '@/lib/research/domain/schemas';
import { saveResearchNotes } from '@/lib/research/application/CompoundResearchNoteService';

type Result = { ok: true; savedCount: number } | { ok: false; error: string; message: string };

export async function saveCompoundResearchNotesAction(input: unknown): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized', message: 'You must be signed in.' };

  const parsed = saveNotesInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  try {
    const { savedCount } = await saveResearchNotes({ actorUserId: session.user.id, ...parsed.data });
    revalidatePath(`/reference`);
    return { ok: true, savedCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (/compound_not_found/.test(msg)) return { ok: false, error: 'compound_not_found', message: 'Compound not found.' };
    return { ok: false, error: 'unknown', message: msg };
  }
}
