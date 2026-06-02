import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    vial: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
  },
}));

const { resolveActiveVial } = await import('@/lib/reconstitution/application/VialService');

beforeEach(() => {
  mockFindFirst.mockReset();
});

describe('resolveActiveVial (Phase 1 — FIFO)', () => {
  it('selects RECONSTITUTED vials for (userId, compoundId) ordered FIFO: shelfOrder then expiresAt', async () => {
    const vial = { id: 'v1' };
    mockFindFirst.mockResolvedValue(vial);

    const result = await resolveActiveVial('user-1', 'compound-1');

    expect(result).toBe(vial);
    // The FIFO tiebreak (lowest shelfOrder; equal shelfOrder -> earliest expiresAt) is
    // enforced by this exact orderBy; asserting it pins the contract.
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', compoundId: 'compound-1', status: 'RECONSTITUTED' },
      orderBy: [{ shelfOrder: 'asc' }, { expiresAt: 'asc' }],
    });
  });

  it('returns null when the user has no reconstituted vial for the compound', async () => {
    mockFindFirst.mockResolvedValue(null);
    expect(await resolveActiveVial('user-1', 'compound-1')).toBeNull();
  });

  it('queries through the provided transaction client (no TOCTOU window)', async () => {
    const txFindFirst = vi.fn().mockResolvedValue({ id: 'v-tx' });
    const tx = { vial: { findFirst: txFindFirst } } as never;

    const result = await resolveActiveVial('user-1', 'compound-1', tx);

    expect(result).toEqual({ id: 'v-tx' });
    expect(txFindFirst).toHaveBeenCalledOnce();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });
});
