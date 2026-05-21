import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindByEmail = vi.fn();
const mockCreate = vi.fn();
const mockSend = vi.fn();
const mockWithAudit = vi.fn();

vi.mock('@/lib/auth/infrastructure/AuthRepository', () => ({
  AuthRepository: { findByEmailForAuth: mockFindByEmail },
}));
vi.mock('@/lib/auth/infrastructure/PasswordResetRepo', () => ({
  PasswordResetRepo: { create: mockCreate },
}));
vi.mock('@/lib/shared/email', () => ({
  resend: { emails: { send: mockSend } },
  FROM_ADDRESS: 'noreply@peptides.app',
}));
vi.mock('@/lib/audit/application/withAudit', () => ({
  withAudit: mockWithAudit,
}));

const { requestPasswordReset } = await import('./requestPasswordReset');

beforeEach(() => { vi.clearAllMocks(); });

describe('requestPasswordReset', () => {
  it('resolves without error when the email is not registered (no enumeration)', async () => {
    mockFindByEmail.mockResolvedValue(null);
    await expect(requestPasswordReset('unknown@example.com')).resolves.toBeUndefined();
    expect(mockWithAudit).not.toHaveBeenCalled();
  });

  it('creates a token and sends an email when the user exists', async () => {
    mockFindByEmail.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
    mockCreate.mockResolvedValue('raw-token-hex');
    mockWithAudit.mockImplementation(async (mutation, _audit) => {
      await mutation({ passwordResetToken: { create: mockCreate } });
    });
    mockSend.mockResolvedValue({});

    await requestPasswordReset('user@example.com');

    expect(mockFindByEmail).toHaveBeenCalledWith('user@example.com');
    expect(mockWithAudit).toHaveBeenCalled();
  });

  it('normalizes email to lowercase before lookup', async () => {
    mockFindByEmail.mockResolvedValue(null);
    await requestPasswordReset('USER@Example.COM');
    expect(mockFindByEmail).toHaveBeenCalledWith('user@example.com');
  });
});
