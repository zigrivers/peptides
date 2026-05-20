import { describe, it } from 'vitest';

/**
 * Story: US-TRK-01 - Create and Edit Protocol
 */
describe('US-TRK-01: Create and Edit Protocol', () => {
  it.todo('AC-1: generates schedule starting from selected date', () => {
    // Hint: check lib/tracker/domain/Protocol
  });

  it.todo('AC-2: assigns protocol to managed user', () => {
    // Hint: check lib/auth/domain/User roles
  });

  it.todo('AC-3: blocks saving if compound or dose is missing', () => {
    // Hint: check Zod schema in app/actions/tracker/create-protocol.ts
  });

  it.todo('AC-4: records audit log on creation/modification', () => {
    // Hint: assert AuditEvent persists in lib/audit
  });
});

/**
 * Story: US-TRK-02 - Protocol Lifecycle
 */
describe('US-TRK-02: Protocol Lifecycle', () => {
  it.todo('AC-1: hides paused protocol from Today doses', () => {
    // Hint: check status filter in dashboard query
  });

  it.todo('AC-2: resumes paused protocol instantly', () => {
    // Hint: check status transition in domain
  });

  it.todo('AC-3: clones protocol preserving dose and frequency', () => {
    // Hint: check Protocol.clone() domain service
  });

  it.todo('AC-4: restarts cycle by cloning all protocols', () => {
    // Hint: check CycleRestarted domain event
  });
});

/**
 * Story: US-TRK-03 - Individual Dose Logging
 */
describe('US-TRK-03: Individual Dose Logging', () => {
  it.todo('AC-1: records dose with timestamp and site', () => {
    // Hint: check app/actions/tracker/log-dose.ts
  });

  it.todo('AC-2: records explicit skip event', () => {
    // Hint: assert DoseLog status is 'Skipped'
  });

  it.todo('AC-3: queues dose log while offline', () => {
    // Hint: check worker/service-worker.ts (Serwist)
  });

  it.todo('AC-4: shows warning if vial inventory is empty', () => {
    // Hint: check lib/reconstitution/domain/Vial
  });

  it.todo('Negative: rejects future dose logging', () => {
    // Hint: check invariant in lib/tracker/domain/Protocol
  });
});

/**
 * Story: US-TRK-05 - Batch Log
 */
describe('US-TRK-05: Batch Log', () => {
  it.todo('AC-1: logs all scheduled doses in one action', () => {
    // Hint: check app/actions/tracker/batch-log.ts
  });

  it.todo('AC-2: allows deselecting doses in review sheet', () => {
    // Hint: check Client State in OrderingProvider
  });
});

/**
 * Story: US-TRK-08 - Manage Cycles
 */
describe('US-TRK-08: Manage Cycles', () => {
  it.todo('AC-1: creates cycle with name and date range', () => {
    // Hint: check lib/tracker/domain/Cycle
  });

  it.todo('AC-2: links multiple protocols to one cycle', () => {
    // Hint: check CycleId FK in Protocol table
  });

  it.todo('AC-3: displays current week number on dashboard', () => {
    // Hint: check weekOffset calculation in lib/shared/utils
  });
});
