import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockVialFindMany: vi.fn(),
  mockVialUpdateMany: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

// Mock auth
vi.mock('@/lib/auth', () => ({
  auth: () => mocks.mockAuth(),
}));

// Mock next/cache
vi.mock('next/cache', () => ({
  revalidatePath: mocks.mockRevalidatePath,
}));

// Mock prisma and transaction client
vi.mock('@/lib/shared/prisma', () => {
  const mockTx = {
    vial: {
      findMany: mocks.mockVialFindMany,
      updateMany: mocks.mockVialUpdateMany,
    },
    auditEvent: {
      create: mocks.mockAuditCreate,
    },
  };

  return {
    prisma: {
      $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockTx)),
    },
  };
});

import { reorderVialsAction } from '@/app/actions/reconstitution/reorder-vials';

describe('REC-reorder', () => {
  const actorUserId = 'user-111';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAuth.mockResolvedValue({ user: { id: actorUserId } });
    mocks.mockVialFindMany.mockResolvedValue([
      { id: 'vial-1' },
      { id: 'vial-2' },
      { id: 'vial-3' },
    ]);
    mocks.mockVialUpdateMany.mockResolvedValue({ count: 1 });
    mocks.mockAuditCreate.mockResolvedValue({ id: 'audit-1' });
  });

  it('fails if unauthorized', async () => {
    mocks.mockAuth.mockResolvedValueOnce(null);
    const result = await reorderVialsAction({ vialIds: ['vial-1', 'vial-2'] });
    expect(result).toEqual({
      ok: false,
      error: 'unauthorized',
      message: 'You must be signed in.',
    });
  });

  it('fails if input validation fails (e.g. not an array of strings)', async () => {
    const result = await reorderVialsAction({ vialIds: 'not-an-array' });
    expect(result).toEqual(expect.objectContaining({ ok: false, error: 'invalid_input' }));
  });

  it('fails if duplicate vial IDs are provided', async () => {
    const result = await reorderVialsAction({ vialIds: ['vial-1', 'vial-1'] });
    expect(result).toEqual({
      ok: false,
      error: 'invalid_vial_ids_list',
      message: 'Duplicates not allowed.',
    });
  });

  it('reorders vials inside a transaction and logs a VIALS_REORDERED audit event', async () => {
    const result = await reorderVialsAction({
      vialIds: ['vial-2', 'vial-1'],
    });

    expect(result).toEqual({ ok: true });

    // Should fetch current active vials inside transaction
    expect(mocks.mockVialFindMany).toHaveBeenCalledWith({
      where: { userId: actorUserId, status: 'RECONSTITUTED' },
      orderBy: [{ shelfOrder: 'asc' }, { expiresAt: 'asc' }],
      select: { id: true },
    });

    // Should update shelfOrder of the active vials in order: vial-2 (index 0), vial-1 (index 1), and vial-3 (index 2, since it was omitted)
    expect(mocks.mockVialUpdateMany).toHaveBeenCalledTimes(3);

    expect(mocks.mockVialUpdateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'vial-2', userId: actorUserId, status: 'RECONSTITUTED' },
        data: { shelfOrder: 0 },
      })
    );

    expect(mocks.mockVialUpdateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'vial-1', userId: actorUserId, status: 'RECONSTITUTED' },
        data: { shelfOrder: 1 },
      })
    );

    expect(mocks.mockVialUpdateMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: { id: 'vial-3', userId: actorUserId, status: 'RECONSTITUTED' },
        data: { shelfOrder: 2 },
      })
    );

    // Should write VIALS_REORDERED audit event
    expect(mocks.mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId,
        subjectUserId: actorUserId,
        category: 'Reconstitution',
        action: 'VIALS_REORDERED',
        resourceId: actorUserId,
        resourceType: 'Vial',
        newValues: {
          vialIds: ['vial-2', 'vial-1', 'vial-3'],
        },
      }),
    });

    expect(mocks.mockRevalidatePath).toHaveBeenCalledWith('/reconstitution');
  });

  it('fails if active vials count exceeds 50', async () => {
    // Return 51 vials
    const tooManyVials = Array.from({ length: 51 }).map((_, i) => ({ id: `vial-${i}` }));
    mocks.mockVialFindMany.mockResolvedValueOnce(tooManyVials);

    const result = await reorderVialsAction({
      vialIds: ['vial-1'],
    });

    expect(result).toEqual({
      ok: false,
      error: 'exceeds_maximum_vials_limit',
      message: 'Reordering active vials limit of 50 has been exceeded.',
    });
  });
});
