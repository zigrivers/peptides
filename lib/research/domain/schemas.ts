import { z } from 'zod';
import { isHttpUrl } from './urlNormalize';

/** Step 1 — query planning output from the local model. */
export const queryPlanSchema = z.object({
  queries: z.array(z.string().min(3).max(200)).min(1).max(3),
});
export type QueryPlan = z.infer<typeof queryPlanSchema>;

/**
 * Step 3 — synthesis output. Use .nullable() (NOT .optional()) for optional
 * fields: optional keys degrade JSON-mode reliability on local/strict endpoints.
 */
export const researchOutputSchema = z.object({
  summary: z.string().min(1).max(4000),
  findings: z
    .array(
      z.object({
        claim: z.string().min(1).max(4000),
        sourceUrls: z.array(z.string()).min(1),
      })
    )
    .max(25),
  sourcesUsed: z.array(z.object({ title: z.string().min(1), url: z.string() })).default([]),
});
export type ResearchOutput = z.infer<typeof researchOutputSchema>;

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
