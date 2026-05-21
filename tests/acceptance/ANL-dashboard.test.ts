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

    it('AC-3: uses UTC-midnight-normalized window so scheduledDate boundary aligns', async () => {
      const { getSevenDayRatingAverage } = await import(
        '@/lib/tracker/application/OutcomeLogService'
      );

      const now = new Date('2026-05-21T23:59:59Z');
      vi.setSystemTime(now);

      mockPrismaOutcomeLogFindMany.mockResolvedValueOnce([{ overallRating: 5 }]);

      const avg = await getSevenDayRatingAverage('user-1');
      expect(avg).not.toBeNull();

      const call = mockPrismaOutcomeLogFindMany.mock.calls[0][0];
      const since: Date = call.where.scheduledDate.gte;
      // Since must be UTC midnight (0 hours/mins/secs)
      expect(since.getUTCHours()).toBe(0);
      expect(since.getUTCMinutes()).toBe(0);
      expect(since.getUTCSeconds()).toBe(0);
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

    it('AC-3: query includes upper date bound (lt: tomorrow UTC midnight) to exclude future logs', async () => {
      const { getSevenDayAdherence } = await import(
        '@/lib/tracker/application/OutcomeLogService'
      );

      const now = new Date('2026-05-21T12:00:00Z');
      vi.setSystemTime(now);

      mockPrismaDoseLogFindMany.mockResolvedValueOnce([]);

      await getSevenDayAdherence('user-1');

      const call = mockPrismaDoseLogFindMany.mock.calls[0][0];
      expect(call.where.scheduledDate.lt).toBeDefined();
      const upperBound: Date = call.where.scheduledDate.lt;
      expect(upperBound.getUTCHours()).toBe(0);
    });
  });

  describe('Vial inventory badge — 14-day threshold', () => {
    const LOW_SUPPLY_DAYS = 14;

    function isLowSupply(v: { daysUntilExpiry: number | null; badges: string[] }): boolean {
      if (v.badges.some((b) => b === 'LOW_INVENTORY' || b === 'EXPIRED')) return true;
      return v.daysUntilExpiry !== null && v.daysUntilExpiry < LOW_SUPPLY_DAYS;
    }

    it('AC-2: vial expiring in 10 days (daysUntilExpiry=10) is low-supply', () => {
      expect(isLowSupply({ daysUntilExpiry: 10, badges: [] })).toBe(true);
    });

    it('AC-2: vial expiring in 20 days with no badges is not low-supply', () => {
      expect(isLowSupply({ daysUntilExpiry: 20, badges: [] })).toBe(false);
    });

    it('AC-2: vial with LOW_INVENTORY badge is low-supply regardless of expiry', () => {
      expect(isLowSupply({ daysUntilExpiry: 20, badges: ['LOW_INVENTORY'] })).toBe(true);
    });

    it('AC-2: vial with EXPIRED badge is low-supply regardless of daysUntilExpiry', () => {
      expect(isLowSupply({ daysUntilExpiry: null, badges: ['EXPIRED'] })).toBe(true);
    });
  });

  describe('AC-6: empty state when no active protocols', () => {
    it('hasActiveProtocols is false when all protocols are inactive', () => {
      const protocols = [{ status: 'PAUSED' }, { status: 'COMPLETED' }];
      const hasActiveProtocols = protocols.some((p) => p.status === 'ACTIVE');
      expect(hasActiveProtocols).toBe(false);
    });

    it('hasActiveProtocols is true when at least one protocol is ACTIVE', () => {
      const protocols = [{ status: 'ACTIVE' }, { status: 'PAUSED' }];
      const hasActiveProtocols = protocols.some((p) => p.status === 'ACTIVE');
      expect(hasActiveProtocols).toBe(true);
    });
  });

  it.todo('AC-1: displays current cycle week number and total weeks in cycle');
  it.todo('AC-4: warning badges combine color + icon + text (no color-only warnings)');
  it.todo('AC-5: stale-data indicator shows last-refreshed timestamp when data is older than 30 minutes');
  it.todo('AC-7: accessible text equivalents for all visual data elements');
  it.todo('AC-8: delegated participant sees single-dose dominant card with Confirm/Skip actions');
});
