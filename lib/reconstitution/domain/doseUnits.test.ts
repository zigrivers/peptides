import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { doseToSyringeUnits, syringeUnitsToDose, buildDoseUnitsDisplay, buildLoggedDoseDisplay, buildRegimenDoseDisplay } from './doseUnits';
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

  it('converts a stacked mcg/mg amount using both components', () => {
    const r = doseToSyringeUnits({ amount: '1000/10.0', unit: 'mcg/mg' }, vial20mg2ml, 'U100');
    expect(r.computable).toBe(true);
    if (!r.computable) return;
    expect(r.units.toString()).toBe('110');
    expect(r.injectionVolMl.toString()).toBe('1.1');
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

  it('formats stacked mcg/mg units with the combined syringe pull', () => {
    const d = buildDoseUnitsDisplay({ amount: '1000/10.0', unit: 'mcg/mg' }, vial20mg2ml, 'U100');
    expect(d).toEqual({ computable: true, unitsText: '≈ 110.0 units (U-100)' });
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

  it('IU dose with a vial concentration derives and appends the mg value', () => {
    // 15 IU on U100 = 15 units. volume = 15 * 0.01 = 0.15 mL.
    // Concentration = 20mg / 2mL = 10 mg/mL.
    // mg = 0.15 * 10 = 1.5 mg.
    const d = buildDoseUnitsDisplay({ amount: '15', unit: 'IU' }, vial20mg2ml, 'U100');
    expect(d).toEqual({ computable: true, unitsText: '≈ 15.0 units (U-100) · ~1.5 mg' });
  });

  it('IU dose with a vial concentration does not append the mg value', () => {
    const d = buildDoseUnitsDisplay({ amount: '15', unit: 'IU' }, null, 'U100');
    expect(d).toEqual({ computable: true, unitsText: '≈ 15.0 units (U-100)' });
  });

  it('IU dose yielding less than 1 mg uses 2 decimal places', () => {
    // 5 IU on U100 = 5 units. volume = 5 * 0.01 = 0.05 mL.
    // Concentration = 20mg / 2mL = 10 mg/mL.
    // mg = 0.05 * 10 = 0.5 mg.
    const d = buildDoseUnitsDisplay({ amount: '5', unit: 'IU' }, vial20mg2ml, 'U100');
    expect(d).toEqual({ computable: true, unitsText: '≈ 5.0 units (U-100) · ~0.50 mg' });
  });

  it('IU dose with null bacWaterMl falls back to not appending mg', () => {
    const d = buildDoseUnitsDisplay({ amount: '15', unit: 'IU' }, { totalMg: '20', bacWaterMl: null }, 'U100');
    expect(d).toEqual({ computable: true, unitsText: '≈ 15.0 units (U-100)' });
  });

  it('IU dose with invalid totalMg falls back to not appending mg', () => {
    const d = buildDoseUnitsDisplay({ amount: '15', unit: 'IU' }, { totalMg: 'invalid', bacWaterMl: '2' }, 'U100');
    expect(d).toEqual({ computable: true, unitsText: '≈ 15.0 units (U-100)' });
  });
});

describe('buildLoggedDoseDisplay — logged dose amount + syringe units', () => {
  it('formats mg logs as mcg plus syringe units', () => {
    const display = buildLoggedDoseDisplay({ amount: '1', unit: 'mg' }, vial20mg2ml, 'U100');
    expect(display).toBe('1000 mcg (10 units)');
  });

  it('formats mcg logs with fractional syringe units when needed', () => {
    const display = buildLoggedDoseDisplay({ amount: '750', unit: 'mcg' }, vial20mg2ml, 'U100');
    expect(display).toBe('750 mcg (7.5 units)');
  });

  it('derives mcg for IU logs from vial concentration and syringe standard', () => {
    const display = buildLoggedDoseDisplay({ amount: '15', unit: 'IU' }, vial20mg2ml, 'U100');
    expect(display).toBe('1500 mcg (15 units)');
  });

  it('returns null when the logged amount cannot be shown as both mcg and units', () => {
    const display = buildLoggedDoseDisplay({ amount: '500', unit: 'mcg' }, null, 'U100');
    expect(display).toBeNull();
  });
});

describe('syringeUnitsToDose — inverse of doseToSyringeUnits', () => {
  const conc15mg1ml = { totalMg: '15', bacWaterMl: '1' }; // 15 mg/mL

  it('mcg target: 3.0 units from 15mg/mL on U-100 = 450 mcg', () => {
    const r = syringeUnitsToDose('3.0', conc15mg1ml, 'U100', 'mcg');
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.unit).toBe('mcg');
    expect(Number(r.amount)).toBeCloseTo(450, 6);
  });

  it('mcg target: 2.5 units from 15mg/mL on U-100 = 375 mcg', () => {
    const r = syringeUnitsToDose('2.5', conc15mg1ml, 'U100', 'mcg');
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.unit).toBe('mcg');
    expect(Number(r.amount)).toBeCloseTo(375, 6);
  });

  it('mg target: 3.0 units from 15mg/mL on U-100 = 0.45 mg', () => {
    const r = syringeUnitsToDose('3.0', conc15mg1ml, 'U100', 'mg');
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.unit).toBe('mg');
    expect(Number(r.amount)).toBeCloseTo(0.45, 6);
  });

  it('IU target: 2 units = 2 IU (concentration-independent)', () => {
    const r = syringeUnitsToDose('2', null, 'U100', 'IU');
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.unit).toBe('IU');
    expect(Number(r.amount)).toBeCloseTo(2, 6);
  });

  it('mL target: 3 units on U-100 = 0.03 mL (concentration-independent)', () => {
    const r = syringeUnitsToDose('3', null, 'U100', 'mL');
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.unit).toBe('mL');
    expect(Number(r.amount)).toBeCloseTo(0.03, 6);
  });

  it('returns null for mcg target when vialConcentration is null', () => {
    expect(syringeUnitsToDose('3', null, 'U100', 'mcg')).toBeNull();
  });

  it('returns null for mg target when vialConcentration is null', () => {
    expect(syringeUnitsToDose('3', null, 'U100', 'mg')).toBeNull();
  });

  it('returns null for mcg target when bacWaterMl is null', () => {
    expect(syringeUnitsToDose('3', { totalMg: '15', bacWaterMl: null }, 'U100', 'mcg')).toBeNull();
  });

  it('returns null for mcg target when totalMg is non-positive', () => {
    expect(syringeUnitsToDose('3', { totalMg: '0', bacWaterMl: '1' }, 'U100', 'mcg')).toBeNull();
  });

  it('returns null for mcg target when bacWaterMl is non-positive', () => {
    expect(syringeUnitsToDose('3', { totalMg: '15', bacWaterMl: '0' }, 'U100', 'mcg')).toBeNull();
  });

  it('returns null for non-positive / non-numeric units', () => {
    expect(syringeUnitsToDose('0', conc15mg1ml, 'U100', 'mcg')).toBeNull();
    expect(syringeUnitsToDose('-1', conc15mg1ml, 'U100', 'mcg')).toBeNull();
    expect(syringeUnitsToDose('abc', conc15mg1ml, 'U100', 'mcg')).toBeNull();
  });

  it('returns null for an unknown target unit (defensive default branch)', () => {
    expect(
      syringeUnitsToDose('3', conc15mg1ml, 'U100', 'foo' as DoseAmount['unit'])
    ).toBeNull();
  });

  it('round-trips with doseToSyringeUnits: 450 mcg → ~3.0 units → 450 mcg', () => {
    const fwd = doseToSyringeUnits({ amount: '450', unit: 'mcg' }, conc15mg1ml, 'U100');
    expect(fwd.computable).toBe(true);
    if (!fwd.computable) return;
    expect(fwd.units.toNumber()).toBeCloseTo(3.0, 6);

    const back = syringeUnitsToDose(fwd.units.toString(), conc15mg1ml, 'U100', 'mcg');
    expect(back).not.toBeNull();
    if (back === null) return;
    expect(Number(back.amount)).toBeCloseTo(450, 6);
  });
});

describe('buildRegimenDoseDisplay', () => {
  const conc = { totalMg: '10', bacWaterMl: '2' }; // 5 mg/mL

  it('mcg with vial → mg-normalized doseText + syringe units', () => {
    const r = buildRegimenDoseDisplay({ amount: '450', unit: 'mcg' }, conc, 'U100');
    expect(r.doseText).toBe('0.45 mg (450 mcg)'); // 450/1000 = 0.45
    expect(r.unitsText).toContain('units (U-100)'); // 0.45mg / 5 = 0.09mL → 9.0u
  });

  it('mg → shown as-is, no parenthetical', () => {
    const r = buildRegimenDoseDisplay({ amount: '5', unit: 'mg' }, conc, 'U100');
    expect(r.doseText).toBe('5 mg');
  });

  it('mcg with NO vial → still mg-normalized; unitsText prompts reconstitution', () => {
    const r = buildRegimenDoseDisplay({ amount: '450', unit: 'mcg' }, null, 'U100');
    expect(r.doseText).toBe('0.45 mg (450 mcg)');
    expect(r.unitsText).toBe('· reconstitute to see units');
  });

  it('IU with vial → mg derived via injection volume', () => {
    const r = buildRegimenDoseDisplay({ amount: '2', unit: 'IU' }, conc, 'U100');
    // 2 units → 0.02 mL × 5 mg/mL = 0.10 mg → trimmed to 0.1
    expect(r.doseText).toBe('0.1 mg (2 IU)');
    expect(r.unitsText).toContain('2.0 units');
  });

  it('IU with NO vial → mg not derivable, natural unit only', () => {
    const r = buildRegimenDoseDisplay({ amount: '2', unit: 'IU' }, null, 'U100');
    expect(r.doseText).toBe('2 IU');
    // IU is computable without a vial, so units still render.
    expect(r.unitsText).toContain('units (U-100)');
  });

  it('mL with vial → mg derived via injection volume', () => {
    const r = buildRegimenDoseDisplay({ amount: '0.1', unit: 'mL' }, conc, 'U100');
    // 0.1 mL × 5 mg/mL = 0.5 mg
    expect(r.doseText).toBe('0.5 mg (0.1 mL)');
  });

  it('mL with NO vial → mg not derivable, natural unit only', () => {
    const r = buildRegimenDoseDisplay({ amount: '0.1', unit: 'mL' }, null, 'U100');
    expect(r.doseText).toBe('0.1 mL');
  });

  it('invalid amount never throws; doseText is the natural string', () => {
    const r = buildRegimenDoseDisplay({ amount: 'abc', unit: 'mcg' }, conc, 'U100');
    expect(typeof r.doseText).toBe('string');
    expect(r.doseText).toBe('abc mcg');
  });
});
