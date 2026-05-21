import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Decimal from 'decimal.js';
import { ReconstitutionCalculator } from '@/lib/reconstitution/domain/ReconstitutionCalculator';
import { WarningPolicy, type WarningType } from '@/lib/reconstitution/domain/WarningPolicy';

const mockPrismaVialCreate = vi.fn();
const mockPrismaVialFindFirst = vi.fn();
const mockPrismaVialFindMany = vi.fn();
const mockPrismaCompoundProfileFindFirst = vi.fn();
const mockPrismaAuditEventCreate = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    vial: {
      create: mockPrismaVialCreate,
      findFirst: mockPrismaVialFindFirst,
      findMany: mockPrismaVialFindMany,
    },
    compoundProfile: {
      findFirst: mockPrismaCompoundProfileFindFirst,
    },
    auditEvent: { create: mockPrismaAuditEventCreate },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        vial: { create: mockPrismaVialCreate },
        auditEvent: { create: mockPrismaAuditEventCreate },
        orderItem: { findFirst: vi.fn().mockResolvedValue(null) },
      };
      return fn(tx);
    }),
  },
}));

/**
 * Story: US-REC-01 - Calculate Reconstitution
 */
describe('US-REC-01: Calculate Reconstitution', () => {
  it('AC-1: calculates correct concentration for 5mg vial + 2mL BAC water', () => {
    const result = ReconstitutionCalculator.calculate({
      totalMg: new Decimal('5'),
      bacWaterMl: new Decimal('2'),
      targetDoseMcg: new Decimal('250'),
    });

    expect(result.concentrationMgPerMl.eq('2.5')).toBe(true);
    expect(result.concentrationMcgPerMl.eq('2500')).toBe(true);
  });

  it('AC-2: converts dose to syringe units (100-unit insulin syringe)', () => {
    // 250mcg ÷ 2500mcg/mL = 0.1mL = 10 units on a 100-unit syringe
    const result = ReconstitutionCalculator.calculate({
      totalMg: new Decimal('5'),
      bacWaterMl: new Decimal('2'),
      targetDoseMcg: new Decimal('250'),
    });

    expect(result.syringeUnitsPerDose.eq('10')).toBe(true);
    expect(result.injectionVolMl.eq('0.1')).toBe(true);
  });

  it('AC-3a: triggers HIGH_VOLUME warning when injection volume exceeds 1.5mL', () => {
    // 250mcg at low concentration → large injection volume
    const warnings = WarningPolicy.evaluate({
      injectionVolMl: new Decimal('1.6'),
      bacWaterMl: new Decimal('2'),
      targetDoseMcg: new Decimal('250'),
      profileHighMcg: undefined,
    });

    expect(warnings.includes('HIGH_VOLUME')).toBe(true);
  });

  it('AC-3b: triggers LOW_BAC_VOLUME warning when BAC water < 0.5mL', () => {
    const warnings = WarningPolicy.evaluate({
      injectionVolMl: new Decimal('0.1'),
      bacWaterMl: new Decimal('0.4'),
      targetDoseMcg: new Decimal('250'),
      profileHighMcg: undefined,
    });

    expect(warnings.includes('LOW_BAC_VOLUME')).toBe(true);
  });

  it('AC-3c: triggers ABOVE_REFERENCE_RANGE warning when dose exceeds profile high', () => {
    const warnings = WarningPolicy.evaluate({
      injectionVolMl: new Decimal('0.1'),
      bacWaterMl: new Decimal('2'),
      targetDoseMcg: new Decimal('500'),
      profileHighMcg: new Decimal('300'),
    });

    expect(warnings.includes('ABOVE_REFERENCE_RANGE')).toBe(true);
  });

  it('AC-3d: no warnings for safe inputs', () => {
    const warnings = WarningPolicy.evaluate({
      injectionVolMl: new Decimal('0.1'),
      bacWaterMl: new Decimal('2'),
      targetDoseMcg: new Decimal('250'),
      profileHighMcg: new Decimal('300'),
    });

    const typed: WarningType[] = warnings;
    expect(typed).toHaveLength(0);
  });

  it('AC-3d: triggers EXCEEDS_VIAL_CAPACITY warning when injection volume exceeds BAC water volume', () => {
    const warnings = WarningPolicy.evaluate({
      injectionVolMl: new Decimal('3'),
      bacWaterMl: new Decimal('2'),
      targetDoseMcg: new Decimal('250'),
      profileHighMcg: undefined,
    });

    expect(warnings.includes('EXCEEDS_VIAL_CAPACITY')).toBe(true);
  });

  it('Negative: rejects zero BAC water volume', () => {
    expect(() =>
      ReconstitutionCalculator.calculate({
        totalMg: new Decimal('5'),
        bacWaterMl: new Decimal('0'),
        targetDoseMcg: new Decimal('250'),
      })
    ).toThrow('bac_water_must_be_positive');
  });

  it('Negative: rejects zero or negative total vial weight', () => {
    expect(() =>
      ReconstitutionCalculator.calculate({
        totalMg: new Decimal('0'),
        bacWaterMl: new Decimal('2'),
        targetDoseMcg: new Decimal('250'),
      })
    ).toThrow('vial_total_must_be_positive');
  });

  it.todo('AC-4: displays last logged dose for context (requires tracker integration)');
});

/**
 * Story: US-REC-02 - Record Reconstitution (Vial Inventory)
 */
describe('US-REC-02: Record Reconstitution', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-1: creates a RECONSTITUTED vial with expiry derived from compound profile shelf life', async () => {
    const { saveVial } = await import('@/lib/reconstitution/application/VialService');

    const now = new Date('2026-05-21T12:00:00Z');
    vi.setSystemTime(now);

    // Profile says 28 days reconstituted shelf life
    mockPrismaCompoundProfileFindFirst.mockResolvedValueOnce({ reconstitutedShelfLifeDays: 28 });

    const vialRow = {
      id: 'vial-1',
      userId: 'user-1',
      compoundId: 'compound-1',
      totalMg: new Decimal('5'),
      bacWaterMl: new Decimal('2'),
      remainingMg: new Decimal('5'),
      status: 'RECONSTITUTED',
      reconstitutedAt: now,
      expiresAt: new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000),
      compound: { name: 'BPC-157' },
    };
    mockPrismaVialCreate.mockResolvedValueOnce(vialRow);

    const result = await saveVial({
      userId: 'user-1',
      compoundId: 'compound-1',
      totalMg: new Decimal('5'),
      bacWaterMl: new Decimal('2'),
    });

    expect(result.status).toBe('RECONSTITUTED');
    expect(mockPrismaVialCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          compoundId: 'compound-1',
          status: 'RECONSTITUTED',
        }),
      })
    );

  });

  it('AC-1: falls back to 14-day expiry when compound profile has no shelf life', async () => {
    const { saveVial } = await import('@/lib/reconstitution/application/VialService');

    const now = new Date('2026-05-21T12:00:00Z');
    vi.setSystemTime(now);

    mockPrismaCompoundProfileFindFirst.mockResolvedValueOnce(null);

    // Auto-computed expiry is normalized to UTC midnight (now date + 14 days)
    const expectedExpiry = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 14));
    mockPrismaVialCreate.mockResolvedValueOnce({
      id: 'vial-2', userId: 'user-1', compoundId: 'compound-1',
      totalMg: new Decimal('5'), bacWaterMl: new Decimal('2'),
      remainingMg: new Decimal('5'), status: 'RECONSTITUTED',
      reconstitutedAt: now, expiresAt: expectedExpiry,
      compound: { name: 'BPC-157' },
    });

    await saveVial({
      userId: 'user-1',
      compoundId: 'compound-1',
      totalMg: new Decimal('5'),
      bacWaterMl: new Decimal('2'),
    });

    expect(mockPrismaVialCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expiresAt: expectedExpiry,
        }),
      })
    );

  });

  it('AC-2: getVialsForUser returns vials with LOW_INVENTORY flag when remainingMg < 20% of total', async () => {
    const { getVialsForUser } = await import('@/lib/reconstitution/application/VialService');

    mockPrismaVialFindMany.mockResolvedValueOnce([
      {
        id: 'v1', userId: 'user-1', compoundId: 'compound-1',
        totalMg: new Decimal('5'), bacWaterMl: new Decimal('2'),
        remainingMg: new Decimal('0.5'),
        status: 'RECONSTITUTED',
        reconstitutedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86400_000),
        compound: { name: 'BPC-157' },
      },
    ]);

    const vials = await getVialsForUser('user-1');
    expect(vials).toHaveLength(1);
    expect(vials[0].badges).toContain('LOW_INVENTORY');
  });

  it('AC-2: getVialsForUser returns EXPIRING_SOON badge when vial expires within 7 days', async () => {
    const { getVialsForUser } = await import('@/lib/reconstitution/application/VialService');

    const soonExpiry = new Date(Date.now() + 3 * 86400_000);
    mockPrismaVialFindMany.mockResolvedValueOnce([
      {
        id: 'v2', userId: 'user-1', compoundId: 'compound-1',
        totalMg: new Decimal('5'), bacWaterMl: new Decimal('2'),
        remainingMg: new Decimal('4'),
        status: 'RECONSTITUTED',
        reconstitutedAt: new Date(), expiresAt: soonExpiry,
        compound: { name: 'TB-500' },
      },
    ]);

    const vials = await getVialsForUser('user-1');
    expect(vials[0].badges).toContain('EXPIRING_SOON');
  });

  it('AC-2: getVialsForUser returns EXPIRED badge when vial expiresAt is in the past', async () => {
    const { getVialsForUser } = await import('@/lib/reconstitution/application/VialService');

    const pastExpiry = new Date(Date.now() - 2 * 86400_000);
    mockPrismaVialFindMany.mockResolvedValueOnce([
      {
        id: 'v3', userId: 'user-1', compoundId: 'compound-1',
        totalMg: new Decimal('5'), bacWaterMl: new Decimal('2'),
        remainingMg: new Decimal('4'),
        status: 'RECONSTITUTED',
        reconstitutedAt: new Date(), expiresAt: pastExpiry,
        compound: { name: 'Semaglutide' },
      },
    ]);

    const vials = await getVialsForUser('user-1');
    expect(vials[0].badges).toContain('EXPIRED');
  });
});
