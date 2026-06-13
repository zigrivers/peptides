import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const mockListForUser = vi.fn();
const mockDeleteScoped = vi.fn();
const mockFindUnique = vi.fn();
const mockWithAudit = vi.fn(async (mutation: (t: unknown) => Promise<unknown>) => mutation({} as unknown));

vi.mock('@/lib/audit/application/withAudit', () => ({ withAudit: (...a: unknown[]) => mockWithAudit(...(a as Parameters<typeof mockWithAudit>)) }));
vi.mock('@/lib/research/infrastructure/CompoundResearchNoteRepo', () => ({
  CompoundResearchNoteRepo: {
    createWithCitations: (...a: unknown[]) => mockCreate(...a),
    listForUserAndCompound: (...a: unknown[]) => mockListForUser(...a),
    deleteScoped: (...a: unknown[]) => mockDeleteScoped(...a),
  },
}));
vi.mock('@/lib/shared/prisma', () => ({
  prisma: { catalogItem: { findUnique: (...a: unknown[]) => mockFindUnique(...a) } },
}));

import { saveResearchNotes, listResearchNotes, deleteResearchNote } from '@/lib/research/application/CompoundResearchNoteService';

describe('CompoundResearchNoteService', () => {
  beforeEach(() => { vi.clearAllMocks(); mockFindUnique.mockResolvedValue({ id: 'c1' }); });

  it('saveResearchNotes writes one row per finding scoped to userId and audits', async () => {
    mockCreate.mockResolvedValue({ id: 'n1' });
    const result = await saveResearchNotes({
      actorUserId: 'u1',
      catalogItemId: 'c1',
      question: 'q',
      answerSummary: 'sum',
      approvedFindings: [
        { claim: 'claim A', citations: [{ title: 'T', url: 'https://a.com' }] },
        { claim: 'claim B', citations: [{ title: 'T2', url: 'https://b.com' }] },
      ],
    });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    const callArgs = mockCreate.mock.calls[0] as [unknown, { userId: string; catalogItemId: string; citations: unknown }];
    const dataArg = callArgs[1];
    expect(dataArg.userId).toBe('u1');
    expect(dataArg.catalogItemId).toBe('c1');
    expect(dataArg.citations).toEqual([{ title: 'T', url: 'https://a.com' }]);
    expect(mockWithAudit).toHaveBeenCalled();
    expect(result.savedCount).toBe(2);
  });

  it('saveResearchNotes throws compound_not_found when the catalog item does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(
      saveResearchNotes({ actorUserId: 'u1', catalogItemId: 'bad', question: 'q', answerSummary: null, approvedFindings: [{ claim: 'c', citations: [{ title: 't', url: 'https://a.com' }] }] })
    ).rejects.toThrow(/compound_not_found/);
  });

  it('deleteResearchNote scopes the delete by {id, userId}', async () => {
    mockDeleteScoped.mockResolvedValue(1);
    const res = await deleteResearchNote({ actorUserId: 'u1', noteId: 'n1' });
    expect(mockDeleteScoped).toHaveBeenCalledWith(expect.anything(), 'n1', 'u1');
    expect(res.deleted).toBe(true);
  });

  it('listResearchNotes scopes by userId + catalogItemId', async () => {
    mockListForUser.mockResolvedValue([]);
    await listResearchNotes('u1', 'c1');
    expect(mockListForUser).toHaveBeenCalledWith('u1', 'c1');
  });
});
