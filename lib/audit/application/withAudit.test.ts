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

const staticAuditInput: CreateAuditEventInput = {
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
    const result = await withAudit(mutation, staticAuditInput);

    expect(result).toEqual(mutationResult);
    expect(mutation).toHaveBeenCalledWith(mockTx);
    expect(PrismaAuditRepo.create).toHaveBeenCalledWith(mockTx, staticAuditInput);
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

    await withAudit(
      async () => {
        callOrder.push('mutation');
        return { id: 'x' };
      },
      staticAuditInput
    );

    expect(callOrder).toEqual(['mutation', 'audit']);
  });

  it('audit write failure propagates — $transaction rejects (triggers Prisma rollback in production)', async () => {
    const auditError = new Error('audit write failed');
    const mockTx = {} as never;

    // When PrismaAuditRepo.create rejects, runInTx rejects, which causes $transaction to
    // reject and roll back all writes. Here we verify the error propagates correctly.
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: never) => Promise<unknown>) =>
      fn(mockTx)
    );
    vi.mocked(PrismaAuditRepo.create).mockRejectedValue(auditError);

    const mutation = vi.fn().mockResolvedValue({ id: 'x' });

    await expect(withAudit(mutation, staticAuditInput)).rejects.toThrow('audit write failed');
    expect(mutation).toHaveBeenCalled();
  });

  it('propagates errors thrown by $transaction itself', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('tx aborted'));

    await expect(withAudit(vi.fn(), staticAuditInput)).rejects.toThrow('tx aborted');
  });
});

describe('withAudit — buildAudit factory function', () => {
  it('resolves audit input from mutation result (supports DB-generated resourceId)', async () => {
    const mutationResult = { id: 'db-generated-id' };
    const mockTx = {} as never;

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: never) => Promise<unknown>) =>
      fn(mockTx)
    );
    vi.mocked(PrismaAuditRepo.create).mockResolvedValue(undefined as never);

    const buildAudit = vi.fn().mockImplementation((result: typeof mutationResult) => ({
      ...staticAuditInput,
      resourceId: result.id,
    }));

    const mutation = vi.fn().mockResolvedValue(mutationResult);
    await withAudit(mutation, buildAudit);

    expect(buildAudit).toHaveBeenCalledWith(mutationResult);
    expect(PrismaAuditRepo.create).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({ resourceId: 'db-generated-id' })
    );
  });
});

describe('withAudit — TransactionClient path (joins existing transaction)', () => {
  it('runs mutation and audit write directly (no nested $transaction)', async () => {
    const mutationResult = { id: 'x' };
    // A TransactionClient has no $transaction property
    const mockTx = {} as never;

    vi.mocked(PrismaAuditRepo.create).mockResolvedValue(undefined as never);
    const mutation = vi.fn().mockResolvedValue(mutationResult);

    const result = await withAudit(mutation, staticAuditInput, mockTx);

    expect(result).toEqual(mutationResult);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(PrismaAuditRepo.create).toHaveBeenCalledWith(mockTx, staticAuditInput);
  });
});
