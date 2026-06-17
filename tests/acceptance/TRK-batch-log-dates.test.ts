import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockLogDose: vi.fn(),
  mockGetManagedUserIds: vi.fn(),
  mockFindProtocolByIdForActor: vi.fn(),
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

// Mock DoseLogService
vi.mock('@/lib/tracker/application/DoseLogService', () => ({
  logDose: (input: any, tx: any) => mocks.mockLogDose(input, tx),
}));

// Mock ProtocolService / ProtocolRepo
vi.mock('@/lib/tracker/application/ProtocolService', () => ({
  getManagedUserIds: () => mocks.mockGetManagedUserIds(),
}));

vi.mock('@/lib/tracker/infrastructure/ProtocolRepo', () => ({
  findProtocolByIdForActor: () => mocks.mockFindProtocolByIdForActor(),
}));

// Mock prisma and transaction client
vi.mock('@/lib/shared/prisma', () => {
  return {
    prisma: {
      $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn('mock-tx-client')),
    },
  };
});

import { batchLogDatesAction } from '@/app/actions/tracker/batch-log-dates';

describe('TRK-batch-log-dates', () => {
  const actorUserId = 'user-111';
  const protocolId = 'proto-222';
  const mockProtocol = {
    id: protocolId,
    userId: actorUserId,
    status: 'ACTIVE',
    dose: { amount: '5', unit: 'mg' },
    schedule: { frequency: 'Daily' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAuth.mockResolvedValue({ user: { id: actorUserId } });
    mocks.mockGetManagedUserIds.mockResolvedValue([]);
    mocks.mockFindProtocolByIdForActor.mockResolvedValue(mockProtocol);
    mocks.mockLogDose.mockResolvedValue({ id: 'dose-log-xyz' });
  });

  it('fails if unauthorized', async () => {
    mocks.mockAuth.mockResolvedValueOnce(null);
    const result = await batchLogDatesAction({
      protocolId,
      dates: ['2026-05-10'],
      status: 'LOGGED',
    });
    expect(result).toEqual({
      ok: false,
      error: 'unauthorized',
      message: 'You must be signed in.',
    });
  });

  it('fails if input validation fails (e.g. empty dates list)', async () => {
    const result = await batchLogDatesAction({
      protocolId,
      dates: [],
      status: 'LOGGED',
    });
    expect(result).toEqual(expect.objectContaining({ ok: false, error: 'invalid_input' }));
  });

  it('runs batch logging in a single database transaction and revalidates paths', async () => {
    const result = await batchLogDatesAction({
      protocolId,
      dates: ['2026-05-10', '2026-05-12'],
      status: 'LOGGED',
      note: 'Batch logged!',
    });

    expect(result).toEqual({ ok: true });

    // Expect logDose to be called twice inside the transaction
    expect(mocks.mockLogDose).toHaveBeenCalledTimes(2);

    // Call 1
    expect(mocks.mockLogDose).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        actorUserId,
        protocolId,
        status: 'LOGGED',
        note: 'Batch logged!',
        requireInjectionSite: false,
      }),
      'mock-tx-client'
    );

    // Call 2
    expect(mocks.mockLogDose).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        actorUserId,
        protocolId,
        status: 'LOGGED',
        note: 'Batch logged!',
        requireInjectionSite: false,
      }),
      'mock-tx-client'
    );

    expect(mocks.mockRevalidatePath).toHaveBeenCalled();
  });

  it('once-daily: logs exactly one slot 0 per date (backward-compatible)', async () => {
    const result = await batchLogDatesAction({
      protocolId,
      dates: ['2026-05-10', '2026-05-12'],
      status: 'LOGGED',
    });

    expect(result).toEqual({ ok: true });
    // One slot per date → 2 calls, both doseSlot 0.
    expect(mocks.mockLogDose).toHaveBeenCalledTimes(2);
    expect(mocks.mockLogDose).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ protocolId, doseSlot: 0 }),
      'mock-tx-client'
    );
    expect(mocks.mockLogDose).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ protocolId, doseSlot: 0 }),
      'mock-tx-client'
    );
  });

  it('twice-daily: logs both slots (0 and 1) per date', async () => {
    mocks.mockFindProtocolByIdForActor.mockResolvedValue({
      ...mockProtocol,
      schedule: { frequency: 'TwiceDaily' },
    });

    const result = await batchLogDatesAction({
      protocolId,
      dates: ['2026-05-10', '2026-05-12'],
      status: 'LOGGED',
    });

    expect(result).toEqual({ ok: true });
    // 2 dates × 2 slots = 4 calls; slots alternate 0,1 per date.
    expect(mocks.mockLogDose).toHaveBeenCalledTimes(4);
    const slots = mocks.mockLogDose.mock.calls.map((c) => c[0].doseSlot);
    expect(slots).toEqual([0, 1, 0, 1]);
  });

  it('rejects invalid calendar dates (e.g. rollover dates)', async () => {
    const result = await batchLogDatesAction({
      protocolId,
      dates: ['2026-02-30'],
      status: 'LOGGED',
    });

    expect(result).toEqual({
      ok: false,
      error: 'invalid_input',
      message: 'Invalid calendar date.',
    });
    expect(mocks.mockLogDose).not.toHaveBeenCalled();
  });

  it('rolls back and propagates errors if one of the date logs fails', async () => {
    // Make the second log call fail
    mocks.mockLogDose
      .mockResolvedValueOnce({ id: 'dose-log-1' })
      .mockRejectedValueOnce(new Error('dose_log_too_late'));

    const result = await batchLogDatesAction({
      protocolId,
      dates: ['2026-05-10', '2026-05-24'],
      status: 'LOGGED',
    });

    expect(result).toEqual({
      ok: false,
      error: 'dose_log_too_late',
      message: 'Cannot log a dose for a future date.',
    });
  });
});
