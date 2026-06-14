import { z } from 'zod';
import { isHttpUrl } from './urlNormalize';

/** Step 1 — query planning: decomposed sub-questions + targeted queries. */
export const queryPlanSchema = z.object({
  subQuestions: z.array(z.string().min(5).max(300)).min(1).max(6),
  queries: z.array(z.string().min(3).max(200)).min(1).max(5),
});
export type QueryPlan = z.infer<typeof queryPlanSchema>;

export const doseTierSchema = z.enum(['clinical', 'non_clinical', 'unclear']);

/**
 * Step 3 — structured synthesis output. Arrays use .default([]) and scalars use
 * defaults rather than .optional() for local JSON-mode reliability (ADR-017).
 */
export const researchAnswerSchema = z.object({
  directAnswer: z.string().min(1).max(4000),
  evidence: z
    .array(z.object({ point: z.string().min(1).max(2000), sourceUrls: z.array(z.string()).min(1).max(25) }))
    .max(25)
    .default([]),
  dosing: z
    .array(
      z.object({
        text: z.string().min(1).max(1000),
        tier: doseTierSchema.default('unclear'),
        sourceUrls: z.array(z.string()).min(1).max(25),
      })
    )
    .max(25)
    .default([]),
  caveatsGaps: z.array(z.string().min(1).max(1000)).max(25).default([]),
  sourcesUsed: z.array(z.object({ title: z.string().min(1), url: z.string() })).default([]),
  needsMoreEvidence: z.boolean().default(false),
});
export type ResearchAnswerParsed = z.infer<typeof researchAnswerSchema>;

export const fdaBriefingSchema = z.object({
  summary: z.string().min(1).max(4000),
  findings: z
    .array(z.object({ point: z.string().min(1).max(2000), sourceUrls: z.array(z.string()).min(1).max(25) }))
    .max(25)
    .default([]),
  sourcesUsed: z.array(z.object({ title: z.string().min(1), url: z.string() })).default([]),
});

/** Run endpoint request body. */
export const runResearchInputSchema = z.object({
  question: z.string().trim().min(1).max(500),
});

export const sectionTypeSchema = z.enum(['direct_answer', 'evidence', 'dosing', 'caveats']);

export const saveNotesInputSchema = z.object({
  catalogItemId: z.string().min(1),
  question: z.string().trim().min(1).max(500),
  sections: z
    .array(
      z
        .object({
          type: sectionTypeSchema,
          content: z.string().trim().min(1).max(4000),
          tier: doseTierSchema.nullable().default(null),
          citations: z
            .array(z.object({ title: z.string().trim().min(1).max(300), url: z.string().refine(isHttpUrl, 'must be an http(s) URL') }))
            .max(25),
        })
        .refine((s) => (s.type === 'dosing' ? s.tier !== null : s.tier === null), { message: 'tier must be set only for dosing sections' })
        .refine((s) => (s.type === 'evidence' || s.type === 'dosing' ? s.citations.length >= 1 : true), { message: 'evidence and dosing sections require at least one citation' })
    )
    .min(1)
    .max(4)
    .refine((arr) => new Set(arr.map((s) => s.type)).size === arr.length, { message: 'duplicate_section_type' }),
});
export type SaveNotesInput = z.infer<typeof saveNotesInputSchema>;
