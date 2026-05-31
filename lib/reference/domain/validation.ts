import { z } from 'zod';
import type { DoseAmount } from './types';

export const DoseAmountSchema = z.object({
  amount: z.string(),
  unit: z.string(),
  researchBenefits: z.string().optional().default('N/A'),
  recommendedFrequency: z.string().optional().default('N/A'),
});

export function parseCompoundDosing(json: unknown): DoseAmount {
  try {
    if (typeof json === 'string') {
      json = JSON.parse(json);
    }
    const result = DoseAmountSchema.safeParse(json);
    if (result.success) {
      return result.data;
    }
    // Safe fallback if it is a partially valid object
    if (typeof json === 'object' && json !== null) {
      const obj = json as Record<string, unknown>;
      return {
        amount: typeof obj.amount === 'string' ? obj.amount : '0',
        unit: typeof obj.unit === 'string' ? obj.unit : 'mcg',
        researchBenefits: typeof obj.researchBenefits === 'string' ? obj.researchBenefits : 'N/A',
        recommendedFrequency: typeof obj.recommendedFrequency === 'string' ? obj.recommendedFrequency : 'N/A',
      };
    }
  } catch (err) {
    console.error('Error parsing compound dosing:', err);
  }
  
  // Ultimate safe fallback
  return {
    amount: '0',
    unit: 'mcg',
    researchBenefits: 'N/A',
    recommendedFrequency: 'N/A',
  };
}

export const BenefitTimelineItemSchema = z.object({
  week: z.number().int().nonnegative(),
  benefits: z.array(z.string()),
});

export const BenefitTimelineSchema = z.array(BenefitTimelineItemSchema);

export function parseBenefitTimeline(json: unknown): import('./types').BenefitTimelineItem[] | null {
  if (!json) return null;
  try {
    if (typeof json === 'string') {
      json = JSON.parse(json);
    }
    const result = BenefitTimelineSchema.safeParse(json);
    if (result.success) {
      return result.data;
    }
  } catch (err) {
    console.error('Error parsing benefit timeline:', err);
  }
  return null;
}
