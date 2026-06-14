import { describe, it, expect } from 'vitest';
import {
  DOSE_INTENT_TERMS,
  isDoseIntentQuestion,
  containsPrescriptivePhrase,
  containsDoseFigure,
  stripDoseFigureSentences,
} from '@/lib/research/domain/guards';

describe('isDoseIntentQuestion', () => {
  it('detects dose/frequency intent', () => {
    expect(isDoseIntentQuestion('what dose and how often?')).toBe(true);
    expect(isDoseIntentQuestion('typical dosage in mg')).toBe(true);
    expect(isDoseIntentQuestion('how long should a cycle run')).toBe(true);
  });
  it('returns false for non-dose questions', () => {
    expect(isDoseIntentQuestion('what is its mechanism of action?')).toBe(false);
  });
  it('includes core dose terms', () => {
    expect(DOSE_INTENT_TERMS).toContain('mg');
    expect(DOSE_INTENT_TERMS).toContain('frequency');
  });
});

describe('containsPrescriptivePhrase', () => {
  it('rejects 2nd-person imperatives and personalization', () => {
    expect(containsPrescriptivePhrase('you should take 1 mg daily')).toBe(true);
    expect(containsPrescriptivePhrase('take 2 mg subcutaneously')).toBe(true);
    expect(containsPrescriptivePhrase('for a 56-year-old man, dose at 1 mg')).toBe(true);
    expect(containsPrescriptivePhrase('adjust your protocol as needed')).toBe(true);
    expect(containsPrescriptivePhrase('you should run a 12-week cycle')).toBe(true);
  });
  it('accepts descriptive, attributed reporting', () => {
    expect(containsPrescriptivePhrase('Study X used 1-2 mg SubQ daily for 28 days')).toBe(false);
    expect(containsPrescriptivePhrase('A community protocol reports a 30-day cycle')).toBe(false);
    expect(containsPrescriptivePhrase('Researchers had subjects take 200 mcg per day')).toBe(false);
    expect(containsPrescriptivePhrase('When you examine the cycle of peptide delivery')).toBe(false);
  });
});

describe('containsPrescriptivePhrase — known gaps (documented, not yet caught)', () => {
  it.todo('catches imperative-without-you forms like "Start with a low dose" and "Never exceed 2 mg"');
});

describe('containsDoseFigure', () => {
  it('detects dose amounts and frequency figures', () => {
    expect(containsDoseFigure('around 1.5 mg per injection')).toBe(true);
    expect(containsDoseFigure('300 mcg dosing')).toBe(true);
    expect(containsDoseFigure('2x daily')).toBe(true);
  });
  it('ignores prose without figures', () => {
    expect(containsDoseFigure('used for tissue repair and skin health')).toBe(false);
  });
});

describe('stripDoseFigureSentences', () => {
  it('removes only the sentences that carry dose figures', () => {
    const text = 'GHK-Cu supports skin repair. Some report 1-2 mg per day. It is studied in animals.';
    const out = stripDoseFigureSentences(text);
    expect(out).toContain('skin repair');
    expect(out).toContain('studied in animals');
    expect(out).not.toContain('1-2 mg');
  });
  it('returns empty string when every sentence has a figure', () => {
    expect(stripDoseFigureSentences('Take 1 mg. Then 2 mg.')).toBe('');
  });
});
