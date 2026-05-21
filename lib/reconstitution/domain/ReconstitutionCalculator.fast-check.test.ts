import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import Decimal from 'decimal.js';
import { ReconstitutionCalculator } from './ReconstitutionCalculator';

/**
 * Property-based test per tdd-standards §3.1:
 * "The reconstitution calculator MUST have at least one property test that asserts
 *  concentration × injectionVolume === totalDose across randomized inputs."
 *
 * Using fc.double with Math.fround-converted bounds (fast-check 4.x requires 32-bit
 * float boundaries for fc.float; fc.double accepts standard doubles).
 */
describe('ReconstitutionCalculator — property-based tests', () => {
  // Positive-range double arbitraries with reasonable domain bounds
  const positiveMg = fc.double({ min: 0.001, max: 100, noNaN: true, noDefaultInfinity: true });
  const positiveVol = fc.double({ min: 0.001, max: 10, noNaN: true, noDefaultInfinity: true });
  const positiveDose = fc.double({ min: 0.001, max: 10000, noNaN: true, noDefaultInfinity: true });

  it('concentrationMcgPerMl × injectionVolMl = targetDoseMcg for all valid inputs', () => {
    fc.assert(
      fc.property(positiveMg, positiveVol, positiveDose, (totalMgRaw, bacWaterMlRaw, targetDoseMcgRaw) => {
        const totalMg = new Decimal(totalMgRaw.toFixed(6));
        const bacWaterMl = new Decimal(bacWaterMlRaw.toFixed(6));
        const targetDoseMcg = new Decimal(targetDoseMcgRaw.toFixed(6));

        const result = ReconstitutionCalculator.calculate({ totalMg, bacWaterMl, targetDoseMcg });

        // Core identity: concentration × volume = dose
        const reconstructed = result.concentrationMcgPerMl.times(result.injectionVolMl);
        expect(reconstructed.toDecimalPlaces(4).eq(targetDoseMcg.toDecimalPlaces(4))).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  it('syringeUnitsPerDose = injectionVolMl × 100 for all valid inputs', () => {
    fc.assert(
      fc.property(positiveMg, positiveVol, positiveDose, (totalMgRaw, bacWaterMlRaw, targetDoseMcgRaw) => {
        const result = ReconstitutionCalculator.calculate({
          totalMg: new Decimal(totalMgRaw.toFixed(6)),
          bacWaterMl: new Decimal(bacWaterMlRaw.toFixed(6)),
          targetDoseMcg: new Decimal(targetDoseMcgRaw.toFixed(6)),
        });

        const expectedUnits = result.injectionVolMl.times(100);
        expect(
          result.syringeUnitsPerDose.toDecimalPlaces(6).eq(expectedUnits.toDecimalPlaces(6))
        ).toBe(true);
      }),
      { numRuns: 500 }
    );
  });
});
