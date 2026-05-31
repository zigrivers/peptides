import Decimal from 'decimal.js';
import { getVolumePerUnit } from './syringe';

export interface ReconstitutionInput {
  totalMg: Decimal;
  bacWaterMl: Decimal;
  targetDoseMcg: Decimal;
  syringeStandard?: string;
}

export interface ReconstitutionResult {
  concentrationMgPerMl: Decimal;
  concentrationMcgPerMl: Decimal;
  injectionVolMl: Decimal;
  /** Units on the selected insulin syringe. */
  syringeUnitsPerDose: Decimal;
}

/**
 * Pure reconstitution calculator — no DB or UI dependencies (Task 1.3).
 * All math uses Decimal to prevent floating-point errors (safety-math rule).
 *
 * Math identities:
 *   concentrationMgPerMl  = totalMg / bacWaterMl
 *   concentrationMcgPerMl = concentrationMgPerMl × 1000
 *   injectionVolMl        = targetDoseMcg / concentrationMcgPerMl
 *   syringeUnitsPerDose   = injectionVolMl / volPerUnit
 *
 * Invariant verified by property-based test: concentrationMcgPerMl × injectionVolMl = targetDoseMcg
 */
export const ReconstitutionCalculator = {
  calculate(input: ReconstitutionInput): ReconstitutionResult {
    const { totalMg, bacWaterMl, targetDoseMcg, syringeStandard } = input;

    if (totalMg.lte(0)) {
      throw new Error('vial_total_must_be_positive');
    }
    if (bacWaterMl.lte(0)) {
      throw new Error('bac_water_must_be_positive');
    }
    if (targetDoseMcg.lte(0)) {
      throw new Error('target_dose_must_be_positive');
    }

    const concentrationMgPerMl = totalMg.dividedBy(bacWaterMl);
    const concentrationMcgPerMl = concentrationMgPerMl.times(1000);
    const injectionVolMl = targetDoseMcg.dividedBy(concentrationMcgPerMl);
    const volPerUnit = getVolumePerUnit(syringeStandard);
    const syringeUnitsPerDose = injectionVolMl.dividedBy(volPerUnit);

    return { concentrationMgPerMl, concentrationMcgPerMl, injectionVolMl, syringeUnitsPerDose };
  },
};
