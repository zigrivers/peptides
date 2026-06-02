import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { doseToSyringeUnits, buildDoseUnitsDisplay } from './doseUnits';
import { ReconstitutionCalculator } from './ReconstitutionCalculator';
import type { DoseAmount, DoseUnit } from '@/lib/tracker/domain/types';

const vial20mg2ml = { totalMg: '20', bacWaterMl: '2' }; // 10 mg/mL = 10000 mcg/mL

describe('doseToSyringeUnits — mcg/mg (needs vial concentration)', () => {
  it('500 mcg from 20mg/2mL on U-100 = 5 units, 0.05 mL', () => {
    const r = doseToSyringeUnits({ amount: '500', unit: 'mcg' }, vial20mg2ml, 'U100');
    expect(r.computable).toBe(true);
    if (!r.computable) return;
    expect(r.units.toString()).toBe('5');
    expect(r.injectionVolMl.toString()).toBe('0.05');
  });

  it('1 mg from 20mg/2mL on U-100 = 10 units; on U-40 = 4 units', () => {
    const u100 = doseToSyringeUnits({ amount: '1', unit: 'mg' }, vial20mg2ml, 'U100');
    const u40 = doseToSyringeUnits({ amount: '1', unit: 'mg' }, vial20mg2ml, 'U40');
    expect(u100.computable && u100.units.toString()).toBe('10');
    expect(u40.computable && u40.units.toString()).toBe('4');
  });

  it('matches ReconstitutionCalculator for mcg/mg (parity)', () => {
    const r = doseToSyringeUnits({ amount: '1', unit: 'mg' }, vial20mg2ml, 'U40');
    const expected = ReconstitutionCalculator.calculate({
      totalMg: new Decimal('20'),
      bacWaterMl: new Decimal('2'),
      targetDoseMcg: new Decimal('1000'),
      syringeStandard: 'U40',
    });
    expect(r.computable && r.units.equals(expected.syringeUnitsPerDose)).toBe(true);
  });

  it('returns needs_vial for a mcg/mg dose with no vial concentration', () => {
    const r = doseToSyringeUnits({ amount: '500', unit: 'mcg' }, null, 'U100');
    expect(r).toEqual({ computable: false, reason: 'needs_vial' });
  });

  it('returns needs_vial when bacWaterMl is null', () => {
    const r = doseToSyringeUnits({ amount: '1', unit: 'mg' }, { totalMg: '20', bacWaterMl: null }, 'U100');
    expect(r).toEqual({ computable: false, reason: 'needs_vial' });
  });
});

describe('doseToSyringeUnits — mL/IU (no vial needed)', () => {
  it('0.05 mL on U-100 = 5 units; U-40 = 2 units (no vial)', () => {
    const u100 = doseToSyringeUnits({ amount: '0.05', unit: 'mL' }, null, 'U100');
    const u40 = doseToSyringeUnits({ amount: '0.05', unit: 'mL' }, null, 'U40');
    expect(u100.computable && u100.units.toString()).toBe('5');
    expect(u40.computable && u40.units.toString()).toBe('2');
  });

  it('IU = syringe units on both standards (units = amount), volume scales', () => {
    const u100 = doseToSyringeUnits({ amount: '5', unit: 'IU' }, null, 'U100');
    const u40 = doseToSyringeUnits({ amount: '5', unit: 'IU' }, null, 'U40');
    expect(u100.computable && u100.units.toString()).toBe('5');
    expect(u100.computable && u100.injectionVolMl.toString()).toBe('0.05'); // 5 * 0.01
    expect(u40.computable && u40.units.toString()).toBe('5');
    expect(u40.computable && u40.injectionVolMl.toString()).toBe('0.125'); // 5 * 0.025
  });
});

describe('doseToSyringeUnits — invalid input (total function, never throws)', () => {
  it.each([
    ['zero amount', { amount: '0', unit: 'mcg' as DoseUnit }, vial20mg2ml],
    ['negative amount', { amount: '-1', unit: 'mg' as DoseUnit }, vial20mg2ml],
    ['non-numeric amount', { amount: 'abc', unit: 'mL' as DoseUnit }, null],
    ['zero totalMg', { amount: '1', unit: 'mg' as DoseUnit }, { totalMg: '0', bacWaterMl: '2' }],
    ['zero bacWaterMl', { amount: '1', unit: 'mg' as DoseUnit }, { totalMg: '20', bacWaterMl: '0' }],
  ])('%s → invalid_input', (_label, dose, vial) => {
    const r = doseToSyringeUnits(dose as DoseAmount, vial, 'U100');
    expect(r).toEqual({ computable: false, reason: 'invalid_input' });
  });

  it('unknown unit → invalid_input (defensive default branch)', () => {
    const r = doseToSyringeUnits({ amount: '1', unit: 'bogus' as DoseUnit }, vial20mg2ml, 'U100');
    expect(r).toEqual({ computable: false, reason: 'invalid_input' });
  });
});

describe('buildDoseUnitsDisplay — formatting', () => {
  it('computable mcg/mg → ≈ {1 decimal} units (U-100)', () => {
    const d = buildDoseUnitsDisplay({ amount: '1', unit: 'mg' }, vial20mg2ml, 'U100');
    expect(d).toEqual({ computable: true, unitsText: '≈ 10.0 units (U-100)' });
  });

  it('maps U40 standard to (U-40) label', () => {
    const d = buildDoseUnitsDisplay({ amount: '1', unit: 'mg' }, vial20mg2ml, 'U40');
    expect(d).toEqual({ computable: true, unitsText: '≈ 4.0 units (U-40)' });
  });

  it('rounds to one decimal place (toFixed(1))', () => {
    // 730 mcg from 20mg/2mL on U-100 = 0.073 mL / 0.01 = 7.3 units
    const d = buildDoseUnitsDisplay({ amount: '730', unit: 'mcg' }, vial20mg2ml, 'U100');
    expect(d.unitsText).toBe('≈ 7.3 units (U-100)');
  });

  it('mL dose is computable without a vial', () => {
    const d = buildDoseUnitsDisplay({ amount: '0.05', unit: 'mL' }, null, 'U100');
    expect(d).toEqual({ computable: true, unitsText: '≈ 5.0 units (U-100)' });
  });

  it('IU dose is computable without a vial', () => {
    const d = buildDoseUnitsDisplay({ amount: '5', unit: 'IU' }, null, 'U40');
    expect(d).toEqual({ computable: true, unitsText: '≈ 5.0 units (U-40)' });
  });

  it('needs_vial (mcg/mg, no concentration) → reconstitute affordance', () => {
    const d = buildDoseUnitsDisplay({ amount: '500', unit: 'mcg' }, null, 'U100');
    expect(d).toEqual({ computable: false, unitsText: '· reconstitute to see units' });
  });

  it('invalid_input → unitsText null', () => {
    const d = buildDoseUnitsDisplay({ amount: '0', unit: 'mg' }, vial20mg2ml, 'U100');
    expect(d).toEqual({ computable: false, unitsText: null });
  });

  it('attaches capacity warning when units exceed the syringe size', () => {
    // 5 mg from 20mg/2mL on U-100 = 0.5 mL / 0.01 = 50 units > 30-unit (0.3 mL) syringe.
    const d = buildDoseUnitsDisplay({ amount: '5', unit: 'mg' }, vial20mg2ml, 'U100', '0.3');
    expect(d.computable).toBe(true);
    expect(d.unitsText).toBe('≈ 50.0 units (U-100)');
    expect(d.warning).toBe('exceeds your 30-unit syringe');
  });

  it('no warning when units fit within the syringe size', () => {
    const d = buildDoseUnitsDisplay({ amount: '1', unit: 'mg' }, vial20mg2ml, 'U100', '1.0');
    expect(d.warning).toBeUndefined();
    expect(d.unitsText).toBe('≈ 10.0 units (U-100)');
  });
});
