import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withAudit } from './withAudit';
import { prisma } from '@/lib/shared/prisma';
import type { CreateAuditEventInput } from '../domain/AuditEvent';

vi.mock('@/lib/shared/prisma', () => ({
  prisma: { $transaction: vi.fn() },
}));

vi.mock('../infrastructure/PrismaAuditRepo', () => ({
  PrismaAuditRepo: { create: vi.fn() },
}));

import { PrismaAuditRepo } from '../infrastructure/PrismaAuditRepo';

const auditInput: CreateAuditEventInput = {
  actorUserId: 'user-abc',
  category: 'Protocol',
  action: 'PROTOCOL_CREATED',
  resourceId: 'proto-123',
  resourceType: 'Protocol',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('withAudit — PrismaClient path (starts a new $transaction)', () => {
  it('calls mutation then audit write inside a $transaction', async () => {
    const mutationResult = { id: 'proto-123' };
    const mockTx = {} as never;

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: never) => Promise<unknown>) =>
      fn(mockTx)
    );
    vi.mocked(PrismaAuditRepo.create).mockResolvedValue(undefined as never);

    const mutation = vi.fn().mockResolvedValue(mutationResult);
    const result = await withAudit(auditInput, mutation);

    expect(result).toEqual(mutationResult);
    expect(mutation).toHaveBeenCalledWith(mockTx);
    expect(PrismaAuditRepo.create).toHaveBeenCalledWith(mockTx, auditInput);
  });

  it('mutation runs before audit write (order guarantee)', async () => {
    const callOrder: string[] = [];
    const mockTx = {} as never;

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: never) => Promise<unknown>) =>
      fn(mockTx)
    );
    vi.mocked(PrismaAuditRepo.create).mockImplementation(async () => {
      callOrder.push('audit');
      return undefined as never;
    });

    const mutation = vi.fn().mockImplementation(async () => {
      callOrder.push('mutation');
      return { id: 'x' };
    });

    await withAudit(auditInput, mutation);

    expect(callOrder).toEqual(['mutation', 'audit']);
  });

  it('audit write failure propagates — $transaction rejects (triggers Prisma rollback in production)', async () => {
    const auditError = new Error('audit write failed');
    const mockTx = {} as never;

    // Simulate: fn runs, audit write throws, $transaction propagates the rejection.
    // In a real Prisma $transaction the rejection triggers full rollback of all writes.
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: never) => Promise<unknown>) =>
      fn(mockTx)
    );
    vi.mocked(PrismaAuditRepo.create).mockRejectedValue(auditError);

    const mutation = vi.fn().mockResolvedValue({ id: 'x' });

    await expect(withAudit(auditInput, mutation)).rejects.toThrow('audit write failed');
    // mutation ran but the transaction rejected — Prisma rolls back all writes within it
    expect(mutation).toHaveBeenCalled();
  });

  it('propagates errors thrown by $transaction itself', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('tx aborted'));

    await expect(withAudit(auditInput, vi.fn())).rejects.toThrow('tx aborted');
  });
});

describe('withAudit — auditInput factory function', () => {
  it('resolves audit input from mutation result (supports DB-generated resourceId)', async () => {
    const mutationResult = { id: 'db-generated-id' };
    const mockTx = {} as never;

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: never) => Promise<unknown>) =>
      fn(mockTx)
    );
    vi.mocked(PrismaAuditRepo.create).mockResolvedValue(undefined as never);

    const factory = vi.fn().mockImplementation((result: typeof mutationResult) => ({
      ...auditInput,
      resourceId: result.id,
    }));

    const mutation = vi.fn().mockResolvedValue(mutationResult);
    await withAudit(factory, mutation);

    expect(factory).toHaveBeenCalledWith(mutationResult);
    expect(PrismaAuditRepo.create).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({ resourceId: 'db-generated-id' })
    );
  });
});

describe('withAudit — TransactionClient path (joins existing transaction)', () => {
  it('runs mutation and audit write directly (no nested $transaction)', async () => {
    const mutationResult = { id: 'x' };
    // A TransactionClient has no $transaction method
    const mockTx = {} as never;

    vi.mocked(PrismaAuditRepo.create).mockResolvedValue(undefined as never);
    const mutation = vi.fn().mockResolvedValue(mutationResult);

    const result = await withAudit(auditInput, mutation, mockTx);

    expect(result).toEqual(mutationResult);
    // $transaction was NOT called — we're already inside one
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(PrismaAuditRepo.create).toHaveBeenCalledWith(mockTx, auditInput);
  });
});
