import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { getSpendAnalytics } from './SpendAnalyticsService';

const { mockDoseLogFindMany, mockProtocolFindMany, mockUserFindUnique, mockVialFindMany } = vi.hoisted(() => ({
  mockDoseLogFindMany: vi.fn(),
  mockProtocolFindMany: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockVialFindMany: vi.fn(),
}));

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    doseLog: { findMany: mockDoseLogFindMany },
    protocol: { findMany: mockProtocolFindMany },
    user: { findUnique: mockUserFindUnique },
    vial: { findMany: mockVialFindMany },
  },
}));

describe('SpendAnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('correctly calculates YTD and monthly logged spend, converting non-USD currencies', async () => {
    // Mock dose logs for YTD (YTD query is called first)
    mockDoseLogFindMany.mockResolvedValueOnce([
      {
        loggedCost: new Decimal('50.00'),
        loggedCurrency: 'USD',
        protocol: {
          compoundId: 'comp-1',
          compound: { name: 'Semaglutide' },
        },
      },
      {
        loggedCost: new Decimal('100.00'),
        loggedCurrency: 'EUR', // 100 * 1.08 = 108 USD
        protocol: {
          compoundId: 'comp-2',
          compound: { name: 'BPC-157' },
        },
      },
    ]);

    // Mock dose logs for Monthly (Monthly query is called second)
    mockDoseLogFindMany.mockResolvedValueOnce([
      {
        loggedCost: new Decimal('50.00'),
        loggedCurrency: 'USD',
      },
    ]);

    // Mock no active protocols to simplify spend calculations
    mockProtocolFindMany.mockResolvedValueOnce([]);
    mockUserFindUnique.mockResolvedValueOnce({ syringeStandard: 'U100' });
    mockVialFindMany.mockResolvedValueOnce([]); // active vials
    mockVialFindMany.mockResolvedValueOnce([]); // historical vials

    const result = await getSpendAnalytics('user-1');

    expect(result.loggedSpendYtd).toBe('158.00'); // 50 + 108
    expect(result.loggedSpendMonthly).toBe('50.00');
    expect(result.spendByCompound).toHaveLength(2);

    const semaglutideSpend = result.spendByCompound.find(c => c.compoundName === 'Semaglutide');
    const bpcSpend = result.spendByCompound.find(c => c.compoundName === 'BPC-157');

    expect(semaglutideSpend?.amount).toBe('50.00');
    expect(semaglutideSpend?.percentage).toBe(32); // 50 / 158 * 100 = 31.64% -> 32%
    expect(bpcSpend?.amount).toBe('108.00');
    expect(bpcSpend?.percentage).toBe(68); // 108 / 158 * 100 = 68.35% -> 68%
  });

  it('correctly projects run-rate spend based on active protocols and active vials', async () => {
    mockDoseLogFindMany.mockResolvedValue([]); // YTD
    mockDoseLogFindMany.mockResolvedValue([]); // Monthly

    // Mock an active protocol dosing 250 mcg daily (Semaglutide)
    mockProtocolFindMany.mockResolvedValueOnce([
      {
        id: 'proto-1',
        compoundId: 'comp-1',
        dose: { amount: '250', unit: 'mcg' },
        schedule: { frequency: 'Daily' },
        compound: { name: 'Semaglutide' },
      },
    ]);

    mockUserFindUnique.mockResolvedValueOnce({ syringeStandard: 'U100' });

    // Mock active vial: 5mg Semaglutide costing 100 USD
    mockVialFindMany.mockResolvedValueOnce([
      {
        compoundId: 'comp-1',
        cost: new Decimal('100.00'),
        totalMg: new Decimal('5.0'),
        currency: 'USD',
        bacWaterMl: new Decimal('2.0'),
        isActiveForCompound: true,
      },
    ]);

    mockVialFindMany.mockResolvedValueOnce([]); // historical vials

    const result = await getSpendAnalytics('user-1');

    // costPerMg = 100 / 5 = 20 USD/mg
    // dose = 250 mcg = 0.25 mg
    // costPerDose = 0.25 * 20 = 5.00 USD
    // daily projected spend = 5.00 USD (Daily frequency = 1 dose/day)
    expect(result.projectedSpend.daily).toBe('5.00');
    expect(result.projectedSpend.weekly).toBe('35.00');
    expect(result.projectedSpend.monthly).toBe('150.00');
  });

  it('correctly falls back to historical average cost when active vial is missing', async () => {
    mockDoseLogFindMany.mockResolvedValue([]); // YTD
    mockDoseLogFindMany.mockResolvedValue([]); // Monthly

    // Mock an active protocol dosing 2.5 mg EOD (BPC-157)
    mockProtocolFindMany.mockResolvedValueOnce([
      {
        id: 'proto-1',
        compoundId: 'comp-2',
        dose: { amount: '2.5', unit: 'mg' },
        schedule: { frequency: 'EOD' }, // 0.5 doses per day
        compound: { name: 'BPC-157' },
      },
    ]);

    mockUserFindUnique.mockResolvedValueOnce({ syringeStandard: 'U100' });
    mockVialFindMany.mockResolvedValueOnce([]); // active vials is empty

    // Mock historical vials
    mockVialFindMany.mockResolvedValueOnce([
      {
        compoundId: 'comp-2',
        cost: new Decimal('60.00'),
        totalMg: new Decimal('10.0'),
        currency: 'USD',
        bacWaterMl: new Decimal('2.0'),
      },
      {
        compoundId: 'comp-2',
        cost: new Decimal('40.00'),
        totalMg: new Decimal('10.0'),
        currency: 'USD',
        bacWaterMl: new Decimal('2.0'),
      },
    ]);

    const result = await getSpendAnalytics('user-1');

    // avg cost: 50 USD total cost for 10 mg (since both are dominant currency USD)
    // costPerMg = 100 / 20 = 5.00 USD/mg
    // dose = 2.5 mg
    // costPerDose = 2.5 * 5 = 12.50 USD
    // EOD frequency = 0.5 doses/day -> daily run rate = 6.25 USD
    expect(result.projectedSpend.daily).toBe('6.25');
  });
});
