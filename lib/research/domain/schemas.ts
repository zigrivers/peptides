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

/** Run endpoint request body. */
export const runResearchInputSchema = z.object({
  question: z.string().trim().min(1).max(500),
});

/** Save action input. */
export const saveNotesInputSchema = z.object({
  catalogItemId: z.string().min(1),
  question: z.string().trim().min(1).max(500),
  answerSummary: z.string().max(4000).nullable().default(null),
  approvedFindings: z
    .array(
      z.object({
        claim: z.string().trim().min(1).max(4000),
        citations: z
          .array(
            z.object({
              title: z.string().trim().min(1).max(300),
              url: z.string().refine(isHttpUrl, 'must be an http(s) URL'),
            })
          )
          .min(1)
          .max(10),
      })
    )
    .min(1)
    .max(25),
});
export type SaveNotesInput = z.infer<typeof saveNotesInputSchema>;
