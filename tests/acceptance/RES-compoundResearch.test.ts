import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetLocalModel = vi.fn();
const mockResolveModelId = vi.fn();
const mockWebSearch = vi.fn();
const mockTry = vi.fn();
const mockAuditCreate = vi.fn();

vi.mock('@/lib/ai/infrastructure/localModelClient', () => ({
  getLocalModel: (...a: unknown[]) => mockGetLocalModel(...a),
  resolveLocalModelId: (...a: unknown[]) => mockResolveModelId(...a),
}));
vi.mock('@/lib/research/infrastructure/webSearch', () => ({ webSearch: (...a: unknown[]) => mockWebSearch(...a) }));
vi.mock('@/lib/research/application/localStructuredOutput', () => ({
  tryGenerateObjectOrParse: (...a: unknown[]) => mockTry(...a),
}));
vi.mock('@/lib/audit/infrastructure/PrismaAuditRepo', () => ({
  PrismaAuditRepo: { create: (...a: unknown[]) => mockAuditCreate(...a) },
}));
vi.mock('@/lib/shared/prisma', () => ({ prisma: { _isMockPrisma: true } }));

import { runCompoundResearch } from '@/lib/research/application/compoundResearch';

describe('runCompoundResearch', () => {
  beforeEach(() => {
    mockGetLocalModel.mockReset(); mockWebSearch.mockReset(); mockTry.mockReset(); mockAuditCreate.mockReset();
    mockGetLocalModel.mockResolvedValue({} as never);
    mockAuditCreate.mockResolvedValue(undefined);
  });

  it('plans queries, searches, synthesizes, and keeps only cited claims', async () => {
    mockTry
      .mockResolvedValueOnce({ queries: ['bpc-157 tendon healing'] }) // plan
      .mockResolvedValueOnce({                                         // synthesize
        summary: 'BPC-157 may support tendon healing in animal models.',
        findings: [
          { claim: 'Accelerated tendon healing in rats.', sourceUrls: ['https://a.com/study'] },
          { claim: 'Hallucinated claim.', sourceUrls: ['https://not-fetched.com'] },
        ],
        sourcesUsed: [{ title: 'Study', url: 'https://a.com/study' }],
      });
    mockWebSearch.mockResolvedValue([{ title: 'Study', url: 'https://a.com/study', snippet: 's', content: 'c' }]);

    const events: unknown[] = [];
    const res = await runCompoundResearch(
      { catalogItemId: 'c1', compoundName: 'BPC-157', profileSummary: '', question: 'Does it help tendons?', actorUserId: 'u1' },
      (e) => events.push(e)
    );

    expect(res.findings).toHaveLength(1);                       // hallucinated claim dropped
    expect(res.findings[0].claim).toMatch(/tendon healing in rats/i);
    expect(res.findings[0].sourceUrls).toEqual(['https://a.com/study']);
    expect(res.sourcesUsed).toEqual([{ title: 'Study', url: 'https://a.com/study' }]); // pruned to referenced
    expect((events as { phase: string }[]).map((e) => e.phase)).toEqual(['planning', 'searching', 'synthesizing', 'result']);
    expect(mockAuditCreate).toHaveBeenCalled();                 // initiated audit
    const auditCalls = JSON.stringify(mockAuditCreate.mock.calls);
    expect(auditCalls).not.toContain('tendons');                // no prompt content in audit
  });

  it('drops findings containing disallowed phrases', async () => {
    mockTry
      .mockResolvedValueOnce({ queries: ['q'] })
      .mockResolvedValueOnce({
        summary: 'ok summary',
        findings: [{ claim: 'This is FDA-approved for healing.', sourceUrls: ['https://a.com'] }],
        sourcesUsed: [{ title: 'S', url: 'https://a.com' }],
      });
    mockWebSearch.mockResolvedValue([{ title: 'S', url: 'https://a.com', snippet: 's' }]);
    const res = await runCompoundResearch(
      { catalogItemId: 'c1', compoundName: 'X', profileSummary: '', question: 'q', actorUserId: 'u1' },
      () => {}
    );
    expect(res.findings).toHaveLength(0);
  });

  it('throws a typed error and emits failed audit when the local model is unavailable', async () => {
    mockGetLocalModel.mockResolvedValue(null);
    await expect(
      runCompoundResearch({ catalogItemId: 'c1', compoundName: 'X', profileSummary: '', question: 'q', actorUserId: 'u1' }, () => {})
    ).rejects.toThrow(/local_model_unavailable/);
  });
});
