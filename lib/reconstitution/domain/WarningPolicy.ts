import Decimal from 'decimal.js';

export type WarningType =
  | 'HIGH_VOLUME'
  | 'LOW_BAC_VOLUME'
  | 'ABOVE_REFERENCE_RANGE'
  | 'EXCEEDS_VIAL_CAPACITY';

const HIGH_VOLUME_THRESHOLD_ML = new Decimal('1.5');
const LOW_BAC_THRESHOLD_ML = new Decimal('0.5');

export interface WarningPolicyInput {
  injectionVolMl: Decimal;
  bacWaterMl: Decimal;
  targetDoseMcg: Decimal;
  profileHighMcg: Decimal | undefined;
}

/**
 * Evaluates safety guardrails per US-REC-01 AC-3 and docs/domain-models/reconstitution.md.
 * Returns the set of active warnings — an empty array means all inputs are within safe range.
 */
export const WarningPolicy = {
  evaluate(input: WarningPolicyInput): WarningType[] {
    const warnings: WarningType[] = [];

    if (input.injectionVolMl.gt(HIGH_VOLUME_THRESHOLD_ML)) {
      warnings.push('HIGH_VOLUME');
    }

    if (input.bacWaterMl.lt(LOW_BAC_THRESHOLD_ML)) {
      warnings.push('LOW_BAC_VOLUME');
    }

    if (input.profileHighMcg !== undefined && input.targetDoseMcg.gt(input.profileHighMcg)) {
      warnings.push('ABOVE_REFERENCE_RANGE');
    }

    // Physical impossibility: cannot draw more volume than was added as BAC water.
    if (input.injectionVolMl.gt(input.bacWaterMl)) {
      warnings.push('EXCEEDS_VIAL_CAPACITY');
    }

    return warnings;
  },
};
