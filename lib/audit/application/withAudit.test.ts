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

describe('withAudit', () => {
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

  it('audit write receives the mutation result before writing (order: mutation first)', async () => {
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

  it('propagates errors thrown by $transaction (covers audit-write failure path)', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('tx aborted'));

    await expect(withAudit(auditInput, vi.fn())).rejects.toThrow('tx aborted');
  });
});
