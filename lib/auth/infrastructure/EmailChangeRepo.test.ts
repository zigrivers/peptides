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

  it('looks up by SHA-256 hash of the raw token', async () => {
    mockFindUnique.mockResolvedValue({ id: 'r1', userId: 'u1', oldEmail: 'old@e.com', newEmail: 'new@e.com', expiresAt: new Date(), status: 'PENDING', appliedAt: null, revertibleUntil: null, verifiedAt: null });
    const result = await EmailChangeRepo.findByRawToken('a'.repeat(64));
    expect(result?.id).toBe('r1');
    // Verify that findUnique was called with a hash (not the raw token)
    const calledHash = mockFindUnique.mock.calls[0][0].where.tokenHash;
    expect(calledHash).toHaveLength(64);
    expect(calledHash).not.toBe('a'.repeat(64));
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

  it('returns false when count === 0 (concurrent consumption)', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockUserUpdate.mockResolvedValue({});
    expect(await EmailChangeRepo.applyById(fakeTx, 'req-1', 'user-1', 'new@e.com')).toBe(false);
  });
});

describe('EmailChangeRepo.revertById', () => {
  it('returns true when reverted and user email restored', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockUserUpdate.mockResolvedValue({});
    const result = await EmailChangeRepo.revertById(fakeTx, 'req-1', 'user-1', 'old@e.com');
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

  it('returns false when count === 0', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockUserUpdate.mockResolvedValue({});
    expect(await EmailChangeRepo.revertById(fakeTx, 'req-1', 'user-1', 'old@e.com')).toBe(false);
  });
});
