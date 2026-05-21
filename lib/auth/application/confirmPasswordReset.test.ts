import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindByRawToken = vi.fn();
const mockClaimById = vi.fn();
const mockUserUpdate = vi.fn();
const mockPasswordHashCreate = vi.fn();
const mockWithAudit = vi.fn();

vi.mock('@/lib/auth/infrastructure/PasswordResetRepo', () => ({
  PasswordResetRepo: { findByRawToken: mockFindByRawToken, claimById: mockClaimById },
}));
vi.mock('@/lib/auth/domain/PasswordHash', () => ({
  PasswordHash: { create: mockPasswordHashCreate, fromHash: vi.fn() },
}));
vi.mock('@/lib/audit/application/withAudit', () => ({
  withAudit: mockWithAudit,
}));

const { confirmPasswordReset } = await import('./confirmPasswordReset');

const validRecord = {
  id: 'rec-1',
  userId: 'user-1',
  used: false,
  expiresAt: new Date(Date.now() + 3_600_000),
};

const fakeTx = { user: { update: mockUserUpdate } } as unknown as import('@prisma/client').Prisma.TransactionClient;

function setupWithAudit() {
  mockWithAudit.mockImplementation(async (mutation, _buildAudit) => mutation(fakeTx));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPasswordHashCreate.mockResolvedValue({ toString: () => '$2b$12$hashedvalue' });
  mockUserUpdate.mockResolvedValue({});
  mockClaimById.mockResolvedValue(true);
  setupWithAudit();
});

describe('confirmPasswordReset', () => {
  it('throws token_not_found when findByRawToken returns null', async () => {
    mockFindByRawToken.mockResolvedValue(null);
    await expect(
      confirmPasswordReset({ rawToken: 'no-such-token', newPassword: 'ValidPassword123' })
    ).rejects.toThrow('token_not_found');
  });

  it('throws token_already_used when record.used is true (pre-fetch validation)', async () => {
    mockFindByRawToken.mockResolvedValue({ ...validRecord, used: true });
    await expect(
      confirmPasswordReset({ rawToken: 'used-token', newPassword: 'ValidPassword123' })
    ).rejects.toThrow('token_already_used');
  });

  it('throws token_expired when record.expiresAt is in the past (pre-fetch validation)', async () => {
    const past = new Date(Date.now() - 1000);
    mockFindByRawToken.mockResolvedValue({ ...validRecord, expiresAt: past });
    await expect(
      confirmPasswordReset({ rawToken: 'expired-token', newPassword: 'ValidPassword123' })
    ).rejects.toThrow('token_expired');
  });

  it('throws password_too_short when new password is < 12 chars', async () => {
    mockFindByRawToken.mockResolvedValue(validRecord);
    mockPasswordHashCreate.mockRejectedValue(new Error('password_too_short'));
    await expect(
      confirmPasswordReset({ rawToken: 'valid-token', newPassword: 'short' })
    ).rejects.toThrow('password_too_short');
  });

  it('throws token_already_used when claimById returns false (concurrent consumption)', async () => {
    mockFindByRawToken.mockResolvedValue(validRecord);
    mockClaimById.mockResolvedValue(false);
    await expect(
      confirmPasswordReset({ rawToken: 'valid-token', newPassword: 'ValidPassword123' })
    ).rejects.toThrow('token_already_used');
  });

  it('calls claimById with id + userId (userId-scoped)', async () => {
    mockFindByRawToken.mockResolvedValue(validRecord);
    await confirmPasswordReset({ rawToken: 'valid-token', newPassword: 'ValidPassword123' });
    expect(mockClaimById).toHaveBeenCalledWith(fakeTx, 'rec-1', 'user-1');
  });

  it('updates user password and increments passwordVersion on success', async () => {
    mockFindByRawToken.mockResolvedValue(validRecord);
    await confirmPasswordReset({ rawToken: 'valid-token', newPassword: 'ValidPassword123' });
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ passwordVersion: { increment: 1 } }),
      })
    );
  });

  it('propagates tx.user.update error — atomicity depends on withAudit $transaction (rollback proof)', async () => {
    // claimById succeeds but user.update throws (e.g. user deleted between claim and update).
    // withAudit wraps both in a single Prisma $transaction — the error propagates and
    // Prisma rolls back claimById. withAudit.test.ts validates the $transaction guarantee.
    mockFindByRawToken.mockResolvedValue(validRecord);
    mockUserUpdate.mockRejectedValue(new Error('DB_WRITE_FAILED'));
    await expect(
      confirmPasswordReset({ rawToken: 'valid-token', newPassword: 'ValidPassword123' })
    ).rejects.toThrow('DB_WRITE_FAILED');
  });

  it('audit factory returns PASSWORD_RESET_COMPLETED with correct actorUserId', async () => {
    mockFindByRawToken.mockResolvedValue(validRecord);
    let capturedFactory: ((userId: string) => unknown) | null = null;
    mockWithAudit.mockImplementation(async (mutation, buildAudit) => {
      capturedFactory = buildAudit;
      return mutation(fakeTx);
    });

    await confirmPasswordReset({ rawToken: 'valid-token', newPassword: 'ValidPassword123' });

    expect(capturedFactory).toBeInstanceOf(Function);
    expect(capturedFactory!('user-1')).toMatchObject({
      action: 'PASSWORD_RESET_COMPLETED',
      actorUserId: 'user-1',
    });
  });
});
