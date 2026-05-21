const mockProtocolCreate = vi.fn();
const mockProtocolUpdate = vi.fn();
const mockProtocolUpdateMany = vi.fn();
const mockProtocolFindFirst = vi.fn();
const mockProtocolFindMany = vi.fn();
const mockAuditCreate = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserFindMany = vi.fn();
const mockDoseLogCreate = vi.fn();
const mockDoseLogFindFirst = vi.fn();
const mockDoseLogUpdate = vi.fn();
const mockVialCount = vi.fn();
const mockVialFindFirst = vi.fn();
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    protocol: {
      create: mockProtocolCreate,
      update: mockProtocolUpdate,
      findFirst: mockProtocolFindFirst,
      findMany: mockProtocolFindMany,
    },
    auditEvent: {
      create: mockAuditCreate,
    },
    user: {
      findUnique: mockUserFindUnique,
      findMany: mockUserFindMany,
    },
    doseLog: {
      create: mockDoseLogCreate,
      findFirst: mockDoseLogFindFirst,
      update: mockDoseLogUpdate,
    },
    vial: {
      count: mockVialCount,
      findFirst: mockVialFindFirst,
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        protocol: {
          create: mockProtocolCreate,
          update: mockProtocolUpdate,
          updateMany: mockProtocolUpdateMany,
          findFirst: mockProtocolFindFirst,
        },
        auditEvent: { create: mockAuditCreate },
        user: { findMany: mockUserFindMany },
        doseLog: { create: mockDoseLogCreate, updateMany: mockDoseLogUpdate, findFirst: mockDoseLogFindFirst },
      };
      return fn(tx);
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Default: actor has no managed users
  mockUserFindMany.mockResolvedValue([]);
});

const { createProtocol, updateProtocol, pauseProtocol, resumeProtocol, cloneProtocol, deactivateProtocol } = await import(
  '@/lib/tracker/application/ProtocolService'
);
const { generateScheduleDates, isScheduledOn } = await import(
  '@/lib/tracker/domain/ScheduleGenerator'
);
const { logDose } = await import('@/lib/tracker/application/DoseLogService');
const { batchLogDoses, getDueTodayForBatch } = await import('@/lib/tracker/application/BatchLogService');

const actorUserId = 'user-1';
const compoundId = 'compound-bpc157';
const protocolId = 'proto-1';

const baseProtocolRow = {
  id: protocolId,
  userId: actorUserId,
  compoundId,
  cycleId: null,
  dose: { amount: '250', unit: 'mcg' },
  schedule: { frequency: 'Daily' },
  administrationRoute: 'SubQ',
  status: 'ACTIVE',
  startDate: new Date('2026-06-01'),
  endDate: null,
  notes: null,
};

/**
 * Story: US-TRK-01 — Create and Edit Protocol
 */
describe('US-TRK-01: Create and Edit Protocol', () => {
  describe('createProtocol', () => {
    it('AC-1: generates schedule starting from selected date (Daily)', async () => {
      mockProtocolCreate.mockResolvedValue(baseProtocolRow);
      mockAuditCreate.mockResolvedValue({});

      const result = await createProtocol({
        actorUserId,
        subjectUserId: actorUserId,
        compoundId,
        dose: { amount: '250', unit: 'mcg' },
        schedule: { frequency: 'Daily' },
        administrationRoute: 'SubQ',
        startDate: new Date('2026-06-01'),
      });

      expect(result.id).toBe(protocolId);
      expect(result.schedule.frequency).toBe('Daily');
    });

    it('AC-2: assigns protocol to a managed user (subjectUserId differs from actorUserId)', async () => {
      const managedUserId = 'user-managed-1';
      mockProtocolCreate.mockResolvedValue({
        ...baseProtocolRow,
        userId: managedUserId,
      });
      mockAuditCreate.mockResolvedValue({});

      const result = await createProtocol({
        actorUserId,
        subjectUserId: managedUserId,
        compoundId,
        dose: { amount: '250', unit: 'mcg' },
        schedule: { frequency: 'Daily' },
        administrationRoute: 'SubQ',
        startDate: new Date('2026-06-01'),
      });

      expect(result.userId).toBe(managedUserId);
      expect(mockProtocolCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: managedUserId }),
        })
      );
    });

    it('AC-3: throws if compound is missing', async () => {
      await expect(
        createProtocol({
          actorUserId,
          subjectUserId: actorUserId,
          compoundId: '',
          dose: { amount: '250', unit: 'mcg' },
          schedule: { frequency: 'Daily' },
          administrationRoute: 'SubQ',
          startDate: new Date('2026-06-01'),
        })
      ).rejects.toThrow(/compound/i);
    });

    it('AC-3: throws if dose amount is zero', async () => {
      await expect(
        createProtocol({
          actorUserId,
          subjectUserId: actorUserId,
          compoundId,
          dose: { amount: '0', unit: 'mcg' },
          schedule: { frequency: 'Daily' },
          administrationRoute: 'SubQ',
          startDate: new Date('2026-06-01'),
        })
      ).rejects.toThrow(/dose/i);
    });

    it('AC-3: throws if dose amount is negative', async () => {
      await expect(
        createProtocol({
          actorUserId,
          subjectUserId: actorUserId,
          compoundId,
          dose: { amount: '-1', unit: 'mcg' },
          schedule: { frequency: 'Daily' },
          administrationRoute: 'SubQ',
          startDate: new Date('2026-06-01'),
        })
      ).rejects.toThrow(/dose/i);
    });

    it('AC-4: records PROTOCOL_CREATED audit event on creation', async () => {
      mockProtocolCreate.mockResolvedValue(baseProtocolRow);
      mockAuditCreate.mockResolvedValue({});

      await createProtocol({
        actorUserId,
        subjectUserId: actorUserId,
        compoundId,
        dose: { amount: '250', unit: 'mcg' },
        schedule: { frequency: 'Daily' },
        administrationRoute: 'SubQ',
        startDate: new Date('2026-06-01'),
      });

      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'PROTOCOL_CREATED',
            actorUserId,
            resourceType: 'Protocol',
          }),
        })
      );
    });

    it('AC-5: accepts EOD frequency', async () => {
      mockProtocolCreate.mockResolvedValue({
        ...baseProtocolRow,
        schedule: { frequency: 'EOD' },
      });
      mockAuditCreate.mockResolvedValue({});

      const result = await createProtocol({
        actorUserId,
        subjectUserId: actorUserId,
        compoundId,
        dose: { amount: '250', unit: 'mcg' },
        schedule: { frequency: 'EOD' },
        administrationRoute: 'SubQ',
        startDate: new Date('2026-06-01'),
      });

      expect(result.schedule.frequency).toBe('EOD');
    });

    it('AC-5: accepts SpecificDaysOfWeek frequency', async () => {
      mockProtocolCreate.mockResolvedValue({
        ...baseProtocolRow,
        schedule: { frequency: 'SpecificDaysOfWeek', daysOfWeek: ['Mon', 'Wed', 'Fri'] },
      });
      mockAuditCreate.mockResolvedValue({});

      const result = await createProtocol({
        actorUserId,
        subjectUserId: actorUserId,
        compoundId,
        dose: { amount: '250', unit: 'mcg' },
        schedule: { frequency: 'SpecificDaysOfWeek', daysOfWeek: ['Mon', 'Wed', 'Fri'] },
        administrationRoute: 'SubQ',
        startDate: new Date('2026-06-01'),
      });

      expect(result.schedule.frequency).toBe('SpecificDaysOfWeek');
    });

    it('AC-5: accepts CustomInterval frequency', async () => {
      mockProtocolCreate.mockResolvedValue({
        ...baseProtocolRow,
        schedule: { frequency: 'CustomInterval', intervalDays: 3 },
      });
      mockAuditCreate.mockResolvedValue({});

      const result = await createProtocol({
        actorUserId,
        subjectUserId: actorUserId,
        compoundId,
        dose: { amount: '250', unit: 'mcg' },
        schedule: { frequency: 'CustomInterval', intervalDays: 3 },
        administrationRoute: 'SubQ',
        startDate: new Date('2026-06-01'),
      });

      expect(result.schedule.frequency).toBe('CustomInterval');
    });
  });

  describe('updateProtocol', () => {
    it('AC-4: records PROTOCOL_UPDATED audit event on update', async () => {
      mockProtocolFindFirst.mockResolvedValue(baseProtocolRow);
      mockProtocolUpdate.mockResolvedValue({
        ...baseProtocolRow,
        dose: { amount: '500', unit: 'mcg' },
      });
      mockAuditCreate.mockResolvedValue({});

      await updateProtocol({
        actorUserId,
        protocolId,
        dose: { amount: '500', unit: 'mcg' },
      });

      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'PROTOCOL_UPDATED',
            actorUserId,
            resourceType: 'Protocol',
          }),
        })
      );
    });

    it('throws if protocol not found or not owned by user', async () => {
      mockProtocolFindFirst.mockResolvedValue(null);

      await expect(
        updateProtocol({
          actorUserId,
          protocolId: 'does-not-exist',
          dose: { amount: '500', unit: 'mcg' },
        })
      ).rejects.toThrow(/not found/i);
    });

    it('AC-3: throws if updated dose amount is zero', async () => {
      mockProtocolFindFirst.mockResolvedValue(baseProtocolRow);

      await expect(
        updateProtocol({
          actorUserId,
          protocolId,
          dose: { amount: '0', unit: 'mcg' },
        })
      ).rejects.toThrow(/dose/i);
    });

    it('power user can update a managed user protocol (F-002 regression)', async () => {
      const managedUserId = 'managed-user-1';
      mockUserFindMany.mockResolvedValue([{ id: managedUserId }]);
      const managedProtocolRow = { ...baseProtocolRow, userId: managedUserId };
      mockProtocolFindFirst.mockResolvedValue(managedProtocolRow);
      mockProtocolUpdate.mockResolvedValue({ ...managedProtocolRow, dose: { amount: '300', unit: 'mcg' } });
      mockAuditCreate.mockResolvedValue({});

      const result = await updateProtocol({
        actorUserId,
        protocolId,
        dose: { amount: '300', unit: 'mcg' },
      });

      expect(result.userId).toBe(managedUserId);
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'PROTOCOL_UPDATED', actorUserId }),
        })
      );
    });
  });
});

/**
 * Story: US-TRK-01 AC-5 — Schedule generation (pure domain unit tests)
 */
describe('ScheduleGenerator', () => {
  const start = new Date('2026-06-01'); // Monday

  it('Daily: generates consecutive dates', () => {
    const dates = generateScheduleDates({ frequency: 'Daily' }, start, 7);
    expect(dates).toHaveLength(7);
    expect(dates[0].toISOString().slice(0, 10)).toBe('2026-06-01');
    expect(dates[1].toISOString().slice(0, 10)).toBe('2026-06-02');
    expect(dates[6].toISOString().slice(0, 10)).toBe('2026-06-07');
  });

  it('EOD: generates every-other-day dates', () => {
    const dates = generateScheduleDates({ frequency: 'EOD' }, start, 4);
    expect(dates[0].toISOString().slice(0, 10)).toBe('2026-06-01');
    expect(dates[1].toISOString().slice(0, 10)).toBe('2026-06-03');
    expect(dates[2].toISOString().slice(0, 10)).toBe('2026-06-05');
    expect(dates[3].toISOString().slice(0, 10)).toBe('2026-06-07');
  });

  it('SpecificDaysOfWeek: Mon/Wed/Fri generates correct dates', () => {
    // 2026-06-01 is Monday
    const dates = generateScheduleDates(
      { frequency: 'SpecificDaysOfWeek', daysOfWeek: ['Mon', 'Wed', 'Fri'] },
      start,
      6
    );
    // Week 1: Mon Jun 1, Wed Jun 3, Fri Jun 5
    // Week 2: Mon Jun 8, Wed Jun 10, Fri Jun 12
    expect(dates[0].toISOString().slice(0, 10)).toBe('2026-06-01');
    expect(dates[1].toISOString().slice(0, 10)).toBe('2026-06-03');
    expect(dates[2].toISOString().slice(0, 10)).toBe('2026-06-05');
    expect(dates[3].toISOString().slice(0, 10)).toBe('2026-06-08');
    expect(dates[4].toISOString().slice(0, 10)).toBe('2026-06-10');
    expect(dates[5].toISOString().slice(0, 10)).toBe('2026-06-12');
  });

  it('CustomInterval: generates every N days', () => {
    const dates = generateScheduleDates(
      { frequency: 'CustomInterval', intervalDays: 3 },
      start,
      4
    );
    expect(dates[0].toISOString().slice(0, 10)).toBe('2026-06-01');
    expect(dates[1].toISOString().slice(0, 10)).toBe('2026-06-04');
    expect(dates[2].toISOString().slice(0, 10)).toBe('2026-06-07');
    expect(dates[3].toISOString().slice(0, 10)).toBe('2026-06-10');
  });

  it('SpecificDaysOfWeek: start date not in daysOfWeek is skipped', () => {
    // 2026-06-01 is Monday — use Tuesday as only day
    const dates = generateScheduleDates(
      { frequency: 'SpecificDaysOfWeek', daysOfWeek: ['Tue'] },
      start,
      2
    );
    expect(dates[0].toISOString().slice(0, 10)).toBe('2026-06-02'); // first Tuesday
    expect(dates[1].toISOString().slice(0, 10)).toBe('2026-06-09');
  });

  describe('isScheduledOn', () => {
    const s = new Date(Date.UTC(2026, 5, 1)); // 2026-06-01 Monday

    it('Daily: returns true for any day on/after start', () => {
      expect(isScheduledOn({ frequency: 'Daily' }, s, null, new Date(Date.UTC(2026, 5, 5)))).toBe(true);
    });
    it('Daily: returns false before start', () => {
      expect(isScheduledOn({ frequency: 'Daily' }, s, null, new Date(Date.UTC(2026, 4, 31)))).toBe(false);
    });
    it('EOD: returns true on even-offset days', () => {
      expect(isScheduledOn({ frequency: 'EOD' }, s, null, new Date(Date.UTC(2026, 5, 3)))).toBe(true);
    });
    it('EOD: returns false on odd-offset days', () => {
      expect(isScheduledOn({ frequency: 'EOD' }, s, null, new Date(Date.UTC(2026, 5, 2)))).toBe(false);
    });
    it('SpecificDaysOfWeek: returns true for matching day', () => {
      // 2026-06-03 is Wednesday
      expect(isScheduledOn({ frequency: 'SpecificDaysOfWeek', daysOfWeek: ['Wed'] }, s, null, new Date(Date.UTC(2026, 5, 3)))).toBe(true);
    });
    it('SpecificDaysOfWeek: returns false for non-matching day', () => {
      // 2026-06-02 is Tuesday — not Wed
      expect(isScheduledOn({ frequency: 'SpecificDaysOfWeek', daysOfWeek: ['Wed'] }, s, null, new Date(Date.UTC(2026, 5, 2)))).toBe(false);
    });
    it('CustomInterval: returns true when diff divisible by interval', () => {
      expect(isScheduledOn({ frequency: 'CustomInterval', intervalDays: 3 }, s, null, new Date(Date.UTC(2026, 5, 7)))).toBe(true);
    });
    it('CustomInterval: returns false when diff not divisible by interval', () => {
      // June 5 = offset 4 from June 1; 4 % 3 = 1 → not a scheduled day
      expect(isScheduledOn({ frequency: 'CustomInterval', intervalDays: 3 }, s, null, new Date(Date.UTC(2026, 5, 5)))).toBe(false);
    });
    it('respects endDate', () => {
      const end = new Date(Date.UTC(2026, 5, 5));
      expect(isScheduledOn({ frequency: 'Daily' }, s, end, new Date(Date.UTC(2026, 5, 6)))).toBe(false);
    });
  });
});

/**
 * Story: US-TRK-02 — Protocol Lifecycle
 */
describe('US-TRK-02: Protocol Lifecycle', () => {
  const pausedProtocolRow = { ...baseProtocolRow, status: 'PAUSED' };
  const activeProtocolRow = { ...baseProtocolRow, status: 'ACTIVE' };

  describe('pauseProtocol', () => {
    it('AC-1: sets status to PAUSED and emits PROTOCOL_PAUSED audit event', async () => {
      mockProtocolFindFirst.mockResolvedValueOnce(activeProtocolRow).mockResolvedValueOnce(pausedProtocolRow);
      mockProtocolUpdateMany.mockResolvedValue({ count: 1 });
      mockAuditCreate.mockResolvedValue({});

      const result = await pauseProtocol({ actorUserId, protocolId });

      expect(result.status).toBe('PAUSED');
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'PROTOCOL_PAUSED' }),
        })
      );
    });

    it('throws if protocol not found', async () => {
      mockProtocolFindFirst.mockResolvedValue(null);
      await expect(pauseProtocol({ actorUserId, protocolId })).rejects.toThrow(/not found/i);
    });

    it('throws if protocol is already PAUSED', async () => {
      mockProtocolFindFirst.mockResolvedValue(pausedProtocolRow);
      await expect(pauseProtocol({ actorUserId, protocolId })).rejects.toThrow(/paused|already/i);
    });

    it('throws if protocol is COMPLETED', async () => {
      mockProtocolFindFirst.mockResolvedValue({ ...activeProtocolRow, status: 'COMPLETED' });
      await expect(pauseProtocol({ actorUserId, protocolId })).rejects.toThrow(/completed/i);
    });

    it('actor can pause a managed user protocol (F-002 regression)', async () => {
      const managedUserId = 'user-managed';
      const managedProtocolRow = { ...activeProtocolRow, userId: managedUserId };
      const managedPausedRow = { ...managedProtocolRow, status: 'PAUSED' };
      mockUserFindMany.mockResolvedValue([{ id: managedUserId }]);
      mockProtocolFindFirst.mockResolvedValueOnce(managedProtocolRow).mockResolvedValueOnce(managedPausedRow);
      mockProtocolUpdateMany.mockResolvedValue({ count: 1 });
      mockAuditCreate.mockResolvedValue({});

      const result = await pauseProtocol({ actorUserId, protocolId });

      expect(result.status).toBe('PAUSED');
      expect(result.userId).toBe(managedUserId);
    });
  });

  describe('resumeProtocol', () => {
    it('AC-2: sets status to ACTIVE and emits PROTOCOL_RESUMED audit event', async () => {
      mockProtocolFindFirst.mockResolvedValueOnce(pausedProtocolRow).mockResolvedValueOnce(activeProtocolRow);
      mockProtocolUpdateMany.mockResolvedValue({ count: 1 });
      mockAuditCreate.mockResolvedValue({});

      const result = await resumeProtocol({ actorUserId, protocolId });

      expect(result.status).toBe('ACTIVE');
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'PROTOCOL_RESUMED' }),
        })
      );
    });

    it('throws if protocol is not PAUSED', async () => {
      mockProtocolFindFirst.mockResolvedValue(activeProtocolRow);
      await expect(resumeProtocol({ actorUserId, protocolId })).rejects.toThrow(/not paused/i);
    });
  });

  describe('cloneProtocol', () => {
    it('AC-3: creates a new ACTIVE protocol preserving dose, frequency, and route', async () => {
      mockProtocolFindFirst.mockResolvedValue(activeProtocolRow);
      const clonedRow = { ...activeProtocolRow, id: 'proto-cloned', startDate: new Date('2026-07-01') };
      mockProtocolCreate.mockResolvedValue(clonedRow);
      mockAuditCreate.mockResolvedValue({});

      const newStartDate = new Date('2026-07-01');
      const result = await cloneProtocol({ actorUserId, protocolId, newStartDate });

      expect(result.id).toBe('proto-cloned');
      expect(result.dose).toEqual(activeProtocolRow.dose);
      expect(result.schedule).toEqual(activeProtocolRow.schedule);
      expect(result.status).toBe('ACTIVE');
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'PROTOCOL_CLONED' }),
        })
      );
    });

    it('throws if source protocol not found', async () => {
      mockProtocolFindFirst.mockResolvedValue(null);
      await expect(
        cloneProtocol({ actorUserId, protocolId, newStartDate: new Date('2026-07-01') })
      ).rejects.toThrow(/not found/i);
    });

    it('throws if source protocol is DEACTIVATED (server-side guard)', async () => {
      mockProtocolFindFirst.mockResolvedValue({ ...activeProtocolRow, status: 'DEACTIVATED' });
      await expect(
        cloneProtocol({ actorUserId, protocolId, newStartDate: new Date('2026-07-01') })
      ).rejects.toThrow(/deactivated/i);
    });
  });

  describe('deactivateProtocol', () => {
    it('sets status to DEACTIVATED and emits PROTOCOL_DEACTIVATED audit event', async () => {
      mockProtocolFindFirst.mockResolvedValueOnce(activeProtocolRow).mockResolvedValueOnce({ ...activeProtocolRow, status: 'DEACTIVATED' });
      mockProtocolUpdateMany.mockResolvedValue({ count: 1 });
      mockAuditCreate.mockResolvedValue({});

      const result = await deactivateProtocol({ actorUserId, protocolId });

      expect(result.status).toBe('DEACTIVATED');
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'PROTOCOL_DEACTIVATED' }),
        })
      );
    });

    it('throws if protocol is already DEACTIVATED', async () => {
      mockProtocolFindFirst.mockResolvedValue({ ...activeProtocolRow, status: 'DEACTIVATED' });
      await expect(deactivateProtocol({ actorUserId, protocolId })).rejects.toThrow(/deactivated|already/i);
    });

    it('throws if protocol is COMPLETED', async () => {
      mockProtocolFindFirst.mockResolvedValue({ ...activeProtocolRow, status: 'COMPLETED' });
      await expect(deactivateProtocol({ actorUserId, protocolId })).rejects.toThrow(/completed/i);
    });
  });

  // AC-4 (Restart Cycle) deferred to Task 2.5 — requires Cycle domain and
  // cycleId FK infrastructure that does not exist yet in this wave.
  it.todo('AC-4: restartCycle clones all cycle protocols to new start date and emits CycleRestarted event');
});

/**
 * Story: US-TRK-03 — Individual Dose Logging
 */
describe('US-TRK-03: Individual Dose Logging', () => {
  // Freeze time so "today" and "tomorrow" remain stable regardless of when tests run.
  const FROZEN_NOW = new Date(Date.UTC(2026, 4, 21)); // 2026-05-21
  beforeEach(() => { vi.setSystemTime(FROZEN_NOW); });
  afterAll(() => { vi.useRealTimers(); });

  const logActorUserId = 'user-1';
  const logProtocolId = 'proto-1';
  const logCompoundId = 'compound-bpc157';
  const scheduledDate = new Date(Date.UTC(2026, 4, 21)); // 2026-05-21 (today)
  const amount = { amount: '1.5', unit: 'mg' as const };
  const injectionSite = { bodyPart: 'thigh', side: 'left' as const };

  const baseProtocolRow = {
    id: logProtocolId,
    userId: logActorUserId,
    compoundId: logCompoundId,
    cycleId: null,
    dose: amount,
    schedule: { frequency: 'Daily' },
    administrationRoute: 'SubQ',
    status: 'ACTIVE',
    startDate: new Date(Date.UTC(2026, 4, 1)),
    endDate: null,
    notes: null,
  };

  const baseDoseLogRow = {
    id: 'log-1',
    protocolId: logProtocolId,
    userId: logActorUserId,
    vialId: null,
    idempotencyKey: `${logActorUserId}:${logProtocolId}:2026-05-21`,
    loggedAt: new Date(),
    scheduledDate,
    amount,
    status: 'LOGGED',
    injectionSite,
    isBatchLog: false,
    note: null,
    loggedByUserId: logActorUserId,
  };

  it('AC-1: records dose with LOGGED status and returns doseLog', async () => {
    mockDoseLogFindFirst.mockResolvedValue(null); // no existing log
    mockProtocolFindFirst.mockResolvedValue(baseProtocolRow);
    mockVialCount.mockResolvedValue(1); // vial available
    mockDoseLogCreate.mockResolvedValue(baseDoseLogRow);
    mockAuditCreate.mockResolvedValue({});

    const result = await logDose({
      actorUserId: logActorUserId,
      protocolId: logProtocolId,
      scheduledDate,
      amount,
      status: 'LOGGED',
      injectionSite,
    });

    expect(result.doseLog.status).toBe('LOGGED');
    expect(result.doseLog.protocolId).toBe(logProtocolId);
    expect(result.warnings).toHaveLength(0);
    expect(mockDoseLogCreate).toHaveBeenCalledOnce();
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'DOSE_LOGGED' }) })
    );
  });

  it('AC-2: records explicit skip event with SKIPPED status', async () => {
    const skippedRow = { ...baseDoseLogRow, status: 'SKIPPED', idempotencyKey: `${logActorUserId}:${logProtocolId}:2026-05-21` };
    mockDoseLogFindFirst.mockResolvedValue(null);
    mockProtocolFindFirst.mockResolvedValue(baseProtocolRow);
    // vialCount is not called for SKIPPED status
    mockDoseLogCreate.mockResolvedValue(skippedRow);
    mockAuditCreate.mockResolvedValue({});

    const result = await logDose({
      actorUserId: logActorUserId,
      protocolId: logProtocolId,
      scheduledDate,
      amount,
      status: 'SKIPPED',
    });

    expect(result.doseLog.status).toBe('SKIPPED');
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'DOSE_SKIPPED' }) })
    );
  });

  // AC-3 deferred to Task 2.6 — requires IndexedDB offline queue (PWA Sync)
  it.todo('AC-3: queues dose log while offline');

  it('AC-4: shows insufficient_inventory warning when no vials available', async () => {
    mockDoseLogFindFirst.mockResolvedValue(null);
    mockProtocolFindFirst.mockResolvedValue(baseProtocolRow);
    mockVialCount.mockResolvedValue(0); // no vials
    mockDoseLogCreate.mockResolvedValue(baseDoseLogRow);
    mockAuditCreate.mockResolvedValue({});

    const result = await logDose({
      actorUserId: logActorUserId,
      protocolId: logProtocolId,
      scheduledDate,
      amount,
      status: 'LOGGED',
    });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('insufficient_inventory');
  });

  it('idempotency: returns existing log on duplicate key with same status', async () => {
    const existingLog = { ...baseDoseLogRow };
    mockDoseLogFindFirst.mockResolvedValue(existingLog);
    mockProtocolFindFirst.mockResolvedValue(baseProtocolRow);
    mockVialCount.mockResolvedValue(1);

    const result = await logDose({
      actorUserId: logActorUserId,
      protocolId: logProtocolId,
      scheduledDate,
      amount,
      status: 'LOGGED',
    });

    expect(result.doseLog.id).toBe('log-1');
    expect(mockDoseLogCreate).not.toHaveBeenCalled();
    expect(mockDoseLogUpdate).not.toHaveBeenCalled();
  });

  it('same-day edit: updates existing log when status changes', async () => {
    const existingSkippedRow = { ...baseDoseLogRow, status: 'SKIPPED' };
    const updatedLoggedRow = { ...baseDoseLogRow, status: 'LOGGED' };
    // First findFirst: idempotency lookup; second findFirst: re-read after updateMany
    mockDoseLogFindFirst
      .mockResolvedValueOnce(existingSkippedRow)
      .mockResolvedValueOnce(updatedLoggedRow);
    mockProtocolFindFirst.mockResolvedValue(baseProtocolRow);
    mockVialCount.mockResolvedValue(1);
    mockDoseLogUpdate.mockResolvedValue({ count: 1 }); // updateMany returns {count}
    mockAuditCreate.mockResolvedValue({});

    const result = await logDose({
      actorUserId: logActorUserId,
      protocolId: logProtocolId,
      scheduledDate,
      amount,
      status: 'LOGGED',
    });

    expect(result.doseLog.status).toBe('LOGGED');
    expect(mockDoseLogCreate).not.toHaveBeenCalled();
    expect(mockDoseLogUpdate).toHaveBeenCalledOnce();
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'DOSE_LOGGED' }) })
    );
  });

  it('Negative: rejects future dose logging', async () => {
    const futureDate = new Date(Date.UTC(2026, 4, 22)); // tomorrow
    await expect(
      logDose({
        actorUserId: logActorUserId,
        protocolId: logProtocolId,
        scheduledDate: futureDate,
        amount,
        status: 'LOGGED',
      })
    ).rejects.toThrow(/dose_log_too_late/i);
  });
});

/**
 * Story: US-TRK-05 — Batch Log
 */
describe('US-TRK-05: Batch Log', () => {
  const FROZEN_BATCH = new Date(Date.UTC(2026, 4, 21)); // 2026-05-21
  beforeEach(() => { vi.setSystemTime(FROZEN_BATCH); });
  afterAll(() => { vi.useRealTimers(); });

  const batchActorUserId = 'user-batch';
  const proto1Id = 'proto-batch-1';
  const proto2Id = 'proto-batch-2';
  const batchCompoundId = 'compound-bpc157';
  const batchAmount = { amount: '250', unit: 'mcg' as const };

  const makeProtocolRow = (id: string) => ({
    id,
    userId: batchActorUserId,
    compoundId: batchCompoundId,
    cycleId: null,
    dose: batchAmount,
    schedule: { frequency: 'Daily' },
    administrationRoute: 'SubQ',
    status: 'ACTIVE',
    startDate: new Date(Date.UTC(2026, 4, 1)),
    endDate: null,
    notes: null,
  });

  const makeLogRow = (protocolId: string, id: string) => ({
    id,
    protocolId,
    userId: batchActorUserId,
    vialId: null,
    idempotencyKey: `${batchActorUserId}:${protocolId}:2026-05-21`,
    loggedAt: new Date(),
    scheduledDate: FROZEN_BATCH,
    amount: batchAmount,
    status: 'LOGGED',
    injectionSite: null,
    isBatchLog: true,
    note: null,
    loggedByUserId: batchActorUserId,
  });

  it('AC-1: logs all selected ACTIVE protocols as LOGGED with isBatchLog=true', async () => {
    // Protocol lookup: called per-protocol during batchLogDoses
    mockProtocolFindFirst
      .mockResolvedValueOnce(makeProtocolRow(proto1Id))
      .mockResolvedValueOnce(makeProtocolRow(proto2Id));
    // No existing logs
    mockDoseLogFindFirst.mockResolvedValue(null);
    // Vials available
    mockVialCount.mockResolvedValue(2);
    mockDoseLogCreate
      .mockResolvedValueOnce(makeLogRow(proto1Id, 'log-batch-1'))
      .mockResolvedValueOnce(makeLogRow(proto2Id, 'log-batch-2'));
    mockAuditCreate.mockResolvedValue({});

    const result = await batchLogDoses({
      actorUserId: batchActorUserId,
      selectedProtocolIds: [proto1Id, proto2Id],
      scheduledDate: FROZEN_BATCH,
    });

    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.ok)).toBe(true);
    const succeeded = result.results.filter((r) => r.ok) as Array<{ ok: true; doseLog: { isBatchLog: boolean } }>;
    expect(succeeded.every((r) => r.doseLog.isBatchLog)).toBe(true);
  });

  it('AC-2 (partial): already-logged protocols are returned as ok=true with existing log (idempotent)', async () => {
    const existingLog = makeLogRow(proto1Id, 'log-existing');
    mockProtocolFindFirst.mockResolvedValue(makeProtocolRow(proto1Id));
    // idempotency lookup: return existing — vial count is NOT checked for already-logged
    mockDoseLogFindFirst.mockResolvedValue(existingLog);
    mockAuditCreate.mockResolvedValue({});

    const result = await batchLogDoses({
      actorUserId: batchActorUserId,
      selectedProtocolIds: [proto1Id],
      scheduledDate: FROZEN_BATCH,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].ok).toBe(true);
    expect(mockDoseLogCreate).not.toHaveBeenCalled();
    expect(mockVialCount).not.toHaveBeenCalled(); // vials not checked for already-logged
  });

  it('zero vials: batchLogDoses returns ok=false when no inventory available', async () => {
    mockProtocolFindFirst.mockResolvedValue(makeProtocolRow(proto1Id));
    mockDoseLogFindFirst.mockResolvedValue(null); // no existing
    mockVialCount.mockResolvedValue(0); // no vials

    const result = await batchLogDoses({
      actorUserId: batchActorUserId,
      selectedProtocolIds: [proto1Id],
      scheduledDate: FROZEN_BATCH,
    });

    expect(result.results[0].ok).toBe(false);
    expect((result.results[0] as { ok: false; error: string }).error).toMatch(/insufficient_inventory/i);
    expect(mockDoseLogCreate).not.toHaveBeenCalled();
  });

  it('scope guard: batchLogDoses rejects managed-user protocols', async () => {
    const managedProtocol = { ...makeProtocolRow(proto1Id), userId: 'managed-user-id' };
    mockProtocolFindFirst.mockResolvedValue(managedProtocol);

    const result = await batchLogDoses({
      actorUserId: batchActorUserId,
      selectedProtocolIds: [proto1Id],
      scheduledDate: FROZEN_BATCH,
    });

    expect(result.results[0].ok).toBe(false);
    expect((result.results[0] as { ok: false; error: string }).error).toMatch(/batch_scope_violation/i);
  });

  it('AC-6: getDueTodayForBatch returns protocols with availability flags', async () => {
    mockProtocolFindMany.mockResolvedValue([makeProtocolRow(proto1Id), makeProtocolRow(proto2Id)]);
    // proto1: no vials; proto2: has vials
    mockVialCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    // No existing logs
    mockDoseLogFindFirst.mockResolvedValue(null);

    const items = await getDueTodayForBatch(batchActorUserId);

    expect(items).toHaveLength(2);
    const item1 = items.find((i) => i.protocol.id === proto1Id)!;
    const item2 = items.find((i) => i.protocol.id === proto2Id)!;
    expect(item1.isAvailable).toBe(false); // no vials
    expect(item2.isAvailable).toBe(true);
  });

  it('schedule filter: getDueTodayForBatch excludes EOD protocols not due today', async () => {
    // EOD protocol starting 2026-05-20 (yesterday) — next dose is 2026-05-22, not today
    const eodProtocol = {
      ...makeProtocolRow(proto1Id),
      schedule: { frequency: 'EOD' },
      startDate: new Date(Date.UTC(2026, 4, 20)), // yesterday
    };
    mockProtocolFindMany.mockResolvedValue([eodProtocol]);

    const items = await getDueTodayForBatch(batchActorUserId);

    expect(items).toHaveLength(0); // EOD not due today
  });

  it('schedule filter: logOneInBatch rejects protocols not scheduled for the given date', async () => {
    const eodProtocol = {
      ...makeProtocolRow(proto1Id),
      schedule: { frequency: 'EOD' },
      startDate: new Date(Date.UTC(2026, 4, 20)), // yesterday — next EOD dose is 2026-05-22
    };
    mockProtocolFindFirst.mockResolvedValue(eodProtocol);
    mockDoseLogFindFirst.mockResolvedValue(null);
    mockVialCount.mockResolvedValue(1);

    const result = await batchLogDoses({
      actorUserId: batchActorUserId,
      selectedProtocolIds: [proto1Id],
      scheduledDate: FROZEN_BATCH, // 2026-05-21 is not a scheduled day
    });

    expect(result.results[0].ok).toBe(false);
    expect((result.results[0] as { ok: false; error: string }).error).toMatch(/no_dose_scheduled/i);
  });

  it('SKIPPED→LOGGED: batchLogDoses converts an existing SKIPPED log to LOGGED', async () => {
    const skippedLog = { ...makeLogRow(proto1Id, 'log-skipped'), status: 'SKIPPED' };
    mockProtocolFindFirst.mockResolvedValue(makeProtocolRow(proto1Id));
    mockDoseLogFindFirst.mockResolvedValue(skippedLog); // idempotency check returns SKIPPED
    mockVialCount.mockResolvedValue(2); // vials required even for SKIPPED→LOGGED
    mockDoseLogUpdate.mockResolvedValue({ ...skippedLog, status: 'LOGGED' });
    mockAuditCreate.mockResolvedValue({});

    const result = await batchLogDoses({
      actorUserId: batchActorUserId,
      selectedProtocolIds: [proto1Id],
      scheduledDate: FROZEN_BATCH,
    });

    expect(result.results[0].ok).toBe(true);
    expect(mockDoseLogCreate).not.toHaveBeenCalled(); // updateMany, not create
    expect(mockDoseLogUpdate).toHaveBeenCalled();
    expect(mockVialCount).toHaveBeenCalled(); // vial check enforced for SKIPPED→LOGGED
  });

  // AC-3 (offline sync) deferred to Task 2.6
  it.todo('AC-3: queues batch log while offline');
});

/**
 * Story: US-TRK-08 — Manage Cycles
 */
describe('US-TRK-08: Manage Cycles', () => {
  it.todo('AC-1: creates cycle with name and date range');
  it.todo('AC-2: links multiple protocols to one cycle');
  it.todo('AC-3: displays current week number on dashboard');
});
