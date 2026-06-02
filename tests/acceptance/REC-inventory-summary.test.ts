import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/shared/prisma';
import {
  getInventorySummaryByCompound,
  VIAL_STATUS,
} from '@/lib/reconstitution/application/VialService';
import type { Protocol } from '@/lib/tracker/domain/types';

vi.mock('@/lib/shared/prisma', () => {
  const mockFindFirst = vi.fn();
  const mockFindMany = vi.fn();

  return {
    prisma: {
      vial: {
        findFirst: mockFindFirst,
        findMany: mockFindMany,
      },
    },
  };
});

const NOW = new Date('2026-06-02T00:00:00.000Z');

function farExpiry(): Date {
  // 60 days out — no EXPIRING_SOON badge
  return new Date('2026-08-01T00:00:00.000Z');
}

function soonExpiry(): Date {
  // 3 days out — EXPIRING_SOON badge
  return new Date('2026-06-05T00:00:00.000Z');
}

function pastExpiry(): Date {
  return new Date('2026-05-01T00:00:00.000Z');
}

interface RawVialOpts {
  id: string;
  compoundId: string;
  compoundName: string;
  compoundSlug: string;
  totalMg: string;
  remainingMg: string;
  bacWaterMl: string | null;
  status: string;
  expiresAt: Date | null;
  isActiveForCompound?: boolean;
  shelfOrder?: number;
  reconstitutedAt?: Date | null;
}

function rawVial(opts: RawVialOpts) {
  return {
    id: opts.id,
    userId: 'user-1',
    compoundId: opts.compoundId,
    totalMg: new Decimal(opts.totalMg),
    remainingMg: new Decimal(opts.remainingMg),
    bacWaterMl: opts.bacWaterMl ? new Decimal(opts.bacWaterMl) : null,
    status: opts.status,
    expiresAt: opts.expiresAt,
    reconstitutedAt: opts.reconstitutedAt ?? null,
    isActiveForCompound: opts.isActiveForCompound ?? false,
    shelfOrder: opts.shelfOrder ?? 0,
    compound: { name: opts.compoundName, slug: opts.compoundSlug },
  };
}

function mgProtocol(compoundId: string, amount: string, status = 'ACTIVE'): Protocol {
  return {
    id: `proto-${compoundId}-${amount}`,
    userId: 'user-1',
    compoundId,
    cycleId: null,
    dose: { amount, unit: 'mg' },
    schedule: { frequency: 'Daily' },
    administrationRoute: 'SubQ',
    status: status as Protocol['status'],
    startDate: new Date('2026-01-01'),
    endDate: null,
    notes: null,
  };
}

function iuProtocol(compoundId: string, amount: string, status = 'ACTIVE'): Protocol {
  return {
    ...mgProtocol(compoundId, amount, status),
    dose: { amount, unit: 'IU' },
  };
}

describe('getInventorySummaryByCompound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  it('queries only DRY/RECONSTITUTED/EXPIRED vials, userId-scoped, with take cap', async () => {
    vi.mocked(prisma.vial.findMany).mockResolvedValue([]);

    await getInventorySummaryByCompound('user-1', [], 'U100');

    expect(prisma.vial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          status: { in: [VIAL_STATUS.DRY, VIAL_STATUS.RECONSTITUTED, VIAL_STATUS.EXPIRED] },
        },
        include: { compound: { select: { name: true, slug: true } } },
        take: 500,
      })
    );
  });

  it('groups by compound and accumulates mixed DRY + RECONSTITUTED counts', async () => {
    vi.mocked(prisma.vial.findMany).mockResolvedValue([
      rawVial({
        id: 'r1',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '10',
        remainingMg: '8',
        bacWaterMl: '2',
        status: VIAL_STATUS.RECONSTITUTED,
        expiresAt: farExpiry(),
      }),
      rawVial({
        id: 'd1',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '10',
        remainingMg: '10',
        bacWaterMl: null,
        status: VIAL_STATUS.DRY,
        expiresAt: farExpiry(),
      }),
      rawVial({
        id: 'd2',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '5',
        remainingMg: '5',
        bacWaterMl: null,
        status: VIAL_STATUS.DRY,
        expiresAt: farExpiry(),
      }),
    ] as never);

    const result = await getInventorySummaryByCompound('user-1', [], 'U100');

    expect(result).toHaveLength(1);
    const c1 = result[0];
    expect(c1.compoundId).toBe('c1');
    expect(c1.compoundName).toBe('BPC-157');
    expect(c1.compoundSlug).toBe('bpc-157');
    expect(c1.reconstitutedCount).toBe(1);
    expect(c1.dryCount).toBe(2);
    expect(c1.expiredCount).toBe(0);
    expect(c1.totalReconstitutedRemainingMg).toBe('8.000');
    expect(c1.totalDryMg).toBe('15.000');
    expect(c1.dryVialRefs).toHaveLength(2);
  });

  it('includes EXPIRED-status vials for display but excludes them from totals', async () => {
    vi.mocked(prisma.vial.findMany).mockResolvedValue([
      rawVial({
        id: 'r1',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '10',
        remainingMg: '8',
        bacWaterMl: '2',
        status: VIAL_STATUS.RECONSTITUTED,
        expiresAt: farExpiry(),
      }),
      rawVial({
        id: 'e1',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '10',
        remainingMg: '5',
        bacWaterMl: '2',
        status: VIAL_STATUS.EXPIRED,
        expiresAt: pastExpiry(),
      }),
    ] as never);

    const result = await getInventorySummaryByCompound('user-1', [], 'U100');
    const c1 = result[0];
    expect(c1.expiredCount).toBe(1);
    expect(c1.reconstitutedCount).toBe(1);
    // EXPIRED vial's 5mg is excluded from the reconstituted pool
    expect(c1.totalReconstitutedRemainingMg).toBe('8.000');
  });

  it('worstBadge: EXPIRED-status vial yields EXPIRED (not LOW)', async () => {
    vi.mocked(prisma.vial.findMany).mockResolvedValue([
      rawVial({
        id: 'e1',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '10',
        // remaining 0.5/10 = 5% would be LOW_INVENTORY by badge
        remainingMg: '0.5',
        bacWaterMl: '2',
        status: VIAL_STATUS.EXPIRED,
        expiresAt: pastExpiry(),
      }),
    ] as never);

    const result = await getInventorySummaryByCompound('user-1', [], 'U100');
    expect(result[0].worstBadge).toBe('EXPIRED');
  });

  it('worstBadge ordering EXPIRING_SOON > LOW_INVENTORY', async () => {
    vi.mocked(prisma.vial.findMany).mockResolvedValue([
      // low inventory recon vial (not expiring)
      rawVial({
        id: 'r1',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '10',
        remainingMg: '1',
        bacWaterMl: '2',
        status: VIAL_STATUS.RECONSTITUTED,
        expiresAt: farExpiry(),
      }),
      // expiring soon dry vial
      rawVial({
        id: 'd1',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '10',
        remainingMg: '10',
        bacWaterMl: null,
        status: VIAL_STATUS.DRY,
        expiresAt: soonExpiry(),
      }),
    ] as never);

    const result = await getInventorySummaryByCompound('user-1', [], 'U100');
    expect(result[0].worstBadge).toBe('EXPIRING_SOON');
  });

  it('worstBadge LOW_INVENTORY when only a low recon vial', async () => {
    vi.mocked(prisma.vial.findMany).mockResolvedValue([
      rawVial({
        id: 'r1',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '10',
        remainingMg: '1',
        bacWaterMl: '2',
        status: VIAL_STATUS.RECONSTITUTED,
        expiresAt: farExpiry(),
      }),
    ] as never);

    const result = await getInventorySummaryByCompound('user-1', [], 'U100');
    expect(result[0].worstBadge).toBe('LOW_INVENTORY');
  });

  it('worstBadge null when no badges present', async () => {
    vi.mocked(prisma.vial.findMany).mockResolvedValue([
      rawVial({
        id: 'r1',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '10',
        remainingMg: '8',
        bacWaterMl: '2',
        status: VIAL_STATUS.RECONSTITUTED,
        expiresAt: farExpiry(),
      }),
    ] as never);

    const result = await getInventorySummaryByCompound('user-1', [], 'U100');
    expect(result[0].worstBadge).toBeNull();
  });

  it('hasMixedConcentration false with a single recon vial', async () => {
    vi.mocked(prisma.vial.findMany).mockResolvedValue([
      rawVial({
        id: 'r1',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '10',
        remainingMg: '8',
        bacWaterMl: '2',
        status: VIAL_STATUS.RECONSTITUTED,
        expiresAt: farExpiry(),
      }),
    ] as never);

    const result = await getInventorySummaryByCompound('user-1', [], 'U100');
    expect(result[0].hasMixedConcentration).toBe(false);
  });

  it('hasMixedConcentration false when two recon vials share concentration', async () => {
    vi.mocked(prisma.vial.findMany).mockResolvedValue([
      rawVial({
        id: 'r1',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '10',
        remainingMg: '8',
        bacWaterMl: '2',
        status: VIAL_STATUS.RECONSTITUTED,
        expiresAt: farExpiry(),
        shelfOrder: 0,
        isActiveForCompound: true,
      }),
      rawVial({
        id: 'r2',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        // 20/4 = 5 mg/mL same as 10/2
        totalMg: '20',
        remainingMg: '10',
        bacWaterMl: '4',
        status: VIAL_STATUS.RECONSTITUTED,
        expiresAt: farExpiry(),
        shelfOrder: 1,
      }),
    ] as never);

    const result = await getInventorySummaryByCompound('user-1', [], 'U100');
    expect(result[0].hasMixedConcentration).toBe(false);
  });

  it('hasMixedConcentration true when two recon vials differ in concentration', async () => {
    vi.mocked(prisma.vial.findMany).mockResolvedValue([
      rawVial({
        id: 'r1',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '10',
        remainingMg: '8',
        bacWaterMl: '2',
        status: VIAL_STATUS.RECONSTITUTED,
        expiresAt: farExpiry(),
        shelfOrder: 0,
        isActiveForCompound: true,
      }),
      rawVial({
        id: 'r2',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        // 10/4 = 2.5 mg/mL, differs
        totalMg: '10',
        remainingMg: '8',
        bacWaterMl: '4',
        status: VIAL_STATUS.RECONSTITUTED,
        expiresAt: farExpiry(),
        shelfOrder: 1,
      }),
    ] as never);

    const result = await getInventorySummaryByCompound(
      'user-1',
      [mgProtocol('c1', '1')],
      'U100'
    );
    expect(result[0].hasMixedConcentration).toBe(true);
  });

  describe('doses-left', () => {
    it('mcg/mg dose with active vial → dosesLeft + unitsEach', async () => {
      vi.mocked(prisma.vial.findFirst).mockResolvedValue(
        rawVial({
          id: 'r1',
          compoundId: 'c1',
          compoundName: 'BPC-157',
          compoundSlug: 'bpc-157',
          totalMg: '20',
          remainingMg: '14',
          bacWaterMl: '2',
          status: VIAL_STATUS.RECONSTITUTED,
          expiresAt: farExpiry(),
        }) as never
      );
      vi.mocked(prisma.vial.findMany).mockResolvedValue([
        rawVial({
          id: 'r1',
          compoundId: 'c1',
          compoundName: 'BPC-157',
          compoundSlug: 'bpc-157',
          totalMg: '20',
          remainingMg: '14',
          bacWaterMl: '2',
          status: VIAL_STATUS.RECONSTITUTED,
          expiresAt: farExpiry(),
        }),
      ] as never);

      const result = await getInventorySummaryByCompound(
        'user-1',
        [mgProtocol('c1', '1')],
        'U100'
      );
      const c1 = result[0];
      // 14mg / 1mg = 14 doses
      expect(c1.dosesLeft).toBe(14);
      // 1mg from 20mg/2mL = 10mg/mL => 0.1mL => 10 units (U-100)
      expect(c1.unitsEach).toBe('10');
      expect(c1.activeVial).not.toBeNull();
      expect(c1.activeVial?.id).toBe('r1');
    });

    it('totalRemaining 0 but reconstitutedCount > 0 → 0 doses', async () => {
      vi.mocked(prisma.vial.findFirst).mockResolvedValue(
        rawVial({
          id: 'r1',
          compoundId: 'c1',
          compoundName: 'BPC-157',
          compoundSlug: 'bpc-157',
          totalMg: '20',
          remainingMg: '0',
          bacWaterMl: '2',
          status: VIAL_STATUS.RECONSTITUTED,
          expiresAt: farExpiry(),
        }) as never
      );
      vi.mocked(prisma.vial.findMany).mockResolvedValue([
        rawVial({
          id: 'r1',
          compoundId: 'c1',
          compoundName: 'BPC-157',
          compoundSlug: 'bpc-157',
          totalMg: '20',
          remainingMg: '0',
          bacWaterMl: '2',
          status: VIAL_STATUS.RECONSTITUTED,
          expiresAt: farExpiry(),
        }),
      ] as never);

      const result = await getInventorySummaryByCompound(
        'user-1',
        [mgProtocol('c1', '1')],
        'U100'
      );
      expect(result[0].dosesLeft).toBe(0);
    });

    it('no ACTIVE protocol → omit dosesLeft + unitsEach', async () => {
      vi.mocked(prisma.vial.findMany).mockResolvedValue([
        rawVial({
          id: 'r1',
          compoundId: 'c1',
          compoundName: 'BPC-157',
          compoundSlug: 'bpc-157',
          totalMg: '20',
          remainingMg: '14',
          bacWaterMl: '2',
          status: VIAL_STATUS.RECONSTITUTED,
          expiresAt: farExpiry(),
        }),
      ] as never);

      const result = await getInventorySummaryByCompound(
        'user-1',
        [mgProtocol('c1', '1', 'PAUSED')],
        'U100'
      );
      expect(result[0].dosesLeft).toBeNull();
      expect(result[0].unitsEach).toBeNull();
    });

    it('more than one ACTIVE protocol → omit dosesLeft + unitsEach', async () => {
      vi.mocked(prisma.vial.findMany).mockResolvedValue([
        rawVial({
          id: 'r1',
          compoundId: 'c1',
          compoundName: 'BPC-157',
          compoundSlug: 'bpc-157',
          totalMg: '20',
          remainingMg: '14',
          bacWaterMl: '2',
          status: VIAL_STATUS.RECONSTITUTED,
          expiresAt: farExpiry(),
        }),
      ] as never);

      const result = await getInventorySummaryByCompound(
        'user-1',
        [mgProtocol('c1', '1'), mgProtocol('c1', '2')],
        'U100'
      );
      expect(result[0].dosesLeft).toBeNull();
      expect(result[0].unitsEach).toBeNull();
    });

    it('no reconstituted vial → omit dosesLeft + unitsEach', async () => {
      vi.mocked(prisma.vial.findMany).mockResolvedValue([
        rawVial({
          id: 'd1',
          compoundId: 'c1',
          compoundName: 'BPC-157',
          compoundSlug: 'bpc-157',
          totalMg: '20',
          remainingMg: '20',
          bacWaterMl: null,
          status: VIAL_STATUS.DRY,
          expiresAt: farExpiry(),
        }),
      ] as never);
      vi.mocked(prisma.vial.findFirst).mockResolvedValue(null);

      const result = await getInventorySummaryByCompound(
        'user-1',
        [mgProtocol('c1', '1')],
        'U100'
      );
      expect(result[0].dosesLeft).toBeNull();
      expect(result[0].unitsEach).toBeNull();
      expect(result[0].activeVial).toBeNull();
    });

    it('mL/IU dose with active vial → dosesLeft via convertDoseToMg', async () => {
      vi.mocked(prisma.vial.findFirst).mockResolvedValue(
        rawVial({
          id: 'r1',
          compoundId: 'c1',
          compoundName: 'HGH',
          compoundSlug: 'hgh',
          totalMg: '20',
          remainingMg: '14',
          bacWaterMl: '2',
          status: VIAL_STATUS.RECONSTITUTED,
          expiresAt: farExpiry(),
        }) as never
      );
      vi.mocked(prisma.vial.findMany).mockResolvedValue([
        rawVial({
          id: 'r1',
          compoundId: 'c1',
          compoundName: 'HGH',
          compoundSlug: 'hgh',
          totalMg: '20',
          remainingMg: '14',
          bacWaterMl: '2',
          status: VIAL_STATUS.RECONSTITUTED,
          expiresAt: farExpiry(),
        }),
      ] as never);

      // 10 IU: doseMl = 10 * 0.01 = 0.1mL; concentration 20/2 = 10mg/mL => 1mg
      // 14mg / 1mg = 14 doses; units = amount = 10
      const result = await getInventorySummaryByCompound(
        'user-1',
        [iuProtocol('c1', '10')],
        'U100'
      );
      expect(result[0].dosesLeft).toBe(14);
      expect(result[0].unitsEach).toBe('10');
    });

    it('mL/IU dose with no active vial → omit dosesLeft', async () => {
      vi.mocked(prisma.vial.findMany).mockResolvedValue([
        rawVial({
          id: 'd1',
          compoundId: 'c1',
          compoundName: 'HGH',
          compoundSlug: 'hgh',
          totalMg: '20',
          remainingMg: '20',
          bacWaterMl: null,
          status: VIAL_STATUS.DRY,
          expiresAt: farExpiry(),
        }),
      ] as never);
      vi.mocked(prisma.vial.findFirst).mockResolvedValue(null);

      const result = await getInventorySummaryByCompound(
        'user-1',
        [iuProtocol('c1', '10')],
        'U100'
      );
      expect(result[0].dosesLeft).toBeNull();
      expect(result[0].unitsEach).toBeNull();
    });

    it('mixed concentration + mcg/mg dose → unitsEach varies, dosesLeft kept', async () => {
      vi.mocked(prisma.vial.findFirst).mockResolvedValue(
        rawVial({
          id: 'r1',
          compoundId: 'c1',
          compoundName: 'BPC-157',
          compoundSlug: 'bpc-157',
          totalMg: '20',
          remainingMg: '14',
          bacWaterMl: '2',
          status: VIAL_STATUS.RECONSTITUTED,
          expiresAt: farExpiry(),
          isActiveForCompound: true,
          shelfOrder: 0,
        }) as never
      );
      vi.mocked(prisma.vial.findMany).mockResolvedValue([
        rawVial({
          id: 'r1',
          compoundId: 'c1',
          compoundName: 'BPC-157',
          compoundSlug: 'bpc-157',
          totalMg: '20',
          remainingMg: '14',
          bacWaterMl: '2',
          status: VIAL_STATUS.RECONSTITUTED,
          expiresAt: farExpiry(),
          isActiveForCompound: true,
          shelfOrder: 0,
        }),
        rawVial({
          id: 'r2',
          compoundId: 'c1',
          compoundName: 'BPC-157',
          compoundSlug: 'bpc-157',
          totalMg: '20',
          remainingMg: '6',
          bacWaterMl: '4',
          status: VIAL_STATUS.RECONSTITUTED,
          expiresAt: farExpiry(),
          shelfOrder: 1,
        }),
      ] as never);

      const result = await getInventorySummaryByCompound(
        'user-1',
        [mgProtocol('c1', '1')],
        'U100'
      );
      const c1 = result[0];
      expect(c1.hasMixedConcentration).toBe(true);
      expect(c1.unitsEach).toBe('varies');
      // mass pool 14 + 6 = 20mg / 1mg = 20 doses
      expect(c1.dosesLeft).toBe(20);
    });

    it('mixed concentration + mL/IU dose → unitsEach varies, dosesLeft omitted', async () => {
      vi.mocked(prisma.vial.findFirst).mockResolvedValue(
        rawVial({
          id: 'r1',
          compoundId: 'c1',
          compoundName: 'HGH',
          compoundSlug: 'hgh',
          totalMg: '20',
          remainingMg: '14',
          bacWaterMl: '2',
          status: VIAL_STATUS.RECONSTITUTED,
          expiresAt: farExpiry(),
          isActiveForCompound: true,
          shelfOrder: 0,
        }) as never
      );
      vi.mocked(prisma.vial.findMany).mockResolvedValue([
        rawVial({
          id: 'r1',
          compoundId: 'c1',
          compoundName: 'HGH',
          compoundSlug: 'hgh',
          totalMg: '20',
          remainingMg: '14',
          bacWaterMl: '2',
          status: VIAL_STATUS.RECONSTITUTED,
          expiresAt: farExpiry(),
          isActiveForCompound: true,
          shelfOrder: 0,
        }),
        rawVial({
          id: 'r2',
          compoundId: 'c1',
          compoundName: 'HGH',
          compoundSlug: 'hgh',
          totalMg: '20',
          remainingMg: '6',
          bacWaterMl: '4',
          status: VIAL_STATUS.RECONSTITUTED,
          expiresAt: farExpiry(),
          shelfOrder: 1,
        }),
      ] as never);

      const result = await getInventorySummaryByCompound(
        'user-1',
        [iuProtocol('c1', '10')],
        'U100'
      );
      const c1 = result[0];
      expect(c1.hasMixedConcentration).toBe(true);
      expect(c1.unitsEach).toBe('varies');
      expect(c1.dosesLeft).toBeNull();
    });
  });

  it('hasMixedConcentration ignores recon vials with null/zero bacWaterMl (treated as differing)', async () => {
    vi.mocked(prisma.vial.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.vial.findMany).mockResolvedValue([
      rawVial({
        id: 'r1',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '10',
        remainingMg: '8',
        bacWaterMl: '2',
        status: VIAL_STATUS.RECONSTITUTED,
        expiresAt: farExpiry(),
        shelfOrder: 0,
      }),
      // recon vial with null bac (edge) → concentration null, differs from first
      rawVial({
        id: 'r2',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '10',
        remainingMg: '8',
        bacWaterMl: null,
        status: VIAL_STATUS.RECONSTITUTED,
        expiresAt: farExpiry(),
        shelfOrder: 1,
      }),
    ] as never);

    const result = await getInventorySummaryByCompound('user-1', [], 'U100');
    expect(result[0].hasMixedConcentration).toBe(true);
  });

  it('omits doses-left when active protocol is mL/IU but active vial has no bac water', async () => {
    // active vial resolves but bacWaterMl null → canConvert false for IU
    vi.mocked(prisma.vial.findFirst).mockResolvedValue(
      rawVial({
        id: 'r1',
        compoundId: 'c1',
        compoundName: 'HGH',
        compoundSlug: 'hgh',
        totalMg: '20',
        remainingMg: '14',
        bacWaterMl: null,
        status: VIAL_STATUS.RECONSTITUTED,
        expiresAt: farExpiry(),
      }) as never
    );
    vi.mocked(prisma.vial.findMany).mockResolvedValue([
      rawVial({
        id: 'r1',
        compoundId: 'c1',
        compoundName: 'HGH',
        compoundSlug: 'hgh',
        totalMg: '20',
        remainingMg: '14',
        bacWaterMl: null,
        status: VIAL_STATUS.RECONSTITUTED,
        expiresAt: farExpiry(),
      }),
    ] as never);

    const result = await getInventorySummaryByCompound(
      'user-1',
      [iuProtocol('c1', '10')],
      'U100'
    );
    expect(result[0].dosesLeft).toBeNull();
    expect(result[0].unitsEach).toBeNull();
  });

  it('U40 syringe standard flows through to unitsEach', async () => {
    vi.mocked(prisma.vial.findFirst).mockResolvedValue(
      rawVial({
        id: 'r1',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '20',
        remainingMg: '14',
        bacWaterMl: '2',
        status: VIAL_STATUS.RECONSTITUTED,
        expiresAt: farExpiry(),
      }) as never
    );
    vi.mocked(prisma.vial.findMany).mockResolvedValue([
      rawVial({
        id: 'r1',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '20',
        remainingMg: '14',
        bacWaterMl: '2',
        status: VIAL_STATUS.RECONSTITUTED,
        expiresAt: farExpiry(),
      }),
    ] as never);

    const result = await getInventorySummaryByCompound(
      'user-1',
      [mgProtocol('c1', '1')],
      'U40'
    );
    // 1mg from 20mg/2mL = 10mg/mL => 0.1mL; U40 volPerUnit = 0.025 => 4 units
    expect(result[0].unitsEach).toBe('4');
  });

  it('warns and truncates when the vial cap is hit', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const many = Array.from({ length: 500 }, (_, i) =>
      rawVial({
        id: `d${i}`,
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '10',
        remainingMg: '10',
        bacWaterMl: null,
        status: VIAL_STATUS.DRY,
        expiresAt: farExpiry(),
      })
    );
    vi.mocked(prisma.vial.findMany).mockResolvedValue(many as never);

    await getInventorySummaryByCompound('user-1', [], 'U100');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('serializes activeVial via serializeVial (strings, not Decimals)', async () => {
    vi.mocked(prisma.vial.findFirst).mockResolvedValue(
      rawVial({
        id: 'r1',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '20',
        remainingMg: '14',
        bacWaterMl: '2',
        status: VIAL_STATUS.RECONSTITUTED,
        expiresAt: farExpiry(),
      }) as never
    );
    vi.mocked(prisma.vial.findMany).mockResolvedValue([
      rawVial({
        id: 'r1',
        compoundId: 'c1',
        compoundName: 'BPC-157',
        compoundSlug: 'bpc-157',
        totalMg: '20',
        remainingMg: '14',
        bacWaterMl: '2',
        status: VIAL_STATUS.RECONSTITUTED,
        expiresAt: farExpiry(),
      }),
    ] as never);

    const result = await getInventorySummaryByCompound('user-1', [], 'U100');
    const av = result[0].activeVial;
    expect(av).not.toBeNull();
    expect(typeof av?.totalMg).toBe('string');
    expect(av?.totalMg).toBe('20.000');
    expect(typeof result[0].totalReconstitutedRemainingMg).toBe('string');
  });
});
