import { describe, it } from 'vitest';

/**
 * Task 1.2: Audit Infrastructure
 * Cross-cutting requirement: every sensitive mutation must emit an AuditEvent
 * within the same Prisma transaction as the mutation.
 */
describe('Audit Infrastructure', () => {
  it.todo('AC-1: audit write failure rolls back the entire mutation (transactional atomicity)', () => {
    // Hint: use vi.spyOn(db.auditEvent, 'create').mockRejectedValueOnce(new Error('boom'))
    // Assert the mutation record does not exist after the throw.
    // Integration test — requires real PostgreSQL; see lib/audit/application/withAudit.test.ts
  });

  it.todo('AC-2: audit events are immutable — no update or delete paths exist in PrismaAuditRepo', () => {
    // Hint: assert PrismaAuditRepo has no update/delete methods
    // See lib/audit/infrastructure/PrismaAuditRepo.test.ts
  });

  it.todo('AC-3: actorUserId is preserved after the actor User record is deleted', () => {
    // Hint: create user → emit event → delete user → assert event.actorUserId is unchanged
    // See lib/audit/infrastructure/PrismaAuditRepo.test.ts (preservation test)
  });
});
