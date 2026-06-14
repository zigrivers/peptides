import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import type { DoseTier, ResearchSectionType, SavedResearchNote } from '../domain/types';

interface SectionInput {
  type: ResearchSectionType;
  content: string;
  tier: DoseTier | null;
  citations: { title: string; url: string }[];
}

export const CompoundResearchNoteRepo = {
  createNoteWithSections(
    tx: Prisma.TransactionClient,
    data: { userId: string; catalogItemId: string; question: string; sections: SectionInput[] }
  ) {
    return tx.compoundResearchNote.create({
      data: {
        userId: data.userId,
        catalogItemId: data.catalogItemId,
        question: data.question,
        claim: null,
        answerSummary: null,
        sections: {
          create: data.sections.map((s, i) => ({
            type: s.type,
            content: s.content,
            tier: s.tier ?? null,
            order: i,
            citations: { create: s.citations },
          })),
        },
      },
    });
  },

  async listForUserAndCompound(userId: string, catalogItemId: string): Promise<SavedResearchNote[]> {
    const rows = await prisma.compoundResearchNote.findMany({
      where: { userId, catalogItemId },
      orderBy: { createdAt: 'desc' },
      include: {
        citations: { select: { id: true, title: true, url: true } },
        sections: {
          orderBy: { order: 'asc' },
          include: { citations: { select: { id: true, title: true, url: true } } },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      question: r.question,
      createdAt: r.createdAt.toISOString(),
      claim: r.claim,
      answerSummary: r.answerSummary,
      citations: r.citations,
      sections: r.sections.map((s) => ({
        id: s.id,
        type: s.type as ResearchSectionType,
        content: s.content,
        tier: (s.tier as DoseTier | null) ?? null,
        order: s.order,
        citations: s.citations,
      })),
    }));
  },

  async deleteScoped(tx: Prisma.TransactionClient, noteId: string, userId: string): Promise<number> {
    const res = await tx.compoundResearchNote.deleteMany({ where: { id: noteId, userId } });
    return res.count; // sections + section-citations removed by FK cascade
  },
};
