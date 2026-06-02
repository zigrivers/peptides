import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockVialFindFirst: vi.fn(),
  mockVialUpdateMany: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: () => mocks.mockAuth(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.mockRevalidatePath,
}));

vi.mock('@/lib/shared/prisma', () => {
  const mockTx = {
    user: {
      findMany: mocks.mockUserFindMany,
    },
    vial: {
      findFirst: mocks.mockVialFindFirst,
      updateMany: mocks.mockVialUpdateMany,
    },
    auditEvent: {
      create: mocks.mockAuditCreate,
    },
  };

  return {
    prisma: {
      // getManagedUserIds is called with the base client (default arg) before the transaction.
      user: { findMany: mocks.mockUserFindMany },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    },
  };
});

import { setActiveVialAction } from '@/app/actions/reconstitution/set-active-vial';

describe('REC-set-active-vial', () => {
  const actorUserId = 'user-actor';
  const subjectUserId = 'user-actor'; // self by default
  const compoundId = 'compound-1';
  const vialId = 'vial-target';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAuth.mockResolvedValue({ user: { id: actorUserId } });
    mocks.mockUserFindMany.mockResolvedValue([]); // no managed users by default
    // previousActiveVialId capture: no current active vial by default
    mocks.mockVialFindFirst.mockResolvedValue(null);
    // target update succeeds (count === 1), sibling-unset count varies
    mocks.mockVialUpdateMany.mockResolvedValue({ count: 1 });
    mocks.mockAuditCreate.mockResolvedValue({ id: 'audit-1' });
  });

  it('returns unauthorized when there is no session', async () => {
    mocks.mockAuth.mockResolvedValueOnce(null);
    const result = await setActiveVialAction(subjectUserId, compoundId, vialId);
    expect(result).toEqual({
      ok: false,
      error: 'unauthorized',
      message: 'You must be signed in.',
    });
  });

  it('sets the flag on the target and unsets RECONSTITUTED siblings in one transaction', async () => {
    mocks.mockVialFindFirst.mockResolvedValueOnce({ id: 'vial-prev' }); // previousActiveVialId
    mocks.mockVialUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // set target
      .mockResolvedValueOnce({ count: 1 }); // unset siblings

    const result = await setActiveVialAction(subjectUserId, compoundId, vialId);
    expect(result).toEqual({ ok: true });

    // capture previous active vial id, scoped to subject
    expect(mocks.mockVialFindFirst).toHaveBeenCalledWith({
      where: {
        userId: subjectUserId,
        compoundId,
        status: 'RECONSTITUTED',
        isActiveForCompound: true,
      },
      select: { id: true },
    });

    // set target (count-guarded), scoped to subject + RECONSTITUTED
    expect(mocks.mockVialUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: vialId, userId: subjectUserId, compoundId, status: 'RECONSTITUTED' },
      data: { isActiveForCompound: true },
    });

    // unset siblings
    expect(mocks.mockVialUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        userId: subjectUserId,
        compoundId,
        status: 'RECONSTITUTED',
        id: { not: vialId },
        isActiveForCompound: true,
      },
      data: { isActiveForCompound: false },
    });
  });

  it('writes a VIAL_SET_ACTIVE audit event with correct fields', async () => {
    mocks.mockVialFindFirst.mockResolvedValueOnce({ id: 'vial-prev' });

    await setActiveVialAction(subjectUserId, compoundId, vialId);

    expect(mocks.mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId,
        subjectUserId,
        category: 'Reconstitution',
        action: 'VIAL_SET_ACTIVE',
        resourceType: 'Vial',
        resourceId: vialId,
        oldValues: { previousActiveVialId: 'vial-prev' },
        newValues: { vialId, compoundId },
      }),
    });
  });

  it('records previousActiveVialId as null when nothing was active', async () => {
    mocks.mockVialFindFirst.mockResolvedValueOnce(null);

    await setActiveVialAction(subjectUserId, compoundId, vialId);

    expect(mocks.mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        oldValues: { previousActiveVialId: null },
      }),
    });
  });

  it('rejects when the target vial is not owned by the subject (count === 0)', async () => {
    mocks.mockVialUpdateMany.mockReset();
    mocks.mockVialUpdateMany.mockResolvedValueOnce({ count: 0 }); // set target fails

    const result = await setActiveVialAction(subjectUserId, compoundId, vialId);

    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: 'vial_not_found_or_not_reconstituted' })
    );
    // no audit, no sibling unset committed (transaction rolled back)
    expect(mocks.mockAuditCreate).not.toHaveBeenCalled();
  });

  it('rejects a non-RECONSTITUTED vial (count-guard on status) and rolls back', async () => {
    // The status: 'RECONSTITUTED' predicate makes a DRY/DEPLETED vial unmatched -> count 0.
    mocks.mockVialUpdateMany.mockReset();
    mocks.mockVialUpdateMany.mockResolvedValueOnce({ count: 0 });

    const result = await setActiveVialAction(subjectUserId, compoundId, vialId);

    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: 'vial_not_found_or_not_reconstituted' })
    );
  });

  it('allows an actor who manages the subject', async () => {
    const managedSubject = 'user-managed';
    mocks.mockUserFindMany.mockResolvedValue([{ id: managedSubject }]);

    const result = await setActiveVialAction(managedSubject, compoundId, vialId);

    expect(result).toEqual({ ok: true });
    // all subject-scoped queries use the managed subject id
    expect(mocks.mockVialUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: vialId, userId: managedSubject, compoundId, status: 'RECONSTITUTED' },
      data: { isActiveForCompound: true },
    });
    expect(mocks.mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId,
        subjectUserId: managedSubject,
      }),
    });
  });

  it('rejects an unrelated actor (not self, not manager)', async () => {
    mocks.mockUserFindMany.mockResolvedValue([]); // actor manages nobody
    const result = await setActiveVialAction('user-stranger', compoundId, vialId);

    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: 'unauthorized' })
    );
    expect(mocks.mockVialUpdateMany).not.toHaveBeenCalled();
    expect(mocks.mockAuditCreate).not.toHaveBeenCalled();
  });

  it('is idempotent: setting the already-active vial still succeeds (count === 1)', async () => {
    // target already active: previous active == target; set still matches (count 1); sibling unset count 0
    mocks.mockVialFindFirst.mockResolvedValueOnce({ id: vialId });
    mocks.mockVialUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const result = await setActiveVialAction(subjectUserId, compoundId, vialId);
    expect(result).toEqual({ ok: true });
  });

  it('revalidates the reconstitution and tracker views on success', async () => {
    await setActiveVialAction(subjectUserId, compoundId, vialId);
    expect(mocks.mockRevalidatePath).toHaveBeenCalledWith('/reconstitution');
    expect(mocks.mockRevalidatePath).toHaveBeenCalledWith('/tracker');
  });
});
