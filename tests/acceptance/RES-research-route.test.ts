import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuth = vi.fn();
const mockEnabled = vi.fn();
const mockRun = vi.fn();
const mockFindUnique = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }));
vi.mock('@/lib/ai/infrastructure/localModelClient', () => ({ isCompoundResearchEnabled: () => mockEnabled() }));
vi.mock('@/lib/research/application/compoundResearch', () => ({
  runCompoundResearch: (...a: unknown[]) => mockRun(...a),
  ResearchUnavailableError: class extends Error {},
}));
vi.mock('@/lib/shared/prisma', () => ({
  prisma: { catalogItem: { findUnique: (...a: unknown[]) => mockFindUnique(...a) } },
}));

import { POST } from '@/app/api/reference/[catalogItemId]/research/route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/reference/c1/research', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}
const ctx = { params: Promise.resolve({ catalogItemId: 'c1' }) };

async function readNdjson(res: Response): Promise<{ phase: string; code?: string }[]> {
  const text = await res.text();
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

describe('POST research route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'u1' } });
    mockEnabled.mockResolvedValue(true);
    mockFindUnique.mockResolvedValue({ id: 'c1', name: 'BPC-157', profile: null, supplementProfile: null });
  });

  it('returns 401 when not signed in', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeReq({ question: 'q' }), ctx);
    expect(res.status).toBe(401);
  });

  it('streams a disabled error event when the feature is off', async () => {
    mockEnabled.mockResolvedValue(false);
    const res = await POST(makeReq({ question: 'q' }), ctx);
    const events = await readNdjson(res);
    expect(events.at(-1)).toMatchObject({ phase: 'error', code: 'feature_disabled' });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('rejects an over-long question', async () => {
    const res = await POST(makeReq({ question: 'x'.repeat(501) }), ctx);
    const events = await readNdjson(res);
    expect(events.at(-1)).toMatchObject({ phase: 'error', code: 'invalid_input' });
  });

  it('streams progress + result events on success', async () => {
    mockRun.mockImplementation(async (_input: unknown, onProgress: (e: unknown) => void) => {
      onProgress({ phase: 'planning' });
      onProgress({ phase: 'result', result: { summary: 's', findings: [], sourcesUsed: [] } });
      return { summary: 's', findings: [], sourcesUsed: [] };
    });
    const res = await POST(makeReq({ question: 'Does it help?' }), ctx);
    const events = await readNdjson(res);
    expect(events[0]).toMatchObject({ phase: 'planning' });
    expect(events.at(-1)).toMatchObject({ phase: 'result' });
  });

  it('streams a structured result event with the section keys', async () => {
    const answer = {
      directAnswer: 'A grounded answer.',
      evidence: [], dosing: [], caveatsGaps: [], sourcesUsed: [], needsMoreEvidence: false,
    };
    mockRun.mockImplementation(async (_input: unknown, send: (e: unknown) => void) => {
      send({ phase: 'result', result: answer });
      return answer;
    });
    const res = await POST(makeReq({ question: 'what does the research say?' }), ctx);
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    const events = await readNdjson(res);
    const last = events.at(-1) as { phase: string; result?: Record<string, unknown> };
    expect(last.phase).toBe('result');
    expect(last.result).toBeDefined();
    expect(Object.keys(last.result as object)).toEqual(
      expect.arrayContaining(['directAnswer', 'evidence', 'dosing', 'caveatsGaps', 'sourcesUsed'])
    );
    expect(mockRun).toHaveBeenCalled();
  });
});
