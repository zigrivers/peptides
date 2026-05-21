import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockClaimToken = vi.fn();
const mockUserUpdate = vi.fn();
const mockPasswordHashCreate = vi.fn();
const mockWithAudit = vi.fn();

vi.mock('@/lib/auth/infrastructure/PasswordResetRepo', () => ({
  PasswordResetRepo: { claimToken: mockClaimToken },
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

const fakeTx = { user: { update: mockUserUpdate } } as unknown as import('@prisma/client').Prisma.TransactionClient;

function setupWithAudit() {
  mockWithAudit.mockImplementation(async (mutation, _buildAudit) => mutation(fakeTx));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPasswordHashCreate.mockResolvedValue({ toString: () => '$2b$12$hashedvalue' });
  mockUserUpdate.mockResolvedValue({});
  setupWithAudit();
});

describe('confirmPasswordReset', () => {
  it('throws token_not_found when claimToken throws token_not_found', async () => {
    mockClaimToken.mockRejectedValue(new Error('token_not_found'));
    await expect(
      confirmPasswordReset({ rawToken: 'no-such-token', newPassword: 'ValidPassword123' })
    ).rejects.toThrow('token_not_found');
  });

  it('throws token_already_used when claimToken throws token_already_used', async () => {
    mockClaimToken.mockRejectedValue(new Error('token_already_used'));
    await expect(
      confirmPasswordReset({ rawToken: 'used-token', newPassword: 'ValidPassword123' })
    ).rejects.toThrow('token_already_used');
  });

  it('throws token_expired when claimToken throws token_expired', async () => {
    mockClaimToken.mockRejectedValue(new Error('token_expired'));
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

  it('resolves and updates user password when token is valid', async () => {
    mockClaimToken.mockResolvedValue('user-1');
    await confirmPasswordReset({ rawToken: 'valid-token', newPassword: 'ValidPassword123' });
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } })
    );
  });

  it('audit factory returns PASSWORD_RESET_COMPLETED with correct actorUserId', async () => {
    mockClaimToken.mockResolvedValue('user-1');
    let capturedFactory: ((userId: string) => unknown) | null = null;
    mockWithAudit.mockImplementation(async (mutation, buildAudit) => {
      capturedFactory = buildAudit;
      return mutation(fakeTx);
    });

    await confirmPasswordReset({ rawToken: 'valid-token', newPassword: 'ValidPassword123' });

    expect(capturedFactory).toBeInstanceOf(Function);
    const audit = capturedFactory!('user-1');
    expect(audit).toMatchObject({ action: 'PASSWORD_RESET_COMPLETED', actorUserId: 'user-1' });
  });
});
