/**
 * Story: US-TRK-06 — Subjective Outcome Logging
 * Story: US-TRK-07 — Outcome-Dose Correlation Timeline
 * Task 5.3
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOutcomeFindFirst = vi.fn();
const mockOutcomeFindMany = vi.fn();
const mockOutcomeCreate = vi.fn();
const mockOutcomeUpdateMany = vi.fn();
const mockProtocolFindMany = vi.fn();
const mockProtocolRatingDeleteMany = vi.fn();
const mockProtocolRatingCreateMany = vi.fn();
const mockDoseLogFindMany = vi.fn();
const mockAuditCreate = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    outcomeLog: {
      findFirst: mockOutcomeFindFirst,
      findMany: mockOutcomeFindMany,
      create: mockOutcomeCreate,
      updateMany: mockOutcomeUpdateMany,
    },
    protocolRating: {
      deleteMany: mockProtocolRatingDeleteMany,
      createMany: mockProtocolRatingCreateMany,
    },
    protocol: { findMany: mockProtocolFindMany },
    doseLog: { findMany: mockDoseLogFindMany },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        outcomeLog: {
          findFirst: mockOutcomeFindFirst,
          create: mockOutcomeCreate,
          updateMany: mockOutcomeUpdateMany,
        },
        protocolRating: {
          deleteMany: mockProtocolRatingDeleteMany,
          createMany: mockProtocolRatingCreateMany,
        },
        auditEvent: { create: mockAuditCreate },
      }),
  },
}));

const USER_ID = 'user-1';
const TODAY = new Date(Date.UTC(2026, 4, 23)); // 2026-05-23

beforeEach(() => {
  vi.resetAllMocks();
  mockOutcomeFindFirst.mockResolvedValue(null);
  mockOutcomeCreate.mockResolvedValue({ id: 'ol-new' });
  mockOutcomeUpdateMany.mockResolvedValue({ count: 1 });
  mockProtocolRatingDeleteMany.mockResolvedValue({ count: 0 });
  mockProtocolRatingCreateMany.mockResolvedValue({ count: 0 });
  mockProtocolFindMany.mockResolvedValue([]);
  mockOutcomeFindMany.mockResolvedValue([]);
  mockDoseLogFindMany.mockResolvedValue([]);
});

const {
  upsertOutcome,
  getOutcomeForDate,
  getTimelineSeries,
  getCorrelationStats,
  getTopTagSuggestions,
} = await import('@/lib/tracker/application/OutcomeLogService');

describe('US-TRK-06: upsertOutcome', () => {
  it('AC-1: creates a new outcome and writes OUTCOME_LOGGED audit', async () => {
    mockOutcomeFindFirst.mockResolvedValueOnce(null); // inside repo upsertWithRatings: existing? = no
    mockOutcomeCreate.mockResolvedValueOnce({ id: 'ol-1' });

    const result = await upsertOutcome(USER_ID, {
      scheduledDate: TODAY,
      overallRating: 4,
      tags: ['energy', 'focus'],
      note: 'great day',
    });

    expect(result.created).toBe(true);
    expect(mockOutcomeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER_ID,
          overallRating: 4,
          tags: ['energy', 'focus'],
          note: 'great day',
        }),
      })
    );
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'OUTCOME_LOGGED' }),
      })
    );
  });

  it('AC-2: updates the existing outcome and writes OUTCOME_UPDATED audit', async () => {
    mockOutcomeFindFirst.mockResolvedValueOnce({ id: 'ol-1' }); // inside repo
    await upsertOutcome(USER_ID, {
      scheduledDate: TODAY,
      overallRating: 3,
      tags: [],
    });
    expect(mockOutcomeUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ol-1', userId: USER_ID },
        data: expect.objectContaining({ overallRating: 3 }),
      })
    );
    expect(mockProtocolRatingDeleteMany).toHaveBeenCalledWith({
      where: { outcomeLogId: 'ol-1', outcomeLog: { is: { userId: USER_ID } } },
    });
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'OUTCOME_UPDATED' }),
      })
    );
  });

  it('AC-3: rejects rating < 1 or > 5', async () => {
    await expect(
      upsertOutcome(USER_ID, { scheduledDate: TODAY, overallRating: 0, tags: [] })
    ).rejects.toThrow();
    await expect(
      upsertOutcome(USER_ID, { scheduledDate: TODAY, overallRating: 6, tags: [] })
    ).rejects.toThrow();
    expect(mockOutcomeCreate).not.toHaveBeenCalled();
  });

  it('AC-4: trims tags and rejects empty-after-trim', async () => {
    await expect(
      upsertOutcome(USER_ID, {
        scheduledDate: TODAY,
        overallRating: 4,
        tags: ['  '], // becomes empty after trim → invalid
      })
    ).rejects.toThrow();
  });

  it('AC-5: rejects note > 1000 chars', async () => {
    await expect(
      upsertOutcome(USER_ID, {
        scheduledDate: TODAY,
        overallRating: 4,
        tags: [],
        note: 'a'.repeat(1001),
      })
    ).rejects.toThrow();
  });

  it('AC-8e: rejects ratings for owned-but-inactive protocols', async () => {
    // findMany is filtered by `status: 'ACTIVE'` in the service — returning []
    // here simulates an existing-but-PAUSED protocol that the actor owns.
    mockProtocolFindMany.mockResolvedValueOnce([]);
    await expect(
      upsertOutcome(USER_ID, {
        scheduledDate: TODAY,
        overallRating: 4,
        tags: [],
        protocolRatings: [{ protocolId: 'p-paused', rating: 4 }],
      })
    ).rejects.toThrow('protocol_not_owned');
    expect(mockOutcomeCreate).not.toHaveBeenCalled();
  });

  it('AC-8: rejects protocolRatings referencing protocols not owned by the actor', async () => {
    mockProtocolFindMany.mockResolvedValueOnce([{ id: 'p-1' }]); // only one of two requested is owned
    await expect(
      upsertOutcome(USER_ID, {
        scheduledDate: TODAY,
        overallRating: 4,
        tags: [],
        protocolRatings: [
          { protocolId: 'p-1', rating: 4 },
          { protocolId: 'p-not-mine', rating: 3 },
        ],
      })
    ).rejects.toThrow('protocol_not_owned');
    expect(mockOutcomeCreate).not.toHaveBeenCalled();
  });

  it('AC-8b: creates ProtocolRatings via createMany when ownership checks pass', async () => {
    mockProtocolFindMany.mockResolvedValueOnce([{ id: 'p-1' }, { id: 'p-2' }]);
    mockOutcomeFindFirst.mockResolvedValueOnce(null); // first-time outcome
    mockOutcomeCreate.mockResolvedValueOnce({ id: 'ol-2' });

    await upsertOutcome(USER_ID, {
      scheduledDate: TODAY,
      overallRating: 5,
      tags: [],
      protocolRatings: [
        { protocolId: 'p-1', rating: 4 },
        { protocolId: 'p-2', rating: 3 },
      ],
    });

    expect(mockOutcomeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          protocolRatings: {
            create: [
              { protocolId: 'p-1', rating: 4 },
              { protocolId: 'p-2', rating: 3 },
            ],
          },
        }),
      })
    );
  });

  it('AC-8c: emits one PROTOCOL_RATED audit per submitted rating', async () => {
    mockProtocolFindMany.mockResolvedValueOnce([{ id: 'p-1' }, { id: 'p-2' }]);
    mockOutcomeFindFirst.mockResolvedValueOnce(null);
    mockOutcomeCreate.mockResolvedValueOnce({ id: 'ol-3' });

    await upsertOutcome(USER_ID, {
      scheduledDate: TODAY,
      overallRating: 4,
      tags: [],
      protocolRatings: [
        { protocolId: 'p-1', rating: 4 },
        { protocolId: 'p-2', rating: 5 },
      ],
    });

    const ratedCalls = mockAuditCreate.mock.calls.filter(
      (call) => call[0]?.data?.action === 'PROTOCOL_RATED'
    );
    expect(ratedCalls).toHaveLength(2);
    expect(ratedCalls[0][0].data.resourceId).toBe('p-1');
    expect(ratedCalls[1][0].data.resourceId).toBe('p-2');
  });

  it('AC-8d: dedupes duplicate protocolIds (last-write-wins) before audit/createMany', async () => {
    mockProtocolFindMany.mockResolvedValueOnce([{ id: 'p-1' }]);
    mockOutcomeFindFirst.mockResolvedValueOnce(null);
    mockOutcomeCreate.mockResolvedValueOnce({ id: 'ol-4' });

    await upsertOutcome(USER_ID, {
      scheduledDate: TODAY,
      overallRating: 4,
      tags: [],
      protocolRatings: [
        { protocolId: 'p-1', rating: 3 },
        { protocolId: 'p-1', rating: 5 }, // duplicate — wins
      ],
    });

    expect(mockOutcomeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          protocolRatings: { create: [{ protocolId: 'p-1', rating: 5 }] },
        }),
      })
    );
    const ratedCalls = mockAuditCreate.mock.calls.filter(
      (call) => call[0]?.data?.action === 'PROTOCOL_RATED'
    );
    expect(ratedCalls).toHaveLength(1);
    expect(ratedCalls[0][0].data.metadata.rating).toBe(5);
  });
});

describe('US-TRK-06: getOutcomeForDate', () => {
  it('returns null when no outcome exists', async () => {
    mockOutcomeFindFirst.mockResolvedValueOnce(null);
    const result = await getOutcomeForDate(USER_ID, TODAY);
    expect(result).toBeNull();
  });

  it('returns the row including ProtocolRatings', async () => {
    const row = {
      id: 'ol-1',
      userId: USER_ID,
      scheduledDate: TODAY,
      overallRating: 4,
      tags: ['energy'],
      note: null,
      loggedAt: new Date(),
      protocolRatings: [{ id: 'pr-1', protocolId: 'p-1', rating: 4 }],
    };
    mockOutcomeFindFirst.mockResolvedValueOnce(row);
    const result = await getOutcomeForDate(USER_ID, TODAY);
    expect(result?.overallRating).toBe(4);
    expect(result?.protocolRatings).toHaveLength(1);
  });
});

describe('US-TRK-06: getTopTagSuggestions (AC-3)', () => {
  it('returns the 3 most-frequent tags from the past 14 days', async () => {
    mockOutcomeFindMany.mockResolvedValueOnce([
      { tags: ['energy', 'focus'] },
      { tags: ['energy', 'sleep'] },
      { tags: ['energy', 'mood'] },
      { tags: ['focus'] },
    ]);
    const tags = await getTopTagSuggestions(USER_ID);
    expect(tags).toEqual(['energy', 'focus', 'mood']); // alphabetical tiebreak between mood (1) and sleep (1) — mood wins
  });
});

describe('US-TRK-07: getTimelineSeries', () => {
  it('AC-1: returns N daily buckets for a 30-day window', async () => {
    const series = await getTimelineSeries(USER_ID, 30);
    expect(series).toHaveLength(30);
    expect(series[0].doseEvents).toBe(0);
    expect(series[0].outcomeRating).toBeNull();
  });

  it('AC-2: returns 90 buckets for the 90-day window', async () => {
    const series = await getTimelineSeries(USER_ID, 90);
    expect(series).toHaveLength(90);
  });

  it('returns empty for days <= 0', async () => {
    expect(await getTimelineSeries(USER_ID, 0)).toEqual([]);
    expect(await getTimelineSeries(USER_ID, -5)).toEqual([]);
  });

  it('aggregates dose-log counts per day correctly', async () => {
    // Create 3 LOGGED doses on the same day (today).
    const today = new Date();
    const todayMidnight = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    mockDoseLogFindMany.mockResolvedValueOnce([
      { scheduledDate: todayMidnight },
      { scheduledDate: todayMidnight },
      { scheduledDate: todayMidnight },
    ]);
    const series = await getTimelineSeries(USER_ID, 7);
    expect(series.at(-1)?.doseEvents).toBe(3);
  });
});

describe('US-TRK-07: getCorrelationStats (AC-2)', () => {
  it('returns null averages with no data', async () => {
    const stats = await getCorrelationStats(USER_ID, 30);
    expect(stats.averageOnDosedDays).toBeNull();
    expect(stats.averageOnNotDosedDays).toBeNull();
    expect(stats.outcomeDays).toBe(0);
  });

  it('computes average on dosed vs not-dosed days', async () => {
    const now = new Date();
    const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterdayMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
    );
    mockDoseLogFindMany.mockResolvedValueOnce([{ scheduledDate: todayMidnight }]); // dose today only
    mockOutcomeFindMany.mockResolvedValueOnce([
      { scheduledDate: todayMidnight, overallRating: 4 },
      { scheduledDate: yesterdayMidnight, overallRating: 2 },
    ]);
    const stats = await getCorrelationStats(USER_ID, 7);
    expect(stats.dosedDays).toBe(1);
    expect(stats.averageOnDosedDays).toBe(4);
    expect(stats.notDosedDays).toBe(1);
    expect(stats.averageOnNotDosedDays).toBe(2);
  });
});
