import { Decimal } from 'decimal.js';
import type { CreateProtocolInput, UpdateProtocolInput } from './types';

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
  let d: Decimal;
  try {
    d = new Decimal(amount);
  } catch {
    throw new ProtocolValidationError('dose amount must be a valid number');
  }
  if (d.lte(0)) {
    throw new ProtocolValidationError('dose amount must be greater than zero');
  }
}
