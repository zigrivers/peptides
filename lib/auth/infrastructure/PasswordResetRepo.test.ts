import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PasswordResetToken } from '@/lib/auth/domain/PasswordResetToken';

const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    passwordResetToken: {
      create: mockCreate,
      findUnique: mockFindUnique,
      updateMany: mockUpdateMany,
    },
  },
}));

const { PasswordResetRepo } = await import('./PasswordResetRepo');

const fakeTx = {
  passwordResetToken: {
    create: mockCreate,
    findUnique: mockFindUnique,
    updateMany: mockUpdateMany,
  },
} as unknown as import('@prisma/client').Prisma.TransactionClient;

beforeEach(() => { vi.clearAllMocks(); });

describe('PasswordResetRepo.create', () => {
  it('inserts a record with hashed token and returns the raw token', async () => {
    mockCreate.mockResolvedValue({});
    const rawToken = await PasswordResetRepo.create(fakeTx, 'user-1');

    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    const call = mockCreate.mock.calls[0][0];
    expect(call.data.userId).toBe('user-1');
    expect(call.data.tokenHash).not.toBe(rawToken);
    expect(call.data.tokenHash).toBe(PasswordResetToken.hash(rawToken));
    expect(call.data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 3_590_000);
  });
});

describe('PasswordResetRepo.findByRawToken', () => {
  it('queries by SHA-256 hash and selects only safe fields', async () => {
    const raw = 'a'.repeat(64);
    mockFindUnique.mockResolvedValue({ id: '1', userId: 'u1', used: false, expiresAt: new Date() });
    await PasswordResetRepo.findByRawToken(raw);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { tokenHash: PasswordResetToken.hash(raw) },
      select: { id: true, userId: true, used: true, expiresAt: true },
    });
  });
});

describe('PasswordResetRepo.claimById', () => {
  it('returns true and uses userId-scoped updateMany when count=1', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const result = await PasswordResetRepo.claimById(fakeTx, 'rec-1', 'user-1');
    expect(result).toBe(true);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'rec-1', userId: 'user-1', used: false }),
      })
    );
  });

  it('returns false when count=0 (concurrent claim)', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const result = await PasswordResetRepo.claimById(fakeTx, 'rec-1', 'user-1');
    expect(result).toBe(false);
  });
});

describe('PasswordResetRepo.markUsed', () => {
  it('sets used = true on the record by id and userId (defense-in-depth scoping)', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    await PasswordResetRepo.markUsed(fakeTx, 'record-id', 'user-1');
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'record-id', userId: 'user-1' },
      data: { used: true },
    });
  });
});
