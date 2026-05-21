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
vi.mock('@/lib/shared/prisma', () => ({ prisma: {} }));

const { requestPasswordReset } = await import('./requestPasswordReset');

beforeEach(() => { vi.clearAllMocks(); });

describe('requestPasswordReset', () => {
  it('resolves without error when the email is not registered (no enumeration)', async () => {
    mockFindByEmail.mockResolvedValue(null);
    await expect(requestPasswordReset('unknown@example.com')).resolves.toBeUndefined();
    expect(mockWithAudit).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('creates a token via withAudit then sends email outside the transaction', async () => {
    mockFindByEmail.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
    // withAudit returns the result of the mutation (rawToken)
    mockWithAudit.mockImplementation(async (mutation, _audit, _client) => {
      return mutation({ passwordResetToken: { create: mockCreate } });
    });
    mockCreate.mockResolvedValue('raw-token-hex');
    mockSend.mockResolvedValue({});

    await requestPasswordReset('user@example.com');

    expect(mockWithAudit).toHaveBeenCalled();
    // Email is sent AFTER withAudit (outside the transaction)
    expect(mockSend).toHaveBeenCalled();
    // Email send call order: withAudit first, then send
    const withAuditOrder = mockWithAudit.mock.invocationCallOrder[0];
    const sendOrder = mockSend.mock.invocationCallOrder[0];
    expect(sendOrder).toBeGreaterThan(withAuditOrder);
  });

  it('normalizes email to lowercase before lookup', async () => {
    mockFindByEmail.mockResolvedValue(null);
    await requestPasswordReset('USER@Example.COM');
    expect(mockFindByEmail).toHaveBeenCalledWith('user@example.com');
  });
});
