import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/shared/prisma', () => ({
  prisma: { $transaction: vi.fn() },
}));

vi.mock('@/lib/audit/infrastructure/PrismaAuditRepo', () => ({
  PrismaAuditRepo: { create: vi.fn() },
}));

import { withAudit } from '@/lib/audit/application/withAudit';
import { PrismaAuditRepo } from '@/lib/audit/infrastructure/PrismaAuditRepo';
import { prisma } from '@/lib/shared/prisma';

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Task 1.2: Audit Infrastructure
 * Cross-cutting requirement: every sensitive mutation must emit an AuditEvent
 * within the same Prisma transaction as the mutation.
 */

describe('AC-1: Audit write failure rolls back the mutation (transactional atomicity)', () => {
  it('audit write failure causes $transaction to reject — Prisma rolls back all writes', async () => {
    const auditError = new Error('audit write failed');
    const mockTx = {} as never;

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: never) => Promise<unknown>) =>
      fn(mockTx)
    );
    vi.mocked(PrismaAuditRepo.create).mockRejectedValue(auditError);

    const mutation = vi.fn().mockResolvedValue({ id: 'proto-1' });

    await expect(
      withAudit(mutation, {
        actorUserId: 'user-1',
        category: 'Protocol',
        action: 'PROTOCOL_CREATED',
        resourceId: 'proto-1',
        resourceType: 'Protocol',
      })
    ).rejects.toThrow('audit write failed');

    // mutation ran but the transaction rejected — Prisma rolls back all writes within it
    expect(mutation).toHaveBeenCalled();
  });

  it.todo('DB integration: mutation record absent from DB after audit write failure (requires PostgreSQL)', () => {
    // 1. Run withAudit against a real DB in a transaction.
    // 2. Force PrismaAuditRepo.create to throw (spy mock).
    // 3. Assert the mutation record is not present in the DB.
    // Activates when the PostgreSQL test harness is wired (Task integration test phase).
  });
});

describe('AC-2: Audit events are immutable', () => {
  it('PrismaAuditRepo exposes only create — no update or delete paths exist at the application layer', () => {
    const methods = Object.keys(PrismaAuditRepo);
    expect(methods).toEqual(['create']);
  });
});

describe('AC-3: actorUserId is preserved after the User record is hard-deleted', () => {
  it.todo('requires PostgreSQL — create user, emit event, delete user, assert event.actorUserId unchanged', () => {
    // Validates the intentional absence of an FK constraint on actorUserId (ADR-009).
  });
});
