import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PasswordResetToken } from '@/lib/auth/domain/PasswordResetToken';

// Stub the prisma singleton before importing the repo (avoids real DB connection).
const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    passwordResetToken: {
      create: mockCreate,
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  },
}));

const { PasswordResetRepo } = await import('./PasswordResetRepo');

const fakeTx = {
  passwordResetToken: {
    create: mockCreate,
    findUnique: mockFindUnique,
    update: mockUpdate,
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
    // Stored hash must NOT equal the raw token.
    expect(call.data.tokenHash).not.toBe(rawToken);
    // Stored hash must equal what PasswordResetToken.hash() produces.
    expect(call.data.tokenHash).toBe(PasswordResetToken.hash(rawToken));
    // Expiry is ~1 hour from now.
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

describe('PasswordResetRepo.markUsed', () => {
  it('sets used = true on the record by id', async () => {
    mockUpdate.mockResolvedValue({});
    await PasswordResetRepo.markUsed(fakeTx, 'record-id');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'record-id' },
      data: { used: true },
    });
  });
});
