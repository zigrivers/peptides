import { describe, it } from 'vitest';

/**
 * Story: US-REC-01 - Calculate Reconstitution
 */
describe('US-REC-01: Calculate Reconstitution', () => {
  it.todo('AC-1: calculates correct concentration for 5mg vial', () => {
    // Hint: check lib/reconstitution/domain/ReconstitutionCalculator
  });

  it.todo('AC-2: converts dose to syringe units (100-unit syringe)', () => {
    // Hint: targetDoseMcg / (totalMg * 1000 / bacWaterMl) * 100
  });

  it.todo('AC-3: triggers safety warnings for extreme volumes', () => {
    // Hint: check WarningPolicy in Reconstitution domain
  });

  it.todo('AC-4: displays last logged dose for context', () => {
    // Hint: check lib/tracker/infrastructure/PrismaDoseLogRepo.findLast()
  });

  // Boundary Case: Zero volume
  it.todo('Negative: rejects zero BAC water volume', () => {
    // Hint: check invariant in domain
  });
});

/**
 * Story: US-REC-02 - Record Reconstitution
 */
describe('US-REC-02: Record Reconstitution', () => {
  it.todo('AC-1: creates vial record with expiry date', () => {
    // Hint: check app/actions/reconstitution/save-vial.ts
  });

  it.todo('AC-2: shows low inventory badge on dashboard', () => {
    // Hint: check remainingMg < 10% logic in UI
  });
});
