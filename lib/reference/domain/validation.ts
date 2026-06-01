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

export const DosingFrequencySchema = z.enum([
  'DAILY',
  'EOD',
  'THRICE_WEEKLY',
  'WEEKLY',
  'TWICE_WEEKLY',
  'EVERY_TWO_WEEKS',
  'EVERY_FOUR_WEEKS',
  'AS_NEEDED',
  'CUSTOM',
]);

export const PreferredTimeSchema = z.enum([
  'MORNING',
  'AFTERNOON',
  'NIGHT',
  'PRE_WORKOUT',
  'POST_WORKOUT',
  'MORNING_AND_NIGHT',
  'MORNING_AFTERNOON_NIGHT',
  'PRE_AND_POST_WORKOUT',
  'ANYTIME',
  'AS_NEEDED',
]);

export const DosingProtocolInputSchema = z.object({
  cycleLengthWeeks: z.number().int().min(1).max(104).nullable().optional(),
  restPeriodWeeks: z.number().int().min(1).max(104).nullable().optional(),
  dosingFrequency: DosingFrequencySchema.nullable().optional(),
  dosesPerDay: z.number().int().min(1).max(8).nullable().optional(),
  customFrequencyDescription: z.string().nullable().optional(),
  daysOn: z.number().int().min(1).max(6).nullable().optional(),
  daysOff: z.number().int().min(1).max(6).nullable().optional(),
  preferredTime: PreferredTimeSchema.nullable().optional(),
  timingNotes: z.string().nullable().optional(),
  isFdaApproved: z.boolean().default(false),
});

export const DosingProtocolValidationSchema = DosingProtocolInputSchema.superRefine((val, ctx) => {
  // 1. Cycle length bounds check
  if (val.cycleLengthWeeks !== undefined && val.cycleLengthWeeks !== null) {
    if (val.cycleLengthWeeks < 1 || val.cycleLengthWeeks > 104) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cycleLengthWeeks must be between 1 and 104',
        path: ['cycleLengthWeeks'],
      });
    }
  }

  // 2. Rest period bounds check
  if (val.restPeriodWeeks !== undefined && val.restPeriodWeeks !== null) {
    if (val.restPeriodWeeks < 1 || val.restPeriodWeeks > 104) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'restPeriodWeeks must be between 1 and 104',
        path: ['restPeriodWeeks'],
      });
    }
  }

  // 3. Doses per day bounds check
  if (val.dosesPerDay !== undefined && val.dosesPerDay !== null) {
    if (val.dosesPerDay < 1 || val.dosesPerDay > 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dosesPerDay must be between 1 and 8',
        path: ['dosesPerDay'],
      });
    }
  }

  // 4. Daily weekly schedule co-occurrence
  const hasDaysOn = val.daysOn !== undefined && val.daysOn !== null;
  const hasDaysOff = val.daysOff !== undefined && val.daysOff !== null;

  if (hasDaysOn || hasDaysOff) {
    if (val.dosingFrequency !== 'DAILY') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'daysOn and daysOff are only valid for DAILY frequency',
        path: ['dosingFrequency'],
      });
    }
    if (!hasDaysOn || !hasDaysOff) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Both daysOn and daysOff must be specified if one is set',
        path: [hasDaysOn ? 'daysOff' : 'daysOn'],
      });
    } else {
      if (val.daysOn! + val.daysOff! !== 7) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'daysOn and daysOff must sum to exactly 7',
          path: ['daysOn'],
        });
      }
      if (val.daysOn! < 1 || val.daysOn! > 6) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'daysOn must be between 1 and 6',
          path: ['daysOn'],
        });
      }
      if (val.daysOff! < 1 || val.daysOff! > 6) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'daysOff must be between 1 and 6',
          path: ['daysOff'],
        });
      }
    }
  }

  // 5. Custom frequency description rule
  if (val.dosingFrequency === 'CUSTOM') {
    if (!val.customFrequencyDescription || val.customFrequencyDescription.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'customFrequencyDescription must be a non-empty trimmed string when frequency is CUSTOM',
        path: ['customFrequencyDescription'],
      });
    }
  } else {
    if (val.customFrequencyDescription !== undefined && val.customFrequencyDescription !== null && val.customFrequencyDescription.trim() !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'customFrequencyDescription must be empty or null when dosingFrequency is not CUSTOM',
        path: ['customFrequencyDescription'],
      });
    }
  }

  // 6. Doses per day and preferredTime cross-field alignment
  const doses = val.dosesPerDay ?? 0;
  const time = val.preferredTime;

  if (doses >= 2 && !time) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'preferredTime is required for 2+ doses per day',
      path: ['preferredTime'],
    });
  }

  if (time) {
    if (time === 'MORNING_AND_NIGHT' || time === 'PRE_AND_POST_WORKOUT') {
      if (doses !== 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'MORNING_AND_NIGHT and PRE_AND_POST_WORKOUT are only valid for exactly 2 doses per day',
          path: ['preferredTime'],
        });
      }
    } else if (time === 'MORNING_AFTERNOON_NIGHT') {
      if (doses !== 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'MORNING_AFTERNOON_NIGHT is only valid for exactly 3 doses per day',
          path: ['preferredTime'],
        });
      }
    } else {
      if (doses === 2) {
        const allowed = ['MORNING_AND_NIGHT', 'PRE_AND_POST_WORKOUT', 'ANYTIME', 'AS_NEEDED'];
        if (!allowed.includes(time)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `preferredTime must be a twice-daily composite or flexible option for 2 doses, got: ${time}`,
            path: ['preferredTime'],
          });
        }
      } else if (doses === 3) {
        const allowed = ['MORNING_AFTERNOON_NIGHT', 'ANYTIME', 'AS_NEEDED'];
        if (!allowed.includes(time)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `preferredTime must be a thrice-daily composite or flexible option for 3 doses, got: ${time}`,
            path: ['preferredTime'],
          });
        }
      } else if (doses >= 4) {
        const allowed = ['ANYTIME', 'AS_NEEDED'];
        if (!allowed.includes(time)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `preferredTime must be ANYTIME or AS_NEEDED for 4+ doses, got: ${time}`,
            path: ['preferredTime'],
          });
        }
      }
    }
  }
});

export function validateDosingProtocol(input: unknown): { success: boolean; data?: z.infer<typeof DosingProtocolValidationSchema>; error?: z.ZodError } {
  const result = DosingProtocolValidationSchema.safeParse(input);
  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  // Normalize/nullify obsolete fields
  const data = { ...result.data };

  // 1. If dosingFrequency is not CUSTOM, customFrequencyDescription must be null
  if (data.dosingFrequency !== 'CUSTOM') {
    data.customFrequencyDescription = null;
  }

  // 2. If dosingFrequency is not DAILY, daysOn and daysOff must be null
  if (data.dosingFrequency !== 'DAILY') {
    data.daysOn = null;
    data.daysOff = null;
  }

  return {
    success: true,
    data,
  };
}

