import { Decimal } from 'decimal.js';
import { z } from 'zod';
import type { CreateProtocolInput, UpdateProtocolInput, DoseAmount, Schedule, InjectionSite } from './types';

export class ProtocolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolValidationError';
  }
}

export function validateCreateInput(input: CreateProtocolInput): void {
  if (!input.compoundId || input.compoundId.trim() === '') {
    throw new ProtocolValidationError('compound is required');
  }
  validateDoseAmount(input.dose.amount);
}

export function validateUpdateInput(input: UpdateProtocolInput): void {
  if (input.dose !== undefined) {
    validateDoseAmount(input.dose.amount);
  }
}

function validateDoseAmount(amount: string): void {
  const parts = amount.includes('/') ? amount.split('/') : [amount];
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === '') {
      throw new ProtocolValidationError('dose amount must be a valid number');
    }
    let d: Decimal;
    try {
      d = new Decimal(trimmed);
    } catch {
      throw new ProtocolValidationError('dose amount must be a valid number');
    }
    if (d.lte(0)) {
      throw new ProtocolValidationError('dose amount must be greater than zero');
    }
  }
}

// Strict Zod schemas for JSON fields to prevent type system bypasses (F-003, F-004)
export const DoseUnitSchema = z.enum(['mcg', 'mg', 'IU', 'mL']);

export const DoseAmountSchema = z.object({
  amount: z.string(),
  unit: DoseUnitSchema,
});

export const DayOfWeekSchema = z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

export const ScheduleSchema = z.discriminatedUnion('frequency', [
  z.object({ frequency: z.literal('Daily') }),
  z.object({ frequency: z.literal('TwiceDaily') }),
  z.object({ frequency: z.literal('EOD') }),
  z.object({
    frequency: z.literal('SpecificDaysOfWeek'),
    daysOfWeek: z.array(DayOfWeekSchema),
  }),
  z.object({
    frequency: z.literal('TwiceSpecificDaysOfWeek'),
    daysOfWeek: z.array(DayOfWeekSchema),
  }),
  z.object({
    frequency: z.literal('CustomInterval'),
    intervalDays: z.number().int().positive(),
  }),
]);

export const InjectionSiteSchema = z.object({
  bodyPart: z.string(),
  side: z.enum(['left', 'right']),
});

export function parseDoseAmount(val: unknown): DoseAmount {
  return DoseAmountSchema.parse(val) as DoseAmount;
}

export function parseInjectionSite(val: unknown): InjectionSite | null {
  if (val === null || val === undefined) return null;
  // If it is Prisma JsonNull, it reads as null or is equivalent to null
  if (typeof val === 'object' && Object.keys(val).length === 0) return null;
  return InjectionSiteSchema.parse(val) as InjectionSite;
}

export function parseSchedule(val: unknown): Schedule {
  return ScheduleSchema.parse(val) as Schedule;
}

