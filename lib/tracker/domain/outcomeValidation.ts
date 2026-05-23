import { z } from 'zod';

export const NOTE_MAX_CHARS = 1000;
export const TAG_MAX_LEN = 32;
export const TAG_MAX_COUNT = 20;

const ratingSchema = z.number().int().min(1).max(5);

const protocolRatingInputSchema = z.object({
  protocolId: z.string().min(1),
  rating: ratingSchema,
});

export const outcomeUpsertSchema = z.object({
  scheduledDate: z.date(),
  overallRating: ratingSchema,
  tags: z
    .array(z.string().trim().min(1, { message: 'tag_empty' }).max(TAG_MAX_LEN))
    .max(TAG_MAX_COUNT),
  note: z.string().max(NOTE_MAX_CHARS).nullable().optional(),
  protocolRatings: z.array(protocolRatingInputSchema).default([]),
});

export type OutcomeUpsertInput = z.infer<typeof outcomeUpsertSchema>;
