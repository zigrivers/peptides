import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { ReconstitutionCalculator } from './ReconstitutionCalculator';

const calc = (totalMg: string, bacWaterMl: string, targetDoseMcg: string) =>
  ReconstitutionCalculator.calculate({
    totalMg: new Decimal(totalMg),
    bacWaterMl: new Decimal(bacWaterMl),
    targetDoseMcg: new Decimal(targetDoseMcg),
  });

describe('ReconstitutionCalculator.calculate', () => {
  describe('concentration math', () => {
    it('computes 2.5mg/mL for a 5mg vial with 2mL BAC water', () => {
      const r = calc('5', '2', '250');
      expect(r.concentrationMgPerMl.eq('2.5')).toBe(true);
      expect(r.concentrationMcgPerMl.eq('2500')).toBe(true);
    });

    it('computes 1mg/mL for a 2mg vial with 2mL BAC water', () => {
      const r = calc('2', '2', '100');
      expect(r.concentrationMgPerMl.eq('1')).toBe(true);
      expect(r.concentrationMcgPerMl.eq('1000')).toBe(true);
    });
  });

  describe('syringe units', () => {
    it('returns 10 units for 250mcg at 2500mcg/mL (100-unit syringe, 1 unit = 0.01mL)', () => {
      const r = calc('5', '2', '250');
      expect(r.injectionVolMl.eq('0.1')).toBe(true);
      expect(r.syringeUnitsPerDose.eq('10')).toBe(true);
    });

    it('returns 5 units for 125mcg at 2500mcg/mL', () => {
      const r = calc('5', '2', '125');
      expect(r.syringeUnitsPerDose.eq('5')).toBe(true);
    });

    it('returns 100 units for 1mL injection (boundary — fills syringe)', () => {
      // 10mg/mL, 10000mcg target → 1mL → 100 units
      const r = calc('10', '1', '10000');
      expect(r.syringeUnitsPerDose.eq('100')).toBe(true);
    });
  });

  describe('invariants', () => {
    it('rejects zero BAC water', () => {
      expect(() => calc('5', '0', '250')).toThrow('bac_water_must_be_positive');
    });

    it('rejects negative BAC water', () => {
      expect(() => calc('5', '-1', '250')).toThrow('bac_water_must_be_positive');
    });

    it('rejects zero vial total', () => {
      expect(() => calc('0', '2', '250')).toThrow('vial_total_must_be_positive');
    });

    it('rejects negative vial total', () => {
      expect(() => calc('-5', '2', '250')).toThrow('vial_total_must_be_positive');
    });

    it('rejects zero target dose', () => {
      expect(() => calc('5', '2', '0')).toThrow('target_dose_must_be_positive');
    });
  });

  describe('math identity (concentration × volume = dose)', () => {
    it('concentrationMcgPerMl × injectionVolMl = targetDoseMcg for 5mg/2mL/250mcg', () => {
      const r = calc('5', '2', '250');
      const reconstructed = r.concentrationMcgPerMl.times(r.injectionVolMl);
      expect(reconstructed.eq('250')).toBe(true);
    });

    it('concentrationMcgPerMl × injectionVolMl = targetDoseMcg for 10mg/3mL/500mcg', () => {
      const r = calc('10', '3', '500');
      const reconstructed = r.concentrationMcgPerMl.times(r.injectionVolMl);
      // Allow for Decimal.js rounding — compare to 8 significant figures
      expect(reconstructed.toSignificantDigits(8).eq(new Decimal('500').toSignificantDigits(8))).toBe(true);
    });
  });
});
