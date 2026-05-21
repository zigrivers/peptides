import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindByRawToken = vi.fn();
const mockMarkUsed = vi.fn();
const mockPasswordHashCreate = vi.fn();
const mockWithAudit = vi.fn();

vi.mock('@/lib/auth/infrastructure/PasswordResetRepo', () => ({
  PasswordResetRepo: { findByRawToken: mockFindByRawToken, markUsed: mockMarkUsed },
}));
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

const validRecord = {
  id: 'rec-1',
  userId: 'user-1',
  tokenHash: 'abc',
  expiresAt: new Date(Date.now() + 3_600_000),
  used: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPasswordHashCreate.mockResolvedValue({ toString: () => '$2b$12$hashedvalue' });
  mockWithAudit.mockImplementation(async (mutation, _audit) => mutation({ user: { update: vi.fn() } }));
});

describe('confirmPasswordReset', () => {
  it('throws token_not_found when no record exists for the raw token', async () => {
    mockFindByRawToken.mockResolvedValue(null);
    await expect(
      confirmPasswordReset({ rawToken: 'no-such-token', newPassword: 'ValidPassword123' })
    ).rejects.toThrow('token_not_found');
  });

  it('throws token_already_used when record.used is true', async () => {
    mockFindByRawToken.mockResolvedValue({ ...validRecord, used: true });
    await expect(
      confirmPasswordReset({ rawToken: 'some-token', newPassword: 'ValidPassword123' })
    ).rejects.toThrow('token_already_used');
  });

  it('throws token_expired when record.expiresAt is in the past', async () => {
    const past = new Date(Date.now() - 1000);
    mockFindByRawToken.mockResolvedValue({ ...validRecord, expiresAt: past });
    await expect(
      confirmPasswordReset({ rawToken: 'some-token', newPassword: 'ValidPassword123' })
    ).rejects.toThrow('token_expired');
  });

  it('throws password_too_short when new password is < 12 chars', async () => {
    mockFindByRawToken.mockResolvedValue(validRecord);
    mockPasswordHashCreate.mockRejectedValue(new Error('password_too_short'));
    await expect(
      confirmPasswordReset({ rawToken: 'valid-token', newPassword: 'short' })
    ).rejects.toThrow('password_too_short');
  });

  it('resolves and calls withAudit with PASSWORD_RESET_COMPLETED for a valid input', async () => {
    mockFindByRawToken.mockResolvedValue(validRecord);
    await confirmPasswordReset({ rawToken: 'valid-token', newPassword: 'ValidPassword123' });
    expect(mockWithAudit).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ action: 'PASSWORD_RESET_COMPLETED', actorUserId: 'user-1' })
    );
  });
});
