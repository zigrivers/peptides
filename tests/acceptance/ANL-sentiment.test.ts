import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOutcomeFindMany = vi.fn();
const mockDoseFindMany = vi.fn();
const mockProtocolFindMany = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    outcomeLog: { findMany: mockOutcomeFindMany },
    doseLog: { findMany: mockDoseFindMany },
    protocol: { findMany: mockProtocolFindMany },
  },
}));

// Import after the mock is declared
const { getWellbeingSentimentInsights } = await import(
  '@/lib/tracker/application/OutcomeLogService'
);

describe('getWellbeingSentimentInsights Service Method', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns empty and null values when no data exists', async () => {
    mockOutcomeFindMany.mockResolvedValue([]);
    mockDoseFindMany.mockResolvedValue([]);
    mockProtocolFindMany.mockResolvedValue([]);

    const result = await getWellbeingSentimentInsights('user-1');

    expect(result).toEqual({
      averageRating: null,
      tagFrequencies: [],
      notesSummary: [],
      compoundCorrelations: [],
    });
  });

  it('correctly compiles average rating, tag stats, notes, and compound dose correlations', async () => {
    // 180-day window logs
    const dateToday = new Date('2026-05-24T12:00:00Z');
    const dateYesterday = new Date('2026-05-23T12:00:00Z');
    const dateDayBefore = new Date('2026-05-22T12:00:00Z');

    mockOutcomeFindMany.mockResolvedValue([
      {
        overallRating: 5,
        tags: ['energy', 'focus'],
        note: 'Felt amazing today',
        scheduledDate: dateToday,
      },
      {
        overallRating: 4,
        tags: ['focus'],
        note: 'Good focus yesterday',
        scheduledDate: dateYesterday,
      },
      {
        overallRating: 2,
        tags: ['fatigue'],
        note: 'Rather tired',
        scheduledDate: dateDayBefore,
      },
    ]);

    mockDoseFindMany.mockResolvedValue([
      {
        protocolId: 'proto-tirz',
        scheduledDate: dateToday,
      },
      {
        protocolId: 'proto-tirz',
        scheduledDate: dateYesterday,
      },
    ]);

    mockProtocolFindMany.mockResolvedValue([
      {
        id: 'proto-tirz',
        compound: { name: 'Tirzepatide' },
      },
    ]);

    const result = await getWellbeingSentimentInsights('user-1');

    // Check average overall rating ( (5 + 4 + 2) / 3 = 3.666... )
    expect(result.averageRating).toBeCloseTo(3.67, 2);

    // Check tag frequencies sorted descending
    // 'focus' count=2 avg=4.5, 'energy' count=1 avg=5, 'fatigue' count=1 avg=2
    expect(result.tagFrequencies).toHaveLength(3);
    expect(result.tagFrequencies[0]).toEqual({ tag: 'focus', count: 2, avgRating: 4.5 });
    expect(result.tagFrequencies[1].count).toBe(1);

    // Check notes (newest first, based on outcomes order)
    expect(result.notesSummary).toHaveLength(3);
    expect(result.notesSummary[0]).toEqual({
      date: '2026-05-24',
      rating: 5,
      note: 'Felt amazing today',
    });

    // Check compound correlations
    // Tirzepatide dosed on: 2026-05-24 (rating 5), 2026-05-23 (rating 4) => avg = 4.5
    // Tirzepatide not dosed on: 2026-05-22 (rating 2) => avg = 2
    expect(result.compoundCorrelations).toHaveLength(1);
    expect(result.compoundCorrelations[0]).toEqual({
      compoundName: 'Tirzepatide',
      averageRatingOnDosedDays: 4.5,
      averageRatingOnNotDosedDays: 2.0,
      dosedDaysCount: 2,
      notDosedDaysCount: 1,
    });
  });
});
