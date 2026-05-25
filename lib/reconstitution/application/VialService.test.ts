import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { serializeVial } from './VialService';
import type { Protocol } from '@/lib/tracker/domain/types';
import type { VialWithBadges } from './VialService';

describe('serializeVial', () => {
  const mockVial: VialWithBadges = {
    id: 'vial-1',
    userId: 'user-1',
    compoundId: 'comp-1',
    compoundName: 'Semaglutide',
    compoundSlug: 'semaglutide',
    totalMg: new Decimal('5.0'),
    bacWaterMl: new Decimal('2.0'),
    remainingMg: new Decimal('4.0'),
    status: 'RECONSTITUTED',
    reconstitutedAt: new Date('2026-05-24T00:00:00Z'),
    expiresAt: new Date('2026-06-07T00:00:00Z'),
    badges: [],
  };

  const mockProtocol: Protocol = {
    id: 'proto-1',
    userId: 'user-1',
    compoundId: 'comp-1',
    cycleId: null,
    dose: { amount: '10', unit: 'IU' }, // 10 IU dose
    schedule: { frequency: 'Daily' },
    administrationRoute: 'subcutaneous',
    status: 'ACTIVE',
    startDate: new Date('2026-05-01T00:00:00Z'),
    endDate: null,
    notes: null,
  };

  it('correctly calculates remaining dose warning and potential draw waste for U-100 syringe standard', () => {
    // 10 IU under U-100 = 10 * 0.01 = 0.1 mL.
    // Concentration = 5 mg / 2 mL = 2.5 mg/mL.
    // Dose in mg = 0.1 mL * 2.5 mg/mL = 0.25 mg.
    // minDoseMg = maxDoseMg = 0.25 mg.
    // remainingMg = 4.0 mg, which is >= 0.25 mg, so potentialDrawWaste/insufficientMedication should be false.
    const result = serializeVial(mockVial, new Date('2026-05-24T00:00:00Z'), [mockProtocol], 'U100');
    expect(result.potentialDrawWaste).toBe(false);
    expect(result.insufficientMedication).toBe(false);
  });

  it('correctly calculates remaining dose warning and potential draw waste for U-40 syringe standard', () => {
    // 10 IU under U-40 = 10 * 0.025 = 0.25 mL.
    // Concentration = 5 mg / 2 mL = 2.5 mg/mL.
    // Dose in mg = 0.25 mL * 2.5 mg/mL = 0.625 mg.
    // minDoseMg = maxDoseMg = 0.625 mg.
    // Let's make remainingMg = 0.5 mg.
    const lowRemainingVial = { ...mockVial, remainingMg: new Decimal('0.5') };
    
    // For U-100: dose is 0.25 mg. remaining (0.5 mg) is >= 0.25 mg, so insufficientMedication is false.
    const resultU100 = serializeVial(lowRemainingVial, new Date('2026-05-24T00:00:00Z'), [mockProtocol], 'U100');
    expect(resultU100.insufficientMedication).toBe(false);

    // For U-40: dose is 0.625 mg. remaining (0.5 mg) is < 0.625 mg, so insufficientMedication is true.
    const resultU40 = serializeVial(lowRemainingVial, new Date('2026-05-24T00:00:00Z'), [mockProtocol], 'U40');
    expect(resultU40.insufficientMedication).toBe(true);
  });
});
