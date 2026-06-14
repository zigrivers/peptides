import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetLocalModel = vi.fn();
const mockWebSearch = vi.fn();
const mockTry = vi.fn();
const mockAuditCreate = vi.fn();

vi.mock('@/lib/ai/infrastructure/localModelClient', () => ({ getLocalModel: (...a: unknown[]) => mockGetLocalModel(...a) }));
vi.mock('@/lib/research/infrastructure/webSearch', () => ({ webSearch: (...a: unknown[]) => mockWebSearch(...a) }));
vi.mock('@/lib/research/application/localStructuredOutput', () => ({ tryGenerateObjectOrParse: (...a: unknown[]) => mockTry(...a) }));
vi.mock('@/lib/audit/infrastructure/PrismaAuditRepo', () => ({ PrismaAuditRepo: { create: (...a: unknown[]) => mockAuditCreate(...a) } }));
vi.mock('@/lib/shared/prisma', () => ({ prisma: { _isMockPrisma: true } }));

import { runFdaBriefing } from '@/lib/research/application/fdaBriefing';

describe('runFdaBriefing', () => {
  beforeEach(() => {
    mockGetLocalModel.mockReset(); mockWebSearch.mockReset(); mockTry.mockReset(); mockAuditCreate.mockReset();
    mockGetLocalModel.mockResolvedValue({} as never);
    mockAuditCreate.mockResolvedValue(undefined);
  });

  it('plans, searches, synthesizes a cited briefing and drops uncited findings', async () => {
    mockTry
      .mockResolvedValueOnce({ subQuestions: ['fda stance?'], queries: ['FDA peptide regulation 2026'] })
      .mockResolvedValueOnce({
        summary: 'Most peptides are not FDA-approved; enforcement and policy are evolving.',
        findings: [
          { point: 'Most peptides are not FDA-approved.', sourceUrls: ['https://a.com/x'] },
          { point: 'Hallucinated.', sourceUrls: ['https://not-fetched.com'] },
        ],
        sourcesUsed: [{ title: 'A', url: 'https://a.com/x' }],
      });
    mockWebSearch.mockResolvedValue([{ title: 'A', url: 'https://a.com/x', snippet: 's', content: 'c' }]);

    const res = await runFdaBriefing('u1');
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0].sourceUrls).toEqual(['https://a.com/x']);
    expect(res.sourcesUsed).toEqual([{ title: 'A', url: 'https://a.com/x' }]);
    const audit = JSON.stringify(mockAuditCreate.mock.calls);
    expect(audit).not.toContain('not FDA-approved'); // no answer content in audit
  });

  it('drops prescriptive/disallowed findings but keeps descriptive ones', async () => {
    mockTry
      .mockResolvedValueOnce({ subQuestions: ['q'], queries: ['q'] })
      .mockResolvedValueOnce({
        summary: 'GHK-Cu is not FDA-approved.', // negated regulatory status is allowed
        findings: [
          { point: 'You should take 2 mg daily.', sourceUrls: ['https://a.com'] }, // prescriptive -> dropped
          { point: 'Peptides are largely sold as research chemicals.', sourceUrls: ['https://a.com'] },
        ],
        sourcesUsed: [{ title: 'A', url: 'https://a.com' }],
      });
    mockWebSearch.mockResolvedValue([{ title: 'A', url: 'https://a.com', snippet: 's', content: 'c' }]);
    const res = await runFdaBriefing('u1');
    expect(res.summary).toContain('not FDA-approved');
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0].point).toMatch(/research chemicals/);
  });

  it('throws when the local model is unavailable', async () => {
    mockGetLocalModel.mockResolvedValue(null);
    await expect(runFdaBriefing('u1')).rejects.toThrow();
  });
});
