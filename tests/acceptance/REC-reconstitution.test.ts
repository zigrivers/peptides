import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { ReconstitutionCalculator } from '@/lib/reconstitution/domain/ReconstitutionCalculator';
import { WarningPolicy, type WarningType } from '@/lib/reconstitution/domain/WarningPolicy';

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
 * Story: US-REC-02 - Record Reconstitution
 */
describe('US-REC-02: Record Reconstitution', () => {
  it.todo('AC-1: creates vial record with expiry date (requires DB)');
  it.todo('AC-2: shows low inventory badge on dashboard (requires UI)');
});
