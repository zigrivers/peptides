import { describe, it, expect, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { PrismaAuditRepo } from './PrismaAuditRepo';
import type { AuditAction, AuditCategory } from '../domain/AuditEvent';

describe('PrismaAuditRepo', () => {
  it('exposes only a create method — no update or delete (immutability at the application layer)', () => {
    const methods = Object.keys(PrismaAuditRepo);
    expect(methods).toEqual(['create']);
  });

  it('maps CreateAuditEventInput fields to tx.auditEvent.create correctly', async () => {
    const mockCreate = vi.fn().mockResolvedValue({ id: 'event-1' });
    const mockTx = {
      auditEvent: { create: mockCreate },
    } as unknown as Prisma.TransactionClient;

    const input = {
      actorUserId: 'user-1',
      subjectUserId: 'user-2',
      category: 'Protocol' as AuditCategory,
      action: 'PROTOCOL_CREATED' as AuditAction,
      resourceId: 'proto-1',
      resourceType: 'Protocol',
      metadata: { ip: '127.0.0.1', requestId: 'req-abc' },
      oldValues: { status: 'DRAFT' },
      newValues: { status: 'ACTIVE' },
    };

    await PrismaAuditRepo.create(mockTx, input);

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: 'user-1',
        subjectUserId: 'user-2',
        category: 'Protocol',
        action: 'PROTOCOL_CREATED',
        resourceId: 'proto-1',
        resourceType: 'Protocol',
        metadata: { ip: '127.0.0.1', requestId: 'req-abc' },
        oldValues: { status: 'DRAFT' },
        newValues: { status: 'ACTIVE' },
      }),
    });
  });

  it('omits optional JSON fields when not provided (no spurious nulls written)', async () => {
    const mockCreate = vi.fn().mockResolvedValue({ id: 'event-2' });
    const mockTx = {
      auditEvent: { create: mockCreate },
    } as unknown as Prisma.TransactionClient;

    await PrismaAuditRepo.create(mockTx, {
      actorUserId: 'user-1',
      category: 'Auth',
      action: 'USER_LOGGED_IN',
      resourceId: 'user-1',
      resourceType: 'User',
    });

    const { data } = mockCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect('metadata' in data).toBe(false);
    expect('oldValues' in data).toBe(false);
    expect('newValues' in data).toBe(false);
  });

  it.todo('DB integration: auditEvent records created via this repo have no FK on actorUserId (requires PostgreSQL)');
});
