import Decimal from 'decimal.js';
import { getVolumePerUnit } from './syringe';
import { ReconstitutionCalculator } from './ReconstitutionCalculator';
import type { DoseAmount } from '@/lib/tracker/domain/types';

export type SyringeStandard = 'U100' | 'U40';

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
  let d: Decimal;
  try {
    d = new Decimal(value);
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
