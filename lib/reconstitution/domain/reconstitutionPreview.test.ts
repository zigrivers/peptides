import { describe, it, expect } from 'vitest';
import { buildReconstitutionPreview } from './reconstitutionPreview';
import type { DoseAmount } from '@/lib/tracker/domain/types';

const mcg = (amount: string): DoseAmount => ({ amount, unit: 'mcg' });

describe('buildReconstitutionPreview', () => {
  describe('computable: false', () => {
    it('returns not-computable when ranges is null', () => {
      const result = buildReconstitutionPreview({
        ranges: null,
        totalMg: '10',
        bacWaterMl: '2',
        syringeStandard: 'U100',
      });
      expect(result).toEqual({
        computable: false,
        concentrationText: null,
        rows: [],
        hint: null,
        warning: null,
      });
    });

    it('returns not-computable when totalMg is zero', () => {
      const result = buildReconstitutionPreview({
        ranges: { low: mcg('250'), typical: mcg('500'), high: mcg('1000') },
        totalMg: '0',
        bacWaterMl: '2',
        syringeStandard: 'U100',
      });
      expect(result.computable).toBe(false);
      expect(result.rows).toEqual([]);
    });

    it('returns not-computable when totalMg is non-numeric', () => {
      const result = buildReconstitutionPreview({
        ranges: { low: mcg('250'), typical: mcg('500'), high: mcg('1000') },
        totalMg: 'abc',
        bacWaterMl: '2',
        syringeStandard: 'U100',
      });
      expect(result.computable).toBe(false);
    });

    it('returns not-computable when bacWaterMl is zero', () => {
      const result = buildReconstitutionPreview({
        ranges: { low: mcg('250'), typical: mcg('500'), high: mcg('1000') },
        totalMg: '10',
        bacWaterMl: '0',
        syringeStandard: 'U100',
      });
      expect(result.computable).toBe(false);
    });
  });

  describe('main mcg example', () => {
    // totalMg 10 / bacWaterMl 2 = 5 mg/mL.
    // typical 500 mcg = 0.5 mg → 0.5 / 5 = 0.1 mL → ×100 = 10.0 U-100 units.
    const result = buildReconstitutionPreview({
      ranges: { low: mcg('250'), typical: mcg('500'), high: mcg('1000') },
      totalMg: '10',
      bacWaterMl: '2',
      syringeStandard: 'U100',
    });

    it('formats concentrationText with trimmed mg/mL', () => {
      expect(result.concentrationText).toBe('10 mg in 2 mL (5 mg/mL)');
    });

    it('orders rows Conservative, Typical, Aggressive', () => {
      expect(result.rows.map((r) => r.label)).toEqual(['Conservative', 'Typical', 'Aggressive']);
    });

    it('sets doseText per row', () => {
      expect(result.rows[0].doseText).toBe('250 mcg');
      expect(result.rows[1].doseText).toBe('500 mcg');
      expect(result.rows[2].doseText).toBe('1000 mcg');
    });

    it('typical row shows 10.0 units', () => {
      expect(result.rows[1].unitsText).toContain('10.0 units');
    });

    it('no exceedsSyringe / warning when no syringe size and within range', () => {
      expect(result.rows.every((r) => r.exceedsSyringe === false)).toBe(true);
      expect(result.warning).toBeNull();
    });

    it('no hint when typical units >= 5', () => {
      // typical = 10.0u, well above MIN_PULLABLE_UNITS.
      expect(result.hint).toBeNull();
    });
  });

  describe('mg/mL formatting with repeating decimal', () => {
    it('rounds mg/mL to 2 decimals (3.33)', () => {
      // 10 / 3 = 3.333... → 3.33
      const result = buildReconstitutionPreview({
        ranges: { low: mcg('250'), typical: mcg('500'), high: mcg('1000') },
        totalMg: '10',
        bacWaterMl: '3',
        syringeStandard: 'U100',
      });
      expect(result.concentrationText).toBe('10 mg in 3 mL (3.33 mg/mL)');
    });
  });

  describe('hint', () => {
    it('emits a hint when typical units < 5 and suggests a larger mL', () => {
      // totalMg 10 / bac 1 = 10 mg/mL. typical 250 mcg = 0.25 mg → 0.025 mL → 2.5u.
      // suggestedMl = round(1 × 20/2.5 = 8 → 8), differs from 1.
      // unitsAtSuggested = 2.5 × 8 / 1 = 20.0u.
      const result = buildReconstitutionPreview({
        ranges: { low: mcg('100'), typical: mcg('250'), high: mcg('500') },
        totalMg: '10',
        bacWaterMl: '1',
        syringeStandard: 'U100',
      });
      expect(result.hint).toBe(
        '💡 At 1 mL the typical dose is only 2.5u — hard to measure precisely. Try ~8 mL → ~20.0u.'
      );
    });

    it('clamps suggested mL to the 10 mL max', () => {
      // totalMg 10 / bac 5 = 2 mg/mL. typical 50 mcg = 0.05 mg → 0.025 mL → 2.5u.
      // suggestedMl raw = 5 × 20/2.5 = 40 → clamped to 10. unitsAtSuggested = 2.5 × 10 / 5 = 5.0u.
      const result = buildReconstitutionPreview({
        ranges: { low: mcg('25'), typical: mcg('50'), high: mcg('100') },
        totalMg: '10',
        bacWaterMl: '5',
        syringeStandard: 'U100',
      });
      expect(result.hint).toBe(
        '💡 At 5 mL the typical dose is only 2.5u — hard to measure precisely. Try ~10 mL → ~5.0u.'
      );
    });

    it('clamps suggested mL up to the 0.5 mL min', () => {
      // Need suggestedMl to round strictly below 0.5 so the min-clamp fires.
      // suggestedMl < 0.5 requires raw < 0.25, i.e. bac × 20/units < 0.25 with units < 5.
      // totalMg 10 / bac 0.04 = 250 mg/mL. typical 10000 mcg = 10 mg → 0.04 mL → 4.0u (<5).
      // raw = 0.04 × 20/4 = 0.2 → /0.5 = 0.4 → round = 0 → ×0.5 = 0 → clamp up to 0.5.
      // suggestedMl 0.5 ≠ bac 0.04. unitsAtSuggested = 4 × 0.5 / 0.04 = 50.0u.
      const result = buildReconstitutionPreview({
        ranges: { low: mcg('5000'), typical: mcg('10000'), high: mcg('20000') },
        totalMg: '10',
        bacWaterMl: '0.04',
        syringeStandard: 'U100',
      });
      expect(result.hint).toBe(
        '💡 At 0.04 mL the typical dose is only 4.0u — hard to measure precisely. Try ~0.5 mL → ~50.0u.'
      );
    });

    it('returns null hint when typical units >= 5', () => {
      // totalMg 10 / bac 1 = 10 mg/mL. typical 600 mcg = 0.6 mg → 0.06 mL → 6.0u (>=5).
      const result = buildReconstitutionPreview({
        ranges: { low: mcg('300'), typical: mcg('600'), high: mcg('1200') },
        totalMg: '10',
        bacWaterMl: '1',
        syringeStandard: 'U100',
      });
      expect(result.hint).toBeNull();
    });

    it('returns null hint when suggested mL rounds equal to current bac', () => {
      // Want units<5 but suggestedMl === bacWaterMl.
      // suggestedMl = round(bac × 20/units to nearest 0.5). Equal to bac when 20/units rounds
      // such that result === bac. If units = 20, ratio = 1 → suggested = bac, but units must be <5.
      // bac 4, units 2.5 → raw = 4 × 8 = 32 → clamped to 10 (not equal). Hard via clamp.
      // Instead: units<5 with bac large so raw clamps to 10 == bac → bac=10.
      // bac 10, units 2.5 → raw = 10 × 8 = 80 → clamp 10 → equals bac 10 → null.
      // totalMg/bac: doseMg = injectionVol × conc; units 2.5 → injectionVol 0.025 mL.
      // totalMg 10 / bac 10 = 1 mg/mL → doseMg = 0.025 × 1 = 0.025 mg = 25 mcg.
      const result = buildReconstitutionPreview({
        ranges: { low: mcg('10'), typical: mcg('25'), high: mcg('50') },
        totalMg: '10',
        bacWaterMl: '10',
        syringeStandard: 'U100',
      });
      expect(result.hint).toBeNull();
    });

    it('returns null hint when typical dose is not computable', () => {
      // mg/mcg with valid vial is always computable; mL is computable too. Use an
      // invalid typical amount to force doseToSyringeUnits → not computable.
      const result = buildReconstitutionPreview({
        ranges: { low: mcg('250'), typical: { amount: 'oops', unit: 'mcg' }, high: mcg('1000') },
        totalMg: '10',
        bacWaterMl: '1',
        syringeStandard: 'U100',
      });
      expect(result.hint).toBeNull();
      // typical row has no units text since its dose is invalid.
      expect(result.rows[1].unitsText).toBeNull();
    });
  });

  describe('warning', () => {
    it('warns and flags the highest offending row over capacity', () => {
      // totalMg 10 / bac 5 = 2 mg/mL.
      // low 750 mcg = 0.375 mg → 0.1875 mL → 18.75u (<=30 ok).
      // typical 1000 mcg = 0.5 mg → 0.25 mL → 25u (<=30 ok).
      // high 1000 mcg → same as below; use high 1000 mcg = 0.5 mL = 50u (>30).
      const result = buildReconstitutionPreview({
        ranges: { low: mcg('250'), typical: mcg('500'), high: mcg('1000') },
        totalMg: '10',
        bacWaterMl: '5',
        syringeStandard: 'U100',
        syringeSize: '0.3',
      });
      // low 250 → 0.125 mL → 12.5u; typical 500 → 0.25 mL → 25u; high 1000 → 0.5 mL → 50u.
      // max for U100 0.3 mL = 30. Only high exceeds.
      expect(result.rows[0].exceedsSyringe).toBe(false);
      expect(result.rows[1].exceedsSyringe).toBe(false);
      expect(result.rows[2].exceedsSyringe).toBe(true);
      expect(result.warning).toMatch(/exceeds/);
      expect(result.warning).toBe(
        '⚠ At 5 mL the Aggressive dose (50.0u) exceeds your 30-unit syringe — consider less BAC water.'
      );
    });

    it('picks the single highest row when multiple exceed', () => {
      // totalMg 10 / bac 2 = 5 mg/mL. size 0.3 U100 → max 30.
      // typical 1000 mcg = 1 mg → 0.2 mL → 20u (ok).
      // high 2000 mcg = 2 mg → 0.4 mL → 40u (>30). low 1750 mcg = 1.75 mg → 0.35 mL → 35u (>30).
      // Two exceed; highest is high (40u).
      const result = buildReconstitutionPreview({
        ranges: { low: mcg('1750'), typical: mcg('1000'), high: mcg('2000') },
        totalMg: '10',
        bacWaterMl: '2',
        syringeStandard: 'U100',
        syringeSize: '0.3',
      });
      expect(result.rows[0].exceedsSyringe).toBe(true); // low 35u
      expect(result.rows[2].exceedsSyringe).toBe(true); // high 40u
      expect(result.warning).toBe(
        '⚠ At 2 mL the Aggressive dose (40.0u) exceeds your 30-unit syringe — consider less BAC water.'
      );
    });

    it('returns null warning when all rows within capacity', () => {
      // totalMg 10 / bac 2 = 5 mg/mL, size 1.0 → max 100. high 1000 mcg = 0.1 mL = 10u.
      const result = buildReconstitutionPreview({
        ranges: { low: mcg('250'), typical: mcg('500'), high: mcg('1000') },
        totalMg: '10',
        bacWaterMl: '2',
        syringeStandard: 'U100',
        syringeSize: '1.0',
      });
      expect(result.rows.every((r) => r.exceedsSyringe === false)).toBe(true);
      expect(result.warning).toBeNull();
    });

    it('returns null warning when no syringeSize provided even if large', () => {
      // Same large case as the warn test but without syringeSize.
      const result = buildReconstitutionPreview({
        ranges: { low: mcg('250'), typical: mcg('500'), high: mcg('1000') },
        totalMg: '10',
        bacWaterMl: '5',
        syringeStandard: 'U100',
      });
      expect(result.warning).toBeNull();
      expect(result.rows.every((r) => r.exceedsSyringe === false)).toBe(true);
    });
  });

  describe('unit pass-through', () => {
    it('handles IU ranges without throwing', () => {
      const result = buildReconstitutionPreview({
        ranges: {
          low: { amount: '5', unit: 'IU' },
          typical: { amount: '10', unit: 'IU' },
          high: { amount: '20', unit: 'IU' },
        },
        totalMg: '10',
        bacWaterMl: '2',
        syringeStandard: 'U100',
      });
      expect(result.computable).toBe(true);
      // IU = syringe units directly: 10 IU → 10.0 units.
      expect(result.rows[1].unitsText).toContain('10.0 units');
    });

    it('handles mL ranges without throwing', () => {
      const result = buildReconstitutionPreview({
        ranges: {
          low: { amount: '0.05', unit: 'mL' },
          typical: { amount: '0.1', unit: 'mL' },
          high: { amount: '0.2', unit: 'mL' },
        },
        totalMg: '10',
        bacWaterMl: '2',
        syringeStandard: 'U100',
      });
      expect(result.computable).toBe(true);
      // 0.1 mL / 0.01 volPerUnit = 10.0 units.
      expect(result.rows[1].unitsText).toContain('10.0 units');
    });
  });
});
