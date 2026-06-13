import Decimal from 'decimal.js';
import { getVolumePerUnit, syringeMaxUnits } from './syringe';
import { ReconstitutionCalculator } from './ReconstitutionCalculator';
import type { DoseAmount } from '@/lib/tracker/domain/types';

export type SyringeStandard = 'U100' | 'U40';
export type SyringeSize = '0.3' | '0.5' | '1.0';

/**
 * Result of converting a scheduled dose into syringe units to draw.
 * Total function — NEVER throws (safety-math: a dosing display must degrade, not crash).
 *  - `needs_vial`: a mcg/mg dose with no vial concentration available.
 *  - `invalid_input`: non-positive/non-numeric dose, or non-positive concentration inputs.
 */
export type DoseUnitsResult =
  | { computable: true; units: Decimal; injectionVolMl: Decimal }
  | { computable: false; reason: 'needs_vial' | 'invalid_input' };

function parsePositive(value: string): Decimal | null {
  const singleValue = value.includes('/') ? value.split('/')[0].trim() : value;
  let d: Decimal;
  try {
    d = new Decimal(singleValue);
  } catch {
    return null;
  }
  if (!d.isFinite() || d.lte(0)) return null;
  return d;
}

/**
 * Canonical dose → syringe-units conversion. The ONLY place new code computes units.
 *
 *  - mcg / mg  → needs the vial concentration; delegates to ReconstitutionCalculator.
 *  - mL        → units = mL / volPerUnit (no vial needed).
 *  - IU        → units = amount (this app defines 1 IU = 1 syringe unit); no vial needed.
 *
 * `vialConcentration` carries the vial's totalMg/bacWaterMl as strings (matching
 * SerializedVialData) and is parsed internally.
 */
export function doseToSyringeUnits(
  dose: DoseAmount,
  vialConcentration: { totalMg: string; bacWaterMl: string | null } | null,
  syringeStandard: SyringeStandard
): DoseUnitsResult {
  const amount = parsePositive(dose.amount);
  if (amount === null) return { computable: false, reason: 'invalid_input' };

  const volPerUnit = getVolumePerUnit(syringeStandard);

  switch (dose.unit) {
    case 'mL':
      return { computable: true, units: amount.dividedBy(volPerUnit), injectionVolMl: amount };

    case 'IU':
      // IU is syringe-units in this app: units = amount; volume = units × volPerUnit.
      return { computable: true, units: amount, injectionVolMl: amount.times(volPerUnit) };

    case 'mcg':
    case 'mg': {
      if (!vialConcentration || vialConcentration.bacWaterMl === null) {
        return { computable: false, reason: 'needs_vial' };
      }
      const totalMg = parsePositive(vialConcentration.totalMg);
      const bacWaterMl = parsePositive(vialConcentration.bacWaterMl);
      if (totalMg === null || bacWaterMl === null) {
        return { computable: false, reason: 'invalid_input' };
      }
      const targetDoseMcg = dose.unit === 'mg' ? amount.times(1000) : amount;
      const { syringeUnitsPerDose, injectionVolMl } = ReconstitutionCalculator.calculate({
        totalMg,
        bacWaterMl,
        targetDoseMcg,
        syringeStandard,
      });
      return { computable: true, units: syringeUnitsPerDose, injectionVolMl };
    }

    default:
      // Unreachable for the closed DoseUnit union; defensive guard against bad runtime data.
      return { computable: false, reason: 'invalid_input' };
  }
}

const STANDARD_LABEL: Record<SyringeStandard, string> = {
  U100: 'U-100',
  U40: 'U-40',
};

/**
 * The single server-computed display shape for ALL dose-units display surfaces
 * (protocol detail, tracker calendar, batch-log review). Client components never
 * receive `Decimal` — only this serialized string shape (tracker-dose-units-design.md §15).
 */
export type DoseUnitsDisplay = {
  computable: boolean;
  unitsText: string | null;
  warning?: string;
};

/**
 * Pure builder that turns a dose + vial concentration into the display strings the
 * client renders. Wraps `doseToSyringeUnits` and applies the app's `toFixed(1)` display
 * convention. Total — never throws.
 *
 *  - computable        → `≈ {units} units ({U-100|U-40})` (one decimal).
 *  - reason needs_vial → `· reconstitute to see units` (mcg/mg with no concentration).
 *  - reason invalid_input → unitsText = null (nothing to show).
 *
 * When `syringeSize` is provided and the computed units exceed the syringe's capacity,
 * a `warning` is attached (`exceeds your {max}-unit syringe`).
 */
export function buildDoseUnitsDisplay(
  dose: DoseAmount,
  vialConcentration: { totalMg: string; bacWaterMl: string | null } | null,
  syringeStandard: SyringeStandard,
  syringeSize?: SyringeSize
): DoseUnitsDisplay {
  const result = doseToSyringeUnits(dose, vialConcentration, syringeStandard);

  if (!result.computable) {
    if (result.reason === 'needs_vial') {
      return { computable: false, unitsText: '· reconstitute to see units' };
    }
    return { computable: false, unitsText: null };
  }

  const label = STANDARD_LABEL[syringeStandard];
  let unitsText = `≈ ${result.units.toFixed(1)} units (${label})`;

  if (dose.unit === 'IU' && vialConcentration) {
    const totalMg = parsePositive(vialConcentration.totalMg);
    const bacWaterMl = vialConcentration.bacWaterMl ? parsePositive(vialConcentration.bacWaterMl) : null;
    if (totalMg !== null && bacWaterMl !== null) {
      const mg = result.injectionVolMl.times(totalMg).dividedBy(bacWaterMl);
      const mgFormatted = mg.lt(1) ? mg.toFixed(2) : mg.toFixed(1);
      unitsText = `≈ ${result.units.toFixed(1)} units (${label}) · ~${mgFormatted} mg`;
    }
  }

  if (syringeSize) {
    const max = syringeMaxUnits(syringeStandard, syringeSize);
    if (result.units.gt(max)) {
      return {
        computable: true,
        unitsText,
        warning: `exceeds your ${max}-unit syringe`,
      };
    }
  }

  return { computable: true, unitsText };
}

function formatDecimalForDoseDisplay(value: Decimal, decimalPlaces: number): string {
  return value.toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP).toString();
}

function loggedDoseMcg(
  dose: DoseAmount,
  injectionVolMl: Decimal,
  vialConcentration: { totalMg: string; bacWaterMl: string | null } | null
): Decimal | null {
  const amount = parsePositive(dose.amount);
  if (amount === null) return null;

  switch (dose.unit) {
    case 'mcg':
      return amount;
    case 'mg':
      return amount.times(1000);
    case 'mL':
    case 'IU': {
      if (!vialConcentration || vialConcentration.bacWaterMl === null) return null;
      const totalMg = parsePositive(vialConcentration.totalMg);
      const bacWaterMl = parsePositive(vialConcentration.bacWaterMl);
      if (totalMg === null || bacWaterMl === null) return null;
      return injectionVolMl.times(totalMg).dividedBy(bacWaterMl).times(1000);
    }
    default:
      return null;
  }
}

/**
 * Formats completed dose logs as the user-facing amount actually drawn:
 * `{mcg} mcg ({syringe units} units)`.
 *
 * Returns null when either half cannot be reconstructed. This keeps logged rows
 * from presenting a misleading "exact" value when the logged vial concentration
 * is unavailable.
 */
export function buildLoggedDoseDisplay(
  dose: DoseAmount,
  vialConcentration: { totalMg: string; bacWaterMl: string | null } | null,
  syringeStandard: SyringeStandard
): string | null {
  const unitsResult = doseToSyringeUnits(dose, vialConcentration, syringeStandard);
  if (!unitsResult.computable) return null;

  const doseMcg = loggedDoseMcg(dose, unitsResult.injectionVolMl, vialConcentration);
  if (doseMcg === null) return null;

  const doseText = formatDecimalForDoseDisplay(doseMcg, 2);
  const unitsText = formatDecimalForDoseDisplay(unitsResult.units, 1);
  return `${doseText} mcg (${unitsText} units)`;
}
