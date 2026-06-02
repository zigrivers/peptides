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

describe('resolveActiveVial (Phase 2 — pointer + FIFO fallback)', () => {
  it('prefers the isActiveForCompound=true pointer vial over the FIFO order', async () => {
    const pointerVial = { id: 'v-active', isActiveForCompound: true };
    // First findFirst (pointer lookup) returns the flagged vial; FIFO lookup must NOT run.
    mockFindFirst.mockResolvedValueOnce(pointerVial);

    const result = await resolveActiveVial('user-1', 'compound-1');

    expect(result).toBe(pointerVial);
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
    expect(mockFindFirst).toHaveBeenNthCalledWith(1, {
      where: {
        userId: 'user-1',
        compoundId: 'compound-1',
        status: 'RECONSTITUTED',
        isActiveForCompound: true,
      },
    });
  });

  it('falls back to FIFO (shelfOrder then expiresAt) when no pointer flag is set', async () => {
    const fifoVial = { id: 'v-fifo' };
    // First call (pointer) returns null -> fall back to FIFO order.
    mockFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(fifoVial);

    const result = await resolveActiveVial('user-1', 'compound-1');

    expect(result).toBe(fifoVial);
    expect(mockFindFirst).toHaveBeenCalledTimes(2);
    // The FIFO tiebreak (lowest shelfOrder; equal shelfOrder -> earliest expiresAt) is
    // enforced by this exact orderBy; asserting it pins the contract.
    expect(mockFindFirst).toHaveBeenNthCalledWith(2, {
      where: { userId: 'user-1', compoundId: 'compound-1', status: 'RECONSTITUTED' },
      orderBy: [{ shelfOrder: 'asc' }, { expiresAt: 'asc' }],
    });
  });

  it('returns null when the user has no reconstituted vial for the compound', async () => {
    mockFindFirst.mockResolvedValue(null);
    expect(await resolveActiveVial('user-1', 'compound-1')).toBeNull();
  });

  it('queries through the provided transaction client (no TOCTOU window)', async () => {
    const txFindFirst = vi.fn().mockResolvedValue({ id: 'v-tx', isActiveForCompound: true });
    const tx = { vial: { findFirst: txFindFirst } } as never;

    const result = await resolveActiveVial('user-1', 'compound-1', tx);

    expect(result).toEqual({ id: 'v-tx', isActiveForCompound: true });
    expect(txFindFirst).toHaveBeenCalledOnce();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });
});
