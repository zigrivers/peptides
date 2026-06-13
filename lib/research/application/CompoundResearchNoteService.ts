import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import { CompoundResearchNoteRepo } from '../infrastructure/CompoundResearchNoteRepo';
import type { CreateAuditEventInput } from '@/lib/audit/domain/AuditEvent';
import type { SavedResearchNote } from '../domain/types';

interface SaveInput {
  actorUserId: string;
  catalogItemId: string;
  question: string;
  answerSummary: string | null;
  approvedFindings: { claim: string; citations: { title: string; url: string }[] }[];
}

export async function saveResearchNotes(input: SaveInput): Promise<{ savedCount: number }> {
  const exists = await prisma.catalogItem.findUnique({ where: { id: input.catalogItemId }, select: { id: true } });
  if (!exists) throw new Error('compound_not_found');

  let savedCount = 0;
  for (const finding of input.approvedFindings) {
    await withAudit(
      (tx) =>
        CompoundResearchNoteRepo.createWithCitations(tx, {
          userId: input.actorUserId,
          catalogItemId: input.catalogItemId,
          question: input.question,
          answerSummary: input.answerSummary,
          claim: finding.claim,
          citations: finding.citations,
        }),
      (note): CreateAuditEventInput => ({
        actorUserId: input.actorUserId,
        subjectUserId: input.actorUserId,
        category: 'Research',
        action: 'RESEARCH_NOTE_SAVED',
        resourceId: note.id,
        resourceType: 'CompoundResearchNote',
        metadata: { catalogItemId: input.catalogItemId, citationCount: finding.citations.length },
      })
    );
    savedCount++;
  }
  return { savedCount };
}

export function listResearchNotes(userId: string, catalogItemId: string): Promise<SavedResearchNote[]> {
  return CompoundResearchNoteRepo.listForUserAndCompound(userId, catalogItemId);
}

export async function deleteResearchNote(input: { actorUserId: string; noteId: string }): Promise<{ deleted: boolean }> {
  const count = await withAudit(
    (tx) => CompoundResearchNoteRepo.deleteScoped(tx, input.noteId, input.actorUserId),
    {
      actorUserId: input.actorUserId,
      subjectUserId: input.actorUserId,
      category: 'Research',
      action: 'RESEARCH_NOTE_DELETED',
      resourceId: input.noteId,
      resourceType: 'CompoundResearchNote',
    } satisfies CreateAuditEventInput
  );
  return { deleted: count > 0 };
}
