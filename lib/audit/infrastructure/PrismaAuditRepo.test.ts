import { describe, it, expect } from 'vitest';
import { PrismaAuditRepo } from './PrismaAuditRepo';

describe('PrismaAuditRepo', () => {
  it('exposes only a create method — no update or delete (immutability)', () => {
    const methods = Object.keys(PrismaAuditRepo);
    expect(methods).toEqual(['create']);
  });

  it.todo('AC-immutability: audit events cannot be updated or deleted via Prisma (integration)', () => {
    // Requires real PostgreSQL.
    // 1. Create an AuditEvent via PrismaAuditRepo.create.
    // 2. Attempt prisma.auditEvent.update — assert it throws (no application path).
    // 3. Attempt prisma.auditEvent.delete — assert it throws (no application path).
    // Note: immutability is enforced at the application layer (no update/delete methods
    // in PrismaAuditRepo), not via DB triggers. This test verifies the absence of those paths.
  });

  it.todo('AC-preservation: actorUserId is preserved after the User row is hard-deleted (integration)', () => {
    // Requires real PostgreSQL.
    // 1. Create a User.
    // 2. Emit an AuditEvent with actorUserId = user.id.
    // 3. Hard-delete the User (simulating ADR-009 user-deletion flow).
    // 4. Assert AuditEvent.actorUserId still equals the original user.id.
    // This validates the intentional absence of an FK constraint on actorUserId.
  });
});
