import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuth = vi.fn();
const mockSave = vi.fn();
const mockList = vi.fn();
const mockEnabled = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/research/application/CompoundResearchNoteService', () => ({
  saveResearchNotes: (...a: unknown[]) => mockSave(...a),
  listResearchNotes: (...a: unknown[]) => mockList(...a),
  deleteResearchNote: vi.fn(),
}));
vi.mock('@/lib/ai/infrastructure/localModelClient', () => ({ isCompoundResearchEnabled: () => mockEnabled() }));

import { saveCompoundResearchNotesAction } from '@/app/actions/reference/save-compound-research-notes';
import { listCompoundResearchAction } from '@/app/actions/reference/list-compound-research';

describe('research server actions', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAuth.mockResolvedValue({ user: { id: 'u1' } }); });

  it('save returns unauthorized when no session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await saveCompoundResearchNotesAction({ catalogItemId: 'c1', question: 'q', answerSummary: null, approvedFindings: [] });
    expect(res).toMatchObject({ ok: false, error: 'unauthorized' });
  });

  it('save rejects invalid input (no findings)', async () => {
    const res = await saveCompoundResearchNotesAction({ catalogItemId: 'c1', question: 'q', answerSummary: null, approvedFindings: [] });
    expect(res).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('save rejects a non-http citation url', async () => {
    const res = await saveCompoundResearchNotesAction({
      catalogItemId: 'c1', question: 'q', answerSummary: null,
      approvedFindings: [{ claim: 'c', citations: [{ title: 't', url: 'javascript:alert(1)' }] }],
    });
    expect(res).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('save persists valid findings', async () => {
    mockSave.mockResolvedValue({ savedCount: 1 });
    const res = await saveCompoundResearchNotesAction({
      catalogItemId: 'c1', question: 'q',
      sections: [{ type: 'evidence', content: 'c', tier: null, citations: [{ title: 't', url: 'https://a.com' }] }],
    });
    expect(res).toMatchObject({ ok: true, savedCount: 1 });
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'u1', catalogItemId: 'c1' }));
  });

  it('list returns {enabled, notes} scoped to the user', async () => {
    mockEnabled.mockResolvedValue(true);
    mockList.mockResolvedValue([{ id: 'n1' }]);
    const res = await listCompoundResearchAction('c1');
    expect(res).toMatchObject({ ok: true, enabled: true });
    expect(mockList).toHaveBeenCalledWith('u1', 'c1');
  });
});
