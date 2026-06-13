'use server';

import { auth } from '@/lib/auth';
import { listResearchNotes } from '@/lib/research/application/CompoundResearchNoteService';
import { isCompoundResearchEnabled } from '@/lib/ai/infrastructure/localModelClient';
import type { SavedResearchNote } from '@/lib/research/domain/types';

type Result =
  | { ok: true; enabled: boolean; notes: SavedResearchNote[] }
  | { ok: false; error: string };

export async function listCompoundResearchAction(catalogItemId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };
  const [enabled, notes] = await Promise.all([
    isCompoundResearchEnabled(),
    listResearchNotes(session.user.id, catalogItemId),
  ]);
  return { ok: true, enabled, notes };
}
