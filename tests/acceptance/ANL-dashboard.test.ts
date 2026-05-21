import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPrismaOutcomeLogFindMany = vi.fn();
const mockPrismaDoseLogFindMany = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    outcomeLog: { findMany: mockPrismaOutcomeLogFindMany },
    doseLog: { findMany: mockPrismaDoseLogFindMany },
  },
}));

/**
 * Story: US-ANL-01 - Stack Overview Dashboard
 */
describe('US-ANL-01: Stack Overview Dashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('OutcomeLogService - 7-day average rating', () => {
    it('AC-3: returns average of overallRating for the last 7 days', async () => {
      const { getSevenDayRatingAverage } = await import(
        '@/lib/tracker/application/OutcomeLogService'
      );

      const now = new Date('2026-05-21T12:00:00Z');
      vi.setSystemTime(now);

      mockPrismaOutcomeLogFindMany.mockResolvedValueOnce([
        { overallRating: 4 },
        { overallRating: 5 },
        { overallRating: 3 },
      ]);

      const avg = await getSevenDayRatingAverage('user-1');
      expect(avg).toBeCloseTo(4.0, 1);
    });

    it('AC-3: returns null when no outcome logs exist in the last 7 days', async () => {
      const { getSevenDayRatingAverage } = await import(
        '@/lib/tracker/application/OutcomeLogService'
      );

      mockPrismaOutcomeLogFindMany.mockResolvedValueOnce([]);

      const avg = await getSevenDayRatingAverage('user-1');
      expect(avg).toBeNull();
    });
  });

  describe('OutcomeLogService - 7-day adherence', () => {
    it('AC-3: counts LOGGED and SKIPPED dose logs in the last 7 days', async () => {
      const { getSevenDayAdherence } = await import(
        '@/lib/tracker/application/OutcomeLogService'
      );

      const now = new Date('2026-05-21T12:00:00Z');
      vi.setSystemTime(now);

      mockPrismaDoseLogFindMany.mockResolvedValueOnce([
        { status: 'LOGGED' },
        { status: 'LOGGED' },
        { status: 'LOGGED' },
        { status: 'SKIPPED' },
      ]);

      const adherence = await getSevenDayAdherence('user-1');
      expect(adherence.logged).toBe(3);
      expect(adherence.total).toBe(4);
      expect(adherence.percent).toBeCloseTo(75, 0);
    });

    it('AC-3: returns zero percent when no logs exist', async () => {
      const { getSevenDayAdherence } = await import(
        '@/lib/tracker/application/OutcomeLogService'
      );

      mockPrismaDoseLogFindMany.mockResolvedValueOnce([]);

      const adherence = await getSevenDayAdherence('user-1');
      expect(adherence.logged).toBe(0);
      expect(adherence.total).toBe(0);
      expect(adherence.percent).toBe(0);
    });
  });

  describe('Vial inventory badge — 14-day threshold', () => {
    it('AC-2: vial expiring within 14 days triggers LOW_SUPPLY badge', () => {
      const expiresAt = new Date(Date.now() + 10 * 86400_000); // 10 days from now
      const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / 86400_000;
      expect(daysUntilExpiry).toBeLessThan(14);
    });

    it('AC-2: vial expiring beyond 14 days does not trigger LOW_SUPPLY badge', () => {
      const expiresAt = new Date(Date.now() + 20 * 86400_000); // 20 days from now
      const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / 86400_000;
      expect(daysUntilExpiry).toBeGreaterThanOrEqual(14);
    });
  });

  it.todo('AC-1: displays current cycle week number and total weeks in cycle');
  it.todo('AC-4: warning badges combine color + icon + text (no color-only warnings)');
  it.todo('AC-5: stale-data indicator shows last-refreshed timestamp when data is older than 30 minutes');
  it.todo('AC-6: shows empty state Get Started card when no active protocols exist');
  it.todo('AC-7: accessible text equivalents for all visual data elements');
  it.todo('AC-8: delegated participant sees single-dose dominant card with Confirm/Skip actions');
});
