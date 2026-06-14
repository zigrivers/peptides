import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import type { SavedResearchNote } from '../domain/types';

export const CompoundResearchNoteRepo = {
  createWithCitations(
    tx: Prisma.TransactionClient,
    data: {
      userId: string;
      catalogItemId: string;
      question: string;
      answerSummary: string | null;
      claim: string;
      citations: { title: string; url: string }[];
    }
  ) {
    return tx.compoundResearchNote.create({
      data: {
        userId: data.userId,
        catalogItemId: data.catalogItemId,
        question: data.question,
        answerSummary: data.answerSummary,
        claim: data.claim,
        citations: { create: data.citations },
      },
    });
  },

  async listForUserAndCompound(userId: string, catalogItemId: string): Promise<SavedResearchNote[]> {
    const rows = await prisma.compoundResearchNote.findMany({
      where: { userId, catalogItemId },
      orderBy: { createdAt: 'desc' },
      include: { citations: { select: { id: true, title: true, url: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      question: r.question,
      answerSummary: r.answerSummary,
      claim: r.claim,
      sections: [], // populated in Task 5 when per-section persistence is added
      citations: r.citations,
      createdAt: r.createdAt.toISOString(),
    }));
  },

  async deleteScoped(tx: Prisma.TransactionClient, noteId: string, userId: string): Promise<number> {
    const res = await tx.compoundResearchNote.deleteMany({ where: { id: noteId, userId } });
    return res.count;
  },
};
