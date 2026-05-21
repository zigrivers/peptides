import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

const mockFindByEmail = vi.fn();
const mockCreate = vi.fn();
const mockSend = vi.fn();
const mockWithAudit = vi.fn();
// Default: no-op (task captured elsewhere or ignored)
const mockAfter = vi.fn((_fn: () => Promise<void>) => {});

vi.mock('next/server', () => ({
  unstable_after: mockAfter,
}));
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

const originalEnv = process.env;
beforeAll(() => { process.env = { ...originalEnv, NEXTAUTH_URL: 'https://app.example.com' }; });
afterAll(() => { process.env = originalEnv; });
beforeEach(() => { vi.clearAllMocks(); });

describe('requestPasswordReset', () => {
  it('resolves without error when the email is not registered (no enumeration)', async () => {
    mockFindByEmail.mockResolvedValue(null);
    await expect(requestPasswordReset('unknown@example.com')).resolves.toBeUndefined();
    expect(mockWithAudit).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it('defers all found-path work (token create + email) into after() for uniform response timing', async () => {
    mockFindByEmail.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
    mockWithAudit.mockImplementation(async (mutation: (tx: unknown) => Promise<unknown>, _audit: unknown, _client: unknown) =>
      mutation({ passwordResetToken: { create: mockCreate } })
    );
    mockCreate.mockResolvedValue('raw-token-hex');
    mockSend.mockResolvedValue({});

    // Capture the deferred task so we can run it explicitly and verify its internals.
    let deferredTask: (() => Promise<void>) | undefined;
    mockAfter.mockImplementationOnce((fn: () => Promise<void>) => { deferredTask = fn; });

    await requestPasswordReset('user@example.com');

    // The response boundary is hit — after() called but heavy work NOT yet executed.
    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(mockWithAudit).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();

    // Run the deferred task (simulates what Next.js runs after the response is sent).
    await deferredTask!();

    expect(mockWithAudit).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalled();
    // DB write (withAudit) must precede email send
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
