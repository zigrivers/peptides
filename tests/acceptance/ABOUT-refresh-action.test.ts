import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuth = vi.fn();
const mockEnabled = vi.fn();
const mockRun = vi.fn();
const mockUpsert = vi.fn();
const mockWithAudit = vi.fn(async (mutation: (tx: unknown) => unknown) => mutation({}));

vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/ai/infrastructure/localModelClient', () => ({ isLocalResearchEnabled: () => mockEnabled() }));
vi.mock('@/lib/research/application/fdaBriefing', () => ({ runFdaBriefing: (...a: unknown[]) => mockRun(...a) }));
vi.mock('@/lib/research/infrastructure/FdaBriefingRepo', () => ({ FdaBriefingRepo: { upsertGlobal: (...a: unknown[]) => mockUpsert(...a) } }));
vi.mock('@/lib/audit/application/withAudit', () => ({ withAudit: (...a: unknown[]) => mockWithAudit(...(a as [(tx: unknown) => unknown])) }));

import { refreshFdaBriefingAction } from '@/app/actions/about/refresh-fda-briefing';

const briefing = { summary: 's', findings: [], sourcesUsed: [] };

describe('refreshFdaBriefingAction', () => {
  beforeEach(() => { vi.clearAllMocks(); mockRun.mockResolvedValue(briefing); mockUpsert.mockResolvedValue({}); });

  it('rejects a non-POWER_USER with forbidden (no model call)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'MANAGED_USER' } });
    mockEnabled.mockResolvedValue(true);
    const res = await refreshFdaBriefingAction();
    expect(res).toMatchObject({ ok: false, error: 'forbidden' });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('returns unavailable when the local model is not reachable', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'POWER_USER' } });
    mockEnabled.mockResolvedValue(false);
    const res = await refreshFdaBriefingAction();
    expect(res).toMatchObject({ ok: false, error: 'unavailable' });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('runs + upserts for a POWER_USER when reachable', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'POWER_USER' } });
    mockEnabled.mockResolvedValue(true);
    const res = await refreshFdaBriefingAction();
    expect(res).toMatchObject({ ok: true });
    expect(mockRun).toHaveBeenCalledWith('u1');
    expect(mockUpsert).toHaveBeenCalled();
  });
});
