import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import Decimal from 'decimal.js';
import { ReconstitutionCalculator } from './ReconstitutionCalculator';

/**
 * Property-based test per tdd-standards §3.1:
 * "The reconstitution calculator MUST have at least one property test that asserts
 *  concentration × injectionVolume === totalDose across randomized inputs."
 *
 * Inputs use raw double precision from fast-check to maximise the search space.
 * Comparison is bounded at 8 decimal places to absorb accumulated rounding from
 * Decimal.js division when input values have repeating decimal expansions.
 */
describe('ReconstitutionCalculator — property-based tests', () => {
  const positiveMg = fc.double({ min: 0.001, max: 100, noNaN: true, noDefaultInfinity: true });
  const positiveVol = fc.double({ min: 0.001, max: 10, noNaN: true, noDefaultInfinity: true });
  const positiveDose = fc.double({ min: 0.001, max: 10000, noNaN: true, noDefaultInfinity: true });

  it('concentrationMcgPerMl × injectionVolMl = targetDoseMcg for all valid inputs', () => {
    fc.assert(
      fc.property(positiveMg, positiveVol, positiveDose, (totalMgRaw, bacWaterMlRaw, targetDoseMcgRaw) => {
        const totalMg = new Decimal(totalMgRaw);
        const bacWaterMl = new Decimal(bacWaterMlRaw);
        const targetDoseMcg = new Decimal(targetDoseMcgRaw);

        const result = ReconstitutionCalculator.calculate({ totalMg, bacWaterMl, targetDoseMcg });

        // concentrationMcgPerMl = totalMg × 1000 / bacWaterMl
        // injectionVolMl        = targetDoseMcg / concentrationMcgPerMl
        // → concentration × volume = targetDoseMcg (mathematical identity)
        const reconstructed = result.concentrationMcgPerMl.times(result.injectionVolMl);
        // 8 d.p. tolerance absorbs rounding from repeating-decimal intermediates
        expect(reconstructed.toDecimalPlaces(8).eq(targetDoseMcg.toDecimalPlaces(8))).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  it('syringeUnitsPerDose = injectionVolMl × 100 for all valid inputs', () => {
    fc.assert(
      fc.property(positiveMg, positiveVol, positiveDose, (totalMgRaw, bacWaterMlRaw, targetDoseMcgRaw) => {
        const result = ReconstitutionCalculator.calculate({
          totalMg: new Decimal(totalMgRaw),
          bacWaterMl: new Decimal(bacWaterMlRaw),
          targetDoseMcg: new Decimal(targetDoseMcgRaw),
        });

        const expectedUnits = result.injectionVolMl.times(100);
        expect(
          result.syringeUnitsPerDose.toDecimalPlaces(10).eq(expectedUnits.toDecimalPlaces(10))
        ).toBe(true);
      }),
      { numRuns: 500 }
    );
  });
});
