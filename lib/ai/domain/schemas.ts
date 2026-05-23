import { z } from 'zod';

export const citationSchema = z.object({
  title: z.string().min(1),
  authors: z.array(z.string().min(1)).default([]),
  journal: z.string().nullable().default(null),
  year: z.number().int().min(1800).max(2100).nullable().default(null),
  doi: z.string().nullable().default(null),
  pmid: z.string().nullable().default(null),
});

/**
 * Phrases the AI must NOT include in any output. Enforced post-hoc so a
 * model that strays out of ADR-010's allowed-uses scope is caught before
 * the output reaches a human reviewer.
 *
 * Patterns cover both common phrasings ("approved by the FDA") and the
 * compound-adjective form ("FDA-approved" / "EMA approved") that an LLM
 * is likely to emit.
 */
export const DISALLOWED_PHRASES = [
  /safety[\s-]*clearance/i,
  /clinically\s+approved/i,
  /\bapproved\s+by\s+the\s+(fda|ema)\b/i,
  /\b(fda|ema)[\s-]*approved\b/i,
  /\brecommended\s+dose\s+for\s+you\b/i,
] as const;

export function containsDisallowedPhrase(text: string): boolean {
  return DISALLOWED_PHRASES.some((re) => re.test(text));
}
