import { describe, it, expect } from 'vitest';
import { syringeMaxUnits } from './syringe';

describe('syringeMaxUnits', () => {
  it.each([
    ['U100', '0.3', 30],
    ['U100', '0.5', 50],
    ['U100', '1.0', 100],
    ['U40', '0.3', 12],
    ['U40', '0.5', 20],
    ['U40', '1.0', 40],
  ] as const)('%s %s mL = %i units', (standard, size, expected) => {
    expect(syringeMaxUnits(standard, size)).toBe(expected);
  });
});
