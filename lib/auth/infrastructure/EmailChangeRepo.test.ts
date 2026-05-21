import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdateMany = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    emailChangeRequest: {
      create: mockCreate,
      findUnique: mockFindUnique,
      updateMany: mockUpdateMany,
    },
    user: { update: mockUserUpdate },
  },
}));

const { EmailChangeRepo } = await import('./EmailChangeRepo');

const fakeTx = {
  emailChangeRequest: { create: mockCreate, updateMany: mockUpdateMany },
  user: { update: mockUserUpdate },
} as unknown as import('@prisma/client').Prisma.TransactionClient;

const fakeCreatedAt = new Date('2026-01-01T00:00:00Z');

beforeEach(() => { vi.clearAllMocks(); });

describe('EmailChangeRepo.create', () => {
  it('creates a record and returns a 64-char hex raw token', async () => {
    mockCreate.mockResolvedValue({});
    const rawToken = await EmailChangeRepo.create(fakeTx, 'user-1', 'old@e.com', 'new@e.com');
    expect(rawToken).toHaveLength(64);
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          oldEmail: 'old@e.com',
          newEmail: 'new@e.com',
          status: 'PENDING',
        }),
      })
    );
  });
});

describe('EmailChangeRepo.findByRawToken', () => {
  it('returns null when not found', async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await EmailChangeRepo.findByRawToken('no-token')).toBeNull();
  });

  it('looks up by SHA-256 hash of the raw token and includes createdAt', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'r1', userId: 'u1', oldEmail: 'old@e.com', newEmail: 'new@e.com',
      createdAt: fakeCreatedAt, expiresAt: new Date(), status: 'PENDING',
      appliedAt: null, revertibleUntil: null, verifiedAt: null,
    });
    const result = await EmailChangeRepo.findByRawToken('a'.repeat(64));
    expect(result?.id).toBe('r1');
    expect(result?.createdAt).toEqual(fakeCreatedAt);
    // Verify that findUnique was called with a hash (not the raw token)
    const calledHash = mockFindUnique.mock.calls[0][0].where.tokenHash;
    expect(calledHash).toHaveLength(64);
    expect(calledHash).not.toBe('a'.repeat(64));
  });
});

describe('EmailChangeRepo.cancelPending', () => {
  it('cancels all PENDING tokens for the user', async () => {
    mockUpdateMany.mockResolvedValue({ count: 2 });
    await EmailChangeRepo.cancelPending(fakeTx, 'user-1');
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', status: 'PENDING' },
        data: { status: 'CANCELLED' },
      })
    );
  });
});

describe('EmailChangeRepo.applyById', () => {
  it('returns true when one row updated and user email changed', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockUserUpdate.mockResolvedValue({});
    const result = await EmailChangeRepo.applyById(fakeTx, 'req-1', 'user-1', 'new@e.com');
    expect(result).toBe(true);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'req-1', userId: 'user-1', status: 'PENDING' }),
        data: expect.objectContaining({ status: 'APPLIED' }),
      })
    );
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' }, data: { email: 'new@e.com' } })
    );
  });

  it('returns false and skips user.update when count === 0 (concurrent consumption or expiry)', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    expect(await EmailChangeRepo.applyById(fakeTx, 'req-1', 'user-1', 'new@e.com')).toBe(false);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it('includes expiresAt > now guard to prevent TOCTOU expiry bypass', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockUserUpdate.mockResolvedValue({});
    await EmailChangeRepo.applyById(fakeTx, 'req-1', 'user-1', 'new@e.com');
    const whereArg = mockUpdateMany.mock.calls[0][0].where;
    expect(whereArg).toHaveProperty('expiresAt');
    expect(whereArg.expiresAt).toHaveProperty('gt');
  });

  it('throws email_already_in_use on Prisma P2002 unique violation', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const prismaError = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    mockUserUpdate.mockRejectedValue(prismaError);
    await expect(
      EmailChangeRepo.applyById(fakeTx, 'req-1', 'user-1', 'taken@e.com')
    ).rejects.toThrow('email_already_in_use');
  });
});

describe('EmailChangeRepo.revertById', () => {
  it('returns true when reverted and user email restored', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockUserUpdate.mockResolvedValue({});
    const result = await EmailChangeRepo.revertById(fakeTx, 'req-1', 'user-1', 'old@e.com', fakeCreatedAt);
    expect(result).toBe(true);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'req-1', userId: 'user-1', status: 'APPLIED' }),
        data: expect.objectContaining({ status: 'REVERTED' }),
      })
    );
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' }, data: { email: 'old@e.com' } })
    );
  });

  it('returns false and skips user.update when count === 0 (concurrent or expired)', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    expect(await EmailChangeRepo.revertById(fakeTx, 'req-1', 'user-1', 'old@e.com', fakeCreatedAt)).toBe(false);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it('includes revertibleUntil > now guard to prevent TOCTOU expiry bypass', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockUserUpdate.mockResolvedValue({});
    await EmailChangeRepo.revertById(fakeTx, 'req-1', 'user-1', 'old@e.com', fakeCreatedAt);
    const whereArg = mockUpdateMany.mock.calls[0][0].where;
    expect(whereArg).toHaveProperty('revertibleUntil');
    expect(whereArg.revertibleUntil).toHaveProperty('gt');
  });

  it('cancels PENDING and only newer APPLIED tokens to prevent chaining attacks without affecting older revert rights', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockUserUpdate.mockResolvedValue({});
    await EmailChangeRepo.revertById(fakeTx, 'req-1', 'user-1', 'old@e.com', fakeCreatedAt);
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    const secondCall = mockUpdateMany.mock.calls[1][0];
    expect(secondCall.where).toMatchObject({ userId: 'user-1', id: { not: 'req-1' } });
    // OR clause must include PENDING and APPLIED-with-createdAt-gt conditions
    expect(secondCall.where.OR).toEqual(
      expect.arrayContaining([
        { status: 'PENDING' },
        expect.objectContaining({ status: 'APPLIED', createdAt: { gt: fakeCreatedAt } }),
      ])
    );
    expect(secondCall.data).toEqual({ status: 'CANCELLED' });
  });

  it('throws email_already_in_use on Prisma P2002 unique violation during revert', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const prismaError = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    mockUserUpdate.mockRejectedValue(prismaError);
    await expect(
      EmailChangeRepo.revertById(fakeTx, 'req-1', 'user-1', 'old@e.com', fakeCreatedAt)
    ).rejects.toThrow('email_already_in_use');
  });
});
