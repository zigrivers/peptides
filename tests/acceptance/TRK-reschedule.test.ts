import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockProtocolFindFirst: vi.fn(),
  mockDoseLogFindFirst: vi.fn(),
  mockDoseLogDeleteMany: vi.fn(),
  mockDoseLogUpdateMany: vi.fn(),
  mockDoseLogCreate: vi.fn(),
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
    doseLog: {
      deleteMany: mocks.mockDoseLogDeleteMany,
      updateMany: mocks.mockDoseLogUpdateMany,
      create: mocks.mockDoseLogCreate,
      findFirst: mocks.mockDoseLogFindFirst,
    },
    auditEvent: {
      create: mocks.mockAuditCreate,
    },
  };

  return {
    prisma: {
      user: {
        findMany: vi.fn().mockResolvedValue([]), // no managed users
      },
      protocol: {
        findFirst: mocks.mockProtocolFindFirst,
      },
      doseLog: {
        findFirst: mocks.mockDoseLogFindFirst,
        deleteMany: mocks.mockDoseLogDeleteMany,
      },
      auditEvent: {
        create: mocks.mockAuditCreate,
      },
      $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mockTx)),
    },
  };
});

import { rescheduleDoseAction } from '@/app/actions/tracker/reschedule-dose';

describe('TRK-reschedule', () => {
  const actorUserId = 'user-123';
  const protocolId = 'proto-abc';

  const mockProtocol = {
    id: protocolId,
    userId: actorUserId,
    compoundId: 'comp-1',
    status: 'ACTIVE',
    startDate: new Date('2026-05-01T00:00:00Z'), // Friday
    endDate: null,
    schedule: {
      frequency: 'SpecificDaysOfWeek',
      daysOfWeek: ['Mon'],
    },
    dose: { amount: '2.5', unit: 'mg' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAuth.mockResolvedValue({ user: { id: actorUserId } });
    mocks.mockProtocolFindFirst.mockResolvedValue(mockProtocol);
    mocks.mockDoseLogFindFirst.mockResolvedValue(null);
    mocks.mockDoseLogDeleteMany.mockResolvedValue({ count: 1 });
    mocks.mockDoseLogUpdateMany.mockResolvedValue({ count: 1 });
    mocks.mockDoseLogCreate.mockResolvedValue({ id: 'new-log-id', scheduledDate: new Date('2026-05-05T00:00:00Z') });
  });

  it('fails if not authenticated', async () => {
    mocks.mockAuth.mockResolvedValueOnce(null);
    const result = await rescheduleDoseAction({
      protocolId,
      sourceDate: '2026-05-04',
      targetDate: '2026-05-05',
    });
    expect(result).toEqual({
      ok: false,
      error: 'unauthorized',
      message: 'You must be signed in.',
    });
  });

  it('reschedules a virtual scheduled dose (no doseLogId)', async () => {
    // No target log, no source log
    mocks.mockDoseLogFindFirst.mockResolvedValue(null);

    const result = await rescheduleDoseAction({
      protocolId,
      sourceDate: '2026-05-04',
      targetDate: '2026-05-05',
    });

    expect(result).toEqual({ ok: true });

    // Should create a RESCHEDULED status log on source date to act as exception
    expect(mocks.mockDoseLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          protocolId,
          userId: actorUserId,
          status: 'RESCHEDULED',
          scheduledDate: expect.any(Date),
        }),
      })
    );

    // Should create a PENDING status log on target date
    expect(mocks.mockDoseLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          protocolId,
          userId: actorUserId,
          status: 'PENDING',
          scheduledDate: expect.any(Date),
        }),
      })
    );

    expect(mocks.mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId,
        subjectUserId: actorUserId,
        category: 'Protocol',
        action: 'DOSE_RESCHEDULED',
      }),
    });

    expect(mocks.mockRevalidatePath).toHaveBeenCalled();
  });

  it('reschedules an existing DoseLog by ID', async () => {
    const existingLog = {
      id: 'log-111',
      protocolId,
      userId: actorUserId,
      status: 'PENDING',
      scheduledDate: new Date('2026-05-04T00:00:00Z'),
    };
    mocks.mockDoseLogFindFirst.mockResolvedValueOnce(null); // target check is empty
    mocks.mockDoseLogFindFirst.mockResolvedValueOnce(existingLog); // fetch inside transaction for update

    const result = await rescheduleDoseAction({
      doseLogId: 'log-111',
      protocolId,
      targetDate: '2026-05-05',
    });

    expect(result).toEqual({ ok: true });

    // Should update the existing DoseLog with targetDate and new idempotencyKey
    expect(mocks.mockDoseLogUpdateMany).toHaveBeenCalledWith({
      where: { id: 'log-111', userId: actorUserId, protocolId },
      data: {
        scheduledDate: expect.any(Date),
        idempotencyKey: expect.stringContaining('2026-05-05'),
      },
    });

    // Since source date was virtual ('SpecificDaysOfWeek' schedule), it creates exception to keep original date suppressed
    expect(mocks.mockDoseLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          protocolId,
          status: 'RESCHEDULED',
          scheduledDate: existingLog.scheduledDate,
        }),
      })
    );
  });

  it('fails if target date has a conflict (LOGGED, SKIPPED, PENDING)', async () => {
    // Target date has an existing PENDING log
    const conflictingLog = {
      id: 'log-conflicting',
      protocolId,
      userId: actorUserId,
      status: 'PENDING',
      scheduledDate: new Date('2026-05-05T00:00:00Z'),
    };
    mocks.mockDoseLogFindFirst.mockResolvedValueOnce(conflictingLog);

    const result = await rescheduleDoseAction({
      protocolId,
      sourceDate: '2026-05-04',
      targetDate: '2026-05-05',
    });

    expect(result).toEqual({
      ok: false,
      error: 'reschedule_target_date_conflict',
      message: 'A dose is already scheduled or logged on the target date.',
    });
  });

  it('deletes the RESCHEDULED exception row first when moving back to an exception day', async () => {
    // Target date has a RESCHEDULED status log (move-back scenario)
    const targetExceptionLog = {
      id: 'log-exception',
      protocolId,
      userId: actorUserId,
      status: 'RESCHEDULED',
      scheduledDate: new Date('2026-05-05T00:00:00Z'),
    };
    mocks.mockDoseLogFindFirst.mockResolvedValueOnce(targetExceptionLog); // target check returns exception
    mocks.mockDoseLogFindFirst.mockResolvedValueOnce(null); // virtual original check inside tx

    const result = await rescheduleDoseAction({
      protocolId,
      sourceDate: '2026-05-04',
      targetDate: '2026-05-05',
    });

    expect(result).toEqual({ ok: true });

    // Expect deletion of target exception log (slot-scoped, defaults to 0)
    expect(mocks.mockDoseLogDeleteMany).toHaveBeenCalledWith({
      where: {
        id: 'log-exception',
        userId: actorUserId,
        protocolId,
        doseSlot: 0,
        status: 'RESCHEDULED',
      },
    });
  });

  it('defaults doseSlot to 0 and scopes conflict check to slot 0 for once-daily', async () => {
    mocks.mockDoseLogFindFirst.mockResolvedValue(null);

    const result = await rescheduleDoseAction({
      protocolId,
      sourceDate: '2026-05-04',
      targetDate: '2026-05-05',
    });

    expect(result).toEqual({ ok: true });

    // Target conflict check is the first findFirst call: slot-scoped to 0.
    expect(mocks.mockDoseLogFindFirst).toHaveBeenNthCalledWith(1, {
      where: { userId: actorUserId, protocolId, scheduledDate: expect.any(Date), doseSlot: 0 },
    });

    // Created placeholder logs carry doseSlot 0 and the :0 idempotency suffix.
    expect(mocks.mockDoseLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          doseSlot: 0,
          idempotencyKey: expect.stringMatching(/:2026-05-05:0$/),
          status: 'PENDING',
        }),
      })
    );
  });

  it('preserves doseSlot when rescheduling a twice-daily evening (slot 1) virtual dose', async () => {
    // TwiceDaily => target day is virtually scheduled. Use a RESCHEDULED exception on
    // the target slot so the conflict gate is bypassed (move-back scenario), exercising
    // the slot-scoped predicates without a schedule-level virtual conflict.
    const twiceDailyProtocol = { ...mockProtocol, schedule: { frequency: 'TwiceDaily' } };
    mocks.mockProtocolFindFirst.mockResolvedValue(twiceDailyProtocol);
    const targetException = {
      id: 'log-target-exc',
      protocolId,
      userId: actorUserId,
      status: 'RESCHEDULED',
      doseSlot: 1,
      scheduledDate: new Date('2026-05-05T00:00:00Z'),
    };
    mocks.mockDoseLogFindFirst.mockResolvedValueOnce(targetException); // target check (slot 1)
    mocks.mockDoseLogFindFirst.mockResolvedValueOnce(null); // source-empty check

    const result = await rescheduleDoseAction({
      protocolId,
      sourceDate: '2026-05-04',
      targetDate: '2026-05-05',
      doseSlot: 1,
    });

    expect(result).toEqual({ ok: true });

    // Conflict check targets ONLY slot 1 (not "either slot").
    expect(mocks.mockDoseLogFindFirst).toHaveBeenNthCalledWith(1, {
      where: { userId: actorUserId, protocolId, scheduledDate: expect.any(Date), doseSlot: 1 },
    });

    // Deletion of the move-back exception is slot-scoped to 1.
    expect(mocks.mockDoseLogDeleteMany).toHaveBeenCalledWith({
      where: { id: 'log-target-exc', userId: actorUserId, protocolId, doseSlot: 1, status: 'RESCHEDULED' },
    });

    // Placeholder logs carry doseSlot 1 and the :1 idempotency suffix.
    expect(mocks.mockDoseLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          doseSlot: 1,
          idempotencyKey: expect.stringMatching(/:1$/),
        }),
      })
    );
  });

  it('rebuilds the idempotency key with the slot when moving an existing slot-1 log', async () => {
    const existingLog = {
      id: 'log-evening',
      protocolId,
      userId: actorUserId,
      status: 'PENDING',
      doseSlot: 1,
      scheduledDate: new Date('2026-05-04T00:00:00Z'),
    };
    // Mon-only schedule so target (Tue 2026-05-05) is NOT virtually scheduled => no conflict.
    mocks.mockDoseLogFindFirst.mockResolvedValueOnce(null); // target check empty
    mocks.mockDoseLogFindFirst.mockResolvedValueOnce(existingLog); // fetch inside tx
    mocks.mockDoseLogFindFirst.mockResolvedValueOnce(null); // original-day check inside tx

    const result = await rescheduleDoseAction({
      doseLogId: 'log-evening',
      protocolId,
      targetDate: '2026-05-05',
      doseSlot: 1,
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.mockDoseLogUpdateMany).toHaveBeenCalledWith({
      where: { id: 'log-evening', userId: actorUserId, protocolId },
      data: {
        scheduledDate: expect.any(Date),
        idempotencyKey: expect.stringMatching(/:2026-05-05:1$/),
      },
    });
  });

  it('rejects invalid target calendar date (rollover date)', async () => {
    const result = await rescheduleDoseAction({
      protocolId,
      sourceDate: '2026-05-04',
      targetDate: '2026-02-30',
    });
    expect(result).toEqual({
      ok: false,
      error: 'invalid_input',
      message: 'Invalid target date value.',
    });
  });

  it('rejects invalid source calendar date (rollover date)', async () => {
    const result = await rescheduleDoseAction({
      protocolId,
      sourceDate: '2026-02-30',
      targetDate: '2026-05-05',
    });
    expect(result).toEqual({
      ok: false,
      error: 'invalid_input',
      message: 'Invalid source date value.',
    });
  });
});
