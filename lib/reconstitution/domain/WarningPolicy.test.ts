import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { WarningPolicy } from './WarningPolicy';

const evaluate = (
  injectionVolMl: string,
  bacWaterMl: string,
  targetDoseMcg: string,
  profileHighMcg?: string
) =>
  WarningPolicy.evaluate({
    injectionVolMl: new Decimal(injectionVolMl),
    bacWaterMl: new Decimal(bacWaterMl),
    targetDoseMcg: new Decimal(targetDoseMcg),
    profileHighMcg: profileHighMcg !== undefined ? new Decimal(profileHighMcg) : undefined,
  });

describe('WarningPolicy.evaluate', () => {
  describe('HIGH_VOLUME', () => {
    it('triggers when injectionVolMl > 1.5mL', () => {
      expect(evaluate('1.6', '2', '100')).toContain('HIGH_VOLUME');
    });

    it('triggers at exactly 1.51mL (strictly above threshold)', () => {
      expect(evaluate('1.51', '2', '100')).toContain('HIGH_VOLUME');
    });

    it('does NOT trigger at exactly 1.5mL (boundary — not strictly above)', () => {
      expect(evaluate('1.5', '2', '100')).not.toContain('HIGH_VOLUME');
    });

    it('does NOT trigger at 0.1mL', () => {
      expect(evaluate('0.1', '2', '100')).not.toContain('HIGH_VOLUME');
    });
  });

  describe('LOW_BAC_VOLUME', () => {
    it('triggers when bacWaterMl < 0.5mL', () => {
      expect(evaluate('0.1', '0.4', '100')).toContain('LOW_BAC_VOLUME');
    });

    it('triggers at exactly 0.49mL (strictly below threshold)', () => {
      expect(evaluate('0.1', '0.49', '100')).toContain('LOW_BAC_VOLUME');
    });

    it('does NOT trigger at exactly 0.5mL (boundary — not strictly below)', () => {
      expect(evaluate('0.1', '0.5', '100')).not.toContain('LOW_BAC_VOLUME');
    });

    it('does NOT trigger at 2mL', () => {
      expect(evaluate('0.1', '2', '100')).not.toContain('LOW_BAC_VOLUME');
    });
  });

  describe('ABOVE_REFERENCE_RANGE', () => {
    it('triggers when targetDoseMcg > profileHighMcg', () => {
      expect(evaluate('0.1', '2', '500', '300')).toContain('ABOVE_REFERENCE_RANGE');
    });

    it('does NOT trigger when targetDoseMcg === profileHighMcg (exact boundary)', () => {
      expect(evaluate('0.1', '2', '300', '300')).not.toContain('ABOVE_REFERENCE_RANGE');
    });

    it('does NOT trigger when profileHighMcg is undefined (no profile available)', () => {
      expect(evaluate('0.1', '2', '500', undefined)).not.toContain('ABOVE_REFERENCE_RANGE');
    });

    it('does NOT trigger when dose is below profile high', () => {
      expect(evaluate('0.1', '2', '200', '300')).not.toContain('ABOVE_REFERENCE_RANGE');
    });
  });

  describe('EXCEEDS_VIAL_CAPACITY', () => {
    it('triggers when injectionVolMl > bacWaterMl (physically impossible draw)', () => {
      // e.g., 500mL target injection from a vial with only 2mL BAC water
      expect(evaluate('3', '2', '100')).toContain('EXCEEDS_VIAL_CAPACITY');
    });

    it('does NOT trigger when injectionVolMl equals bacWaterMl (boundary)', () => {
      expect(evaluate('2', '2', '100')).not.toContain('EXCEEDS_VIAL_CAPACITY');
    });

    it('does NOT trigger when injectionVolMl is safely below bacWaterMl', () => {
      expect(evaluate('0.1', '2', '100')).not.toContain('EXCEEDS_VIAL_CAPACITY');
    });
  });

  describe('multiple warnings', () => {
    it('can trigger HIGH_VOLUME and LOW_BAC_VOLUME simultaneously', () => {
      const warnings = evaluate('1.6', '0.4', '100');
      expect(warnings).toContain('HIGH_VOLUME');
      expect(warnings).toContain('LOW_BAC_VOLUME');
    });

    it('returns empty array for all-safe inputs with no profile', () => {
      expect(evaluate('0.1', '2', '250', undefined)).toHaveLength(0);
    });

    it('returns empty array for all-safe inputs with profile within range', () => {
      expect(evaluate('0.1', '2', '250', '300')).toHaveLength(0);
    });
  });
});
