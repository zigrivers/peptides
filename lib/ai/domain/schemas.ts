import { z } from 'zod';

export const citationSchema = z.object({
  title: z.string().min(1),
  authors: z.array(z.string().min(1)).default([]),
  journal: z.string().nullable().default(null),
  year: z.number().int().min(1800).max(2100).nullable().default(null),
  doi: z.string().nullable().default(null),
  pmid: z.string().nullable().default(null),
});

/** Always disallowed regardless of context — a personalized recommendation, never permitted. */
const ALWAYS_DISALLOWED = [
  /\brecommended\s+dose\s+for\s+you\b/i,
] as const;

/**
 * Approval/clearance phrases. Disallowed ONLY as an AFFIRMATIVE claim — the AI may state the
 * ABSENCE of approval ("not FDA-approved", "no safety clearance") as a cautionary fact (ADR-010
 * Revision 2026-06-14). Note `(fda|ema)[\s-]*approved` matches "approved", not "approval", so
 * "lacks FDA approval" is permitted by virtue of not matching at all.
 */
const APPROVAL_CLAIM_PATTERNS = [
  /safety[\s-]*clearance/i,
  /clinically\s+approved/i,
  /\bapproved\s+by\s+(?:the\s+)?(fda|ema)\b/i,
  /\b(fda|ema)[\s-]*approved\b/i,
] as const;

/**
 * Negation tokens that flip an approval phrase from a CLAIM to a descriptive ABSENCE.
 * Deliberately excludes "non"/"un" prefixes (they cause distant false-negatives like
 * "this NON-peptide is FDA-approved"; "unapproved"/"non-approved" lack a \bapproved\b
 * boundary anyway, so they never match the approval patterns).
 */
const NEGATION = /\b(not|no|never|cannot|can'?t|isn'?t|aren'?t|wasn'?t|doesn'?t|don'?t|didn'?t|hasn'?t|haven'?t|hadn'?t|wouldn'?t|shouldn'?t|couldn'?t|won'?t|lacks?|lacking|without|absence of|yet to be|fails? to)\b/i;

/** Words of context immediately before an approval phrase searched for a governing negation. */
const NEG_WINDOW_WORDS = 4;

/**
 * Back-compat export: the full set of phrases the guard is concerned with.
 *
 * WARNING: testing these patterns directly does NOT apply negation context. Callers must use
 * `containsDisallowedPhrase` / `isAffirmativeApprovalClaim`, not test the raw patterns.
 */
export const DISALLOWED_PHRASES = [...ALWAYS_DISALLOWED, ...APPROVAL_CLAIM_PATTERNS] as const;

/**
 * True when an approval/clearance phrase appears as an AFFIRMATIVE claim — i.e. there is no
 * negation token in the bounded window immediately preceding it (within its clause). The bounded
 * window prevents a distant unrelated negation from wrongly rescuing an affirmative claim.
 */
export function isAffirmativeApprovalClaim(text: string): boolean {
  for (const pattern of APPROVAL_CLAIM_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const before = text.slice(0, m.index);
      // `, ` (comma-space) is a clause boundary so a negation in a preceding clause
      // (e.g. "Although not FDA-approved, it is EMA approved") cannot rescue a later
      // affirmative claim. Bare `,` is intentionally excluded to avoid splitting
      // numeric literals like "1,000".
      const clauseStart =
        Math.max(
          before.lastIndexOf('.'),
          before.lastIndexOf(';'),
          before.lastIndexOf('\n'),
          before.lastIndexOf(', '),
        ) + 1;
      const window = before.slice(clauseStart).trim().split(/\s+/).slice(-NEG_WINDOW_WORDS).join(' ');
      if (!NEGATION.test(window)) return true; // affirmative — no governing negation nearby
      if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width loop
    }
  }
  return false;
}

export function containsDisallowedPhrase(text: string): boolean {
  if (ALWAYS_DISALLOWED.some((re) => re.test(text))) return true;
  return isAffirmativeApprovalClaim(text);
}
