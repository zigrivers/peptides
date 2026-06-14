import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetLocalModel = vi.fn();
const mockWebSearch = vi.fn();
const mockTry = vi.fn();
const mockAuditCreate = vi.fn();

vi.mock('@/lib/ai/infrastructure/localModelClient', () => ({
  getLocalModel: (...a: unknown[]) => mockGetLocalModel(...a),
  resolveLocalModelId: vi.fn(),
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

const baseInput = {
  catalogItemId: 'c1', compoundName: 'GHK-Cu', profileSummary: '',
  question: 'What does the research say about tendon healing?', actorUserId: 'u1',
};

describe('runCompoundResearch (structured)', () => {
  beforeEach(() => {
    mockGetLocalModel.mockReset(); mockWebSearch.mockReset(); mockTry.mockReset(); mockAuditCreate.mockReset();
    mockGetLocalModel.mockResolvedValue({} as never);
    mockAuditCreate.mockResolvedValue(undefined);
  });

  it('plans (subQuestions+queries), searches, synthesizes structured sections, drops uncited items', async () => {
    mockTry
      .mockResolvedValueOnce({ subQuestions: ['Does it help tendons?'], queries: ['GHK-Cu tendon healing'] })
      .mockResolvedValueOnce({
        directAnswer: 'Animal studies suggest GHK-Cu supports tissue and tendon repair, with limited human data.',
        evidence: [
          { point: 'Accelerated tendon healing in rats.', sourceUrls: ['https://a.com/study'] },
          { point: 'Hallucinated.', sourceUrls: ['https://not-fetched.com'] },
        ],
        dosing: [],
        caveatsGaps: ['No human tendon trials found.'],
        sourcesUsed: [{ title: 'Study', url: 'https://a.com/study' }],
        needsMoreEvidence: false,
      });
    mockWebSearch.mockResolvedValue([{ title: 'Study', url: 'https://a.com/study', snippet: 's', content: 'c' }]);

    const events: { phase: string }[] = [];
    const res = await runCompoundResearch(baseInput, (e) => events.push(e as { phase: string }));

    expect(res.evidence).toHaveLength(1); // hallucinated dropped
    expect(res.evidence[0].sourceUrls).toEqual(['https://a.com/study']);
    expect(res.sourcesUsed).toEqual([{ title: 'Study', url: 'https://a.com/study' }]);
    expect(res.caveatsGaps).toEqual(['No human tendon trials found.']);
    const phases = events.map((e) => e.phase);
    expect(phases).toContain('planning');
    expect(phases).toContain('searching');
    expect(phases).toContain('sources_found');
    expect(phases).toContain('synthesizing');
    expect(phases[phases.length - 1]).toBe('result'); // single terminal result
    expect(phases.filter((p) => p === 'result')).toHaveLength(1);
    const auditCalls = JSON.stringify(mockAuditCreate.mock.calls);
    expect(auditCalls).not.toContain('tendon'); // no prompt content in audit
  });

  it('strips dose figures from directAnswer and drops prescriptive/disallowed items', async () => {
    // After guards, evidence=[] (prescriptive dropped) → gap-fill triggers; provide a 3rd mock to satisfy it.
    const synthResult = {
      directAnswer: 'GHK-Cu is studied for skin. Some report 1-2 mg per day.',
      evidence: [{ point: 'You should take 2 mg daily.', sourceUrls: ['https://a.com'] }], // prescriptive -> dropped
      dosing: [
        { text: 'Topical 1-2% daily in cosmetic studies.', tier: 'clinical', sourceUrls: ['https://a.com'] },
        { text: 'FDA-approved for healing.', tier: 'clinical', sourceUrls: ['https://a.com'] }, // disallowed -> dropped
      ],
      caveatsGaps: ['No age-specific data.'],
      sourcesUsed: [{ title: 'S', url: 'https://a.com' }],
      needsMoreEvidence: false,
    };
    mockTry
      .mockResolvedValueOnce({ subQuestions: ['dose?'], queries: ['GHK-Cu dose'] })
      .mockResolvedValueOnce(synthResult)   // synth #1 → gap-fill triggers (evidence=[] after guard)
      .mockResolvedValueOnce(synthResult);  // synth #2 (gap-fill round) → same result
    mockWebSearch.mockResolvedValue([{ title: 'S', url: 'https://a.com', snippet: 's', content: 'c' }]);

    const res = await runCompoundResearch(
      { ...baseInput, question: 'what dose and how often?' },
      () => {}
    );

    expect(res.directAnswer).toContain('studied for skin');
    expect(res.directAnswer).not.toMatch(/\d\s?mg/i); // dose figure stripped
    expect(res.evidence).toHaveLength(0); // prescriptive dropped
    expect(res.dosing).toHaveLength(1); // disallowed dropped, descriptive kept
    expect(res.dosing[0].tier).toBe('clinical');
  });

  it('throws typed error + failed audit when the local model is unavailable', async () => {
    mockGetLocalModel.mockResolvedValue(null);
    await expect(runCompoundResearch(baseInput, () => {})).rejects.toThrow(/local_model_unavailable/);
  });

  it('runs ONE gap-fill round when dosing is empty for a dose-intent question', async () => {
    mockTry
      .mockResolvedValueOnce({ subQuestions: ['dose?'], queries: ['GHK-Cu dose'] })       // plan
      .mockResolvedValueOnce({                                                              // synth #1: no dosing
        directAnswer: 'GHK-Cu is studied for skin repair and wound healing in animal models.',
        evidence: [{ point: 'Skin repair in studies.', sourceUrls: ['https://a.com'] }],
        dosing: [], caveatsGaps: [], sourcesUsed: [{ title: 'A', url: 'https://a.com' }], needsMoreEvidence: false,
      })
      .mockResolvedValueOnce({                                                              // synth #2 (gap-fill): dosing found
        directAnswer: 'GHK-Cu is studied for skin repair and wound healing in animal models.',
        evidence: [{ point: 'Skin repair in studies.', sourceUrls: ['https://a.com'] }],
        dosing: [{ text: 'Topical 1-2% daily in studies.', tier: 'clinical', sourceUrls: ['https://b.com'] }],
        caveatsGaps: [], sourcesUsed: [{ title: 'B', url: 'https://b.com' }], needsMoreEvidence: true,
      });
    mockWebSearch
      .mockResolvedValueOnce([{ title: 'A', url: 'https://a.com', snippet: 's', content: 'c' }]) // initial search
      .mockResolvedValueOnce([{ title: 'B', url: 'https://b.com', snippet: 's', content: 'c' }]) // gap-fill query 1
      .mockResolvedValueOnce([]); // gap-fill query 2 (no new results)

    const events: { phase: string }[] = [];
    const res = await runCompoundResearch(
      { ...baseInput, question: 'what dose and how often?' },
      (e) => events.push(e as { phase: string })
    );

    expect(mockTry).toHaveBeenCalledTimes(3);                       // plan + 2 synth (no 2nd plan)
    expect(events.map((e) => e.phase)).toContain('gap_filling');
    expect(res.dosing).toHaveLength(1);
    expect(events.filter((e) => e.phase === 'result')).toHaveLength(1); // single terminal result
  });

  it('does NOT gap-fill when the first answer is complete', async () => {
    mockTry
      .mockResolvedValueOnce({ subQuestions: ['q'], queries: ['q'] })
      .mockResolvedValueOnce({
        directAnswer: 'A thorough, sufficiently long direct answer about the compound and its studied effects.',
        evidence: [{ point: 'Effect.', sourceUrls: ['https://a.com'] }],
        dosing: [], caveatsGaps: [], sourcesUsed: [{ title: 'A', url: 'https://a.com' }], needsMoreEvidence: false,
      });
    mockWebSearch.mockResolvedValue([{ title: 'A', url: 'https://a.com', snippet: 's', content: 'c' }]);
    await runCompoundResearch({ ...baseInput, question: 'what is the mechanism?' }, () => {});
    expect(mockTry).toHaveBeenCalledTimes(2); // plan + 1 synth only
  });
});
