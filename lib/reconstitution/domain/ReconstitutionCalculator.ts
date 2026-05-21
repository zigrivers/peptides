import Decimal from 'decimal.js';

export interface ReconstitutionInput {
  totalMg: Decimal;
  bacWaterMl: Decimal;
  targetDoseMcg: Decimal;
}

export interface ReconstitutionResult {
  concentrationMgPerMl: Decimal;
  concentrationMcgPerMl: Decimal;
  injectionVolMl: Decimal;
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
 *   syringeUnitsPerDose   = injectionVolMl × 100  (1 unit = 0.01mL on a 100-unit syringe)
 *
 * Invariant verified by property-based test: concentrationMcgPerMl × injectionVolMl = targetDoseMcg
 */
export const ReconstitutionCalculator = {
  calculate(input: ReconstitutionInput): ReconstitutionResult {
    const { totalMg, bacWaterMl, targetDoseMcg } = input;

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
    const syringeUnitsPerDose = injectionVolMl.times(100);

    return { concentrationMgPerMl, concentrationMcgPerMl, injectionVolMl, syringeUnitsPerDose };
  },
};
