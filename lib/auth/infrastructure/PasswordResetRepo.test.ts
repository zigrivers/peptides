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
  it('queries by SHA-256 hash of the raw token', async () => {
    const raw = 'a'.repeat(64);
    mockFindUnique.mockResolvedValue({ id: '1', tokenHash: PasswordResetToken.hash(raw) });
    await PasswordResetRepo.findByRawToken(raw);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { tokenHash: PasswordResetToken.hash(raw) },
    });
  });
});

describe('PasswordResetRepo.claimToken', () => {
  const TOKEN_HASH = 'a'.repeat(64);

  it('returns userId when updateMany count=1', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindUnique.mockResolvedValue({ id: 'rec-1', userId: 'user-1' });
    const userId = await PasswordResetRepo.claimToken(fakeTx, TOKEN_HASH);
    expect(userId).toBe('user-1');
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tokenHash: TOKEN_HASH, used: false }) })
    );
  });

  it('throws token_not_found when count=0 and record is null', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockFindUnique.mockResolvedValue(null);
    await expect(PasswordResetRepo.claimToken(fakeTx, TOKEN_HASH)).rejects.toThrow('token_not_found');
  });

  it('throws token_already_used when count=0 and record.used=true', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockFindUnique.mockResolvedValue({ used: true, expiresAt: new Date(Date.now() + 3_600_000) });
    await expect(PasswordResetRepo.claimToken(fakeTx, TOKEN_HASH)).rejects.toThrow('token_already_used');
  });

  it('throws token_expired when count=0 and record.used=false (expired)', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockFindUnique.mockResolvedValue({ used: false, expiresAt: new Date(Date.now() - 1000) });
    await expect(PasswordResetRepo.claimToken(fakeTx, TOKEN_HASH)).rejects.toThrow('token_expired');
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
