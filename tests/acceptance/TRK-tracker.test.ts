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
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
        doseLog: { create: mockDoseLogCreate, update: mockDoseLogUpdate },
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
const { generateScheduleDates } = await import(
  '@/lib/tracker/domain/ScheduleGenerator'
);
const { logDose } = await import('@/lib/tracker/application/DoseLogService');

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
    mockDoseLogFindFirst.mockResolvedValue(existingSkippedRow);
    mockProtocolFindFirst.mockResolvedValue(baseProtocolRow);
    mockVialCount.mockResolvedValue(1);
    mockDoseLogUpdate.mockResolvedValue(updatedLoggedRow);
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
  it.todo('AC-1: logs all scheduled doses in one action');
  it.todo('AC-2: allows deselecting doses in review sheet');
});

/**
 * Story: US-TRK-08 — Manage Cycles
 */
describe('US-TRK-08: Manage Cycles', () => {
  it.todo('AC-1: creates cycle with name and date range');
  it.todo('AC-2: links multiple protocols to one cycle');
  it.todo('AC-3: displays current week number on dashboard');
});
