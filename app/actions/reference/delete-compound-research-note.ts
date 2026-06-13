'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { deleteResearchNote } from '@/lib/research/application/CompoundResearchNoteService';

const schema = z.object({ noteId: z.string().min(1) });
type Result = { ok: true; deleted: boolean } | { ok: false; error: string; message: string };

export async function deleteCompoundResearchNoteAction(input: unknown): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized', message: 'You must be signed in.' };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: 'Invalid input.' };
  try {
    const { deleted } = await deleteResearchNote({ actorUserId: session.user.id, noteId: parsed.data.noteId });
    revalidatePath('/reference');
    return { ok: true, deleted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: 'unknown', message: msg };
  }
}
