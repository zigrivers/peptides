import { describe, it, expect } from 'vitest';
import { containsDisallowedPhrase } from '@/lib/ai/domain/schemas';

describe('containsDisallowedPhrase (negation-aware)', () => {
  it('allows descriptive absence-of-approval statements', () => {
    expect(containsDisallowedPhrase('GHK-Cu is not FDA-approved')).toBe(false);
    expect(containsDisallowedPhrase('It lacks FDA approval')).toBe(false);
    expect(containsDisallowedPhrase('is not yet FDA-approved')).toBe(false);
    expect(containsDisallowedPhrase('not clinically approved')).toBe(false);
    expect(containsDisallowedPhrase('there is no safety clearance')).toBe(false);
    expect(containsDisallowedPhrase('GHK-Cu remains investigational')).toBe(false);
  });
  it('blocks affirmative approval/clearance claims', () => {
    expect(containsDisallowedPhrase('GHK-Cu is FDA-approved')).toBe(true);
    expect(containsDisallowedPhrase('FDA-approved for wound healing')).toBe(true);
    expect(containsDisallowedPhrase('It is clinically approved')).toBe(true);
    expect(containsDisallowedPhrase('approved by the FDA for therapeutic use')).toBe(true);
    expect(containsDisallowedPhrase('This compound has safety clearance')).toBe(true);
    expect(containsDisallowedPhrase('It is EMA approved in Europe')).toBe(true);
  });
  it('blocks despite a distant unrelated negation (proximity guard)', () => {
    expect(containsDisallowedPhrase('This non-peptide compound is FDA-approved')).toBe(true);
    expect(containsDisallowedPhrase('It is not a steroid and is FDA-approved')).toBe(true);
  });
  it('a trailing negation does not rescue an affirmative claim', () => {
    expect(containsDisallowedPhrase('FDA-approved, though not for this use')).toBe(true);
  });
  it('always blocks personalized dose-recommendation phrasing', () => {
    expect(containsDisallowedPhrase('the recommended dose for you is 2 mg')).toBe(true);
  });
});
