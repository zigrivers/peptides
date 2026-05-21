import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdateMany = vi.fn();
const mockFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockPasswordHashCreate = vi.fn();
const mockWithAudit = vi.fn();

vi.mock('@/lib/auth/domain/PasswordHash', () => ({
  PasswordHash: {
    create: mockPasswordHashCreate,
    fromHash: vi.fn(),
  },
}));
vi.mock('@/lib/audit/application/withAudit', () => ({
  withAudit: mockWithAudit,
}));

const { confirmPasswordReset } = await import('./confirmPasswordReset');

const TOKEN_HASH = 'a'.repeat(64);

// Helper: simulates withAudit executing the mutation fn with a fake tx.
const fakeTx = {
  passwordResetToken: { updateMany: mockUpdateMany, findUnique: mockFindUnique },
  user: { update: mockUserUpdate },
};

function setupWithAudit() {
  mockWithAudit.mockImplementation(async (mutation, _buildAudit) => {
    const result = await mutation(fakeTx);
    return result;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPasswordHashCreate.mockResolvedValue({ toString: () => '$2b$12$hashedvalue' });
  mockUserUpdate.mockResolvedValue({});
  setupWithAudit();
});

describe('confirmPasswordReset', () => {
  it('throws token_not_found when updateMany count=0 and no record exists', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockFindUnique.mockResolvedValue(null);
    await expect(
      confirmPasswordReset({ rawToken: 'no-such-token', newPassword: 'ValidPassword123' })
    ).rejects.toThrow('token_not_found');
  });

  it('throws token_already_used when updateMany count=0 and record.used is true', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockFindUnique.mockResolvedValue({
      id: 'rec-1', userId: 'user-1', tokenHash: TOKEN_HASH,
      expiresAt: new Date(Date.now() + 3_600_000), used: true,
    });
    await expect(
      confirmPasswordReset({ rawToken: 'used-token', newPassword: 'ValidPassword123' })
    ).rejects.toThrow('token_already_used');
  });

  it('throws token_expired when updateMany count=0 and record.expiresAt is in the past', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockFindUnique.mockResolvedValue({
      id: 'rec-1', userId: 'user-1', tokenHash: TOKEN_HASH,
      expiresAt: new Date(Date.now() - 1000), used: false,
    });
    await expect(
      confirmPasswordReset({ rawToken: 'expired-token', newPassword: 'ValidPassword123' })
    ).rejects.toThrow('token_expired');
  });

  it('throws password_too_short when new password is < 12 chars', async () => {
    mockPasswordHashCreate.mockRejectedValue(new Error('password_too_short'));
    await expect(
      confirmPasswordReset({ rawToken: 'valid-token', newPassword: 'short' })
    ).rejects.toThrow('password_too_short');
  });

  it('resolves and calls withAudit with PASSWORD_RESET_COMPLETED for valid input', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindUnique.mockResolvedValue({
      id: 'rec-1', userId: 'user-1', tokenHash: TOKEN_HASH,
      expiresAt: new Date(Date.now() + 3_600_000), used: true,
    });

    await confirmPasswordReset({ rawToken: 'valid-token', newPassword: 'ValidPassword123' });

    expect(mockWithAudit).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function)
    );
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } })
    );
  });

  it('audit factory returns PASSWORD_RESET_COMPLETED with correct actorUserId', async () => {
    let capturedFactory: ((userId: string) => unknown) | null = null;
    mockWithAudit.mockImplementation(async (mutation, buildAudit) => {
      capturedFactory = buildAudit;
      mockUpdateMany.mockResolvedValue({ count: 1 });
      mockFindUnique.mockResolvedValue({
        id: 'rec-1', userId: 'user-1', tokenHash: TOKEN_HASH,
        expiresAt: new Date(Date.now() + 3_600_000), used: true,
      });
      const result = await mutation(fakeTx);
      return result;
    });

    await confirmPasswordReset({ rawToken: 'valid-token', newPassword: 'ValidPassword123' });

    expect(capturedFactory).toBeInstanceOf(Function);
    const audit = capturedFactory!('user-1');
    expect(audit).toMatchObject({ action: 'PASSWORD_RESET_COMPLETED', actorUserId: 'user-1' });
  });
});
