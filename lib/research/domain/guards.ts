/**
 * ADR-010 guards for compound research. Pure, dependency-free, unit-tested.
 * Dosing may be reported DESCRIPTIVELY (cited, tier-tagged) but never
 * PRESCRIPTIVELY (2nd-person imperatives or personalization).
 * Descriptive dose figures are permitted in research output; only prescriptive/personalized phrasing is blocked (ADR-017 Revision 2026-06-14).
 */

/** Dose-intent detection set (NOT a general topic list) — drives gap-fill. */
export const DOSE_INTENT_TERMS = [
  'dose', 'dosage', 'dosing', 'mg', 'mcg', 'iu', 'ml', 'amount', 'frequency',
  'how often', 'how much', 'duration', 'how long', 'per day', 'per week',
  'daily', 'weekly', 'protocol', 'cycle', 'units',
] as const;

export function isDoseIntentQuestion(text: string): boolean {
  const t = text.toLowerCase();
  return DOSE_INTENT_TERMS.some((term) => t.includes(term));
}

const PRESCRIPTIVE_PATTERNS: RegExp[] = [
  // 2nd-person + an action verb (you should/can/may... take/dose/inject/use/start)
  /\byou(?:'?re| are| should| can| could| may| might| must| need to)?\b[^.]*\b(take|dose|inject|use|start)\b/i,
  // bare imperative + a number+unit ("take 2 mg", "inject 300 mcg") — anchored to clause start to avoid "subjects take" attribution
  /(?:^|[,;])\s*\b(take|dose|inject|use)\b[^.]*\b\d+(?:\.\d+)?\s?(mg|mcg|iu|ml|units?)\b/im,
  // personalization to an age ("for a 56-year-old")
  /\bfor (?:a |an )?\d+[- ]?(?:year|yr|yo)\b/i,
  // "your/my dose/protocol/cycle/regimen"
  /\b(your|my)\s+(dose|dosage|protocol|cycle|regimen)\b/i,
  // 2nd-person + prescriptive modal + run/cycle ("you should run a cycle")
  /\byou\s+(?:should|must|can|could|may|might|need to)\b[^.]*\b(run|cycle)\b/i,
];

export function containsPrescriptivePhrase(text: string): boolean {
  return PRESCRIPTIVE_PATTERNS.some((re) => re.test(text));
}

const DOSE_FIGURE_PATTERNS: RegExp[] = [
  /\b\d+(?:\.\d+)?\s?(mg|mcg|iu|ml|units?)\b/i,
  /\b\d+\s?x\s?(daily|weekly|per day|per week)\b/i,
];

export function containsDoseFigure(text: string): boolean {
  return DOSE_FIGURE_PATTERNS.some((re) => re.test(text));
}

