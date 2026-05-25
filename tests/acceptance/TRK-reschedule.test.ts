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

    // Expect deletion of target exception log
    expect(mocks.mockDoseLogDeleteMany).toHaveBeenCalledWith({
      where: {
        id: 'log-exception',
        userId: actorUserId,
        protocolId,
        status: 'RESCHEDULED',
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
