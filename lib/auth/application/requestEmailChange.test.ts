import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

const mockFindUnique = vi.fn();
const mockWithAudit = vi.fn();
const mockCreate = vi.fn();
const mockAfter = vi.fn((_fn: () => Promise<void>) => {});
const mockSend = vi.fn();

vi.mock('next/server', () => ({ unstable_after: mockAfter }));
vi.mock('@/lib/shared/prisma', () => ({
  prisma: { user: { findUnique: mockFindUnique } },
}));
vi.mock('@/lib/audit/application/withAudit', () => ({ withAudit: mockWithAudit }));
vi.mock('@/lib/auth/infrastructure/EmailChangeRepo', () => ({
  EmailChangeRepo: { create: mockCreate },
}));
vi.mock('@/lib/shared/email', () => ({
  resend: { emails: { send: mockSend } },
  FROM_ADDRESS: 'noreply@peptides.app',
}));

const { requestEmailChange } = await import('./requestEmailChange');

const CURRENT_HASH = await bcrypt.hash('ValidPass123', 4);

const validUser = {
  email: 'user@example.com',
  passwordHash: CURRENT_HASH,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFindUnique.mockResolvedValue(validUser);
  mockWithAudit.mockImplementation(async (mutation: (tx: unknown) => Promise<unknown>) =>
    mutation({})
  );
  mockCreate.mockResolvedValue('raw-token-64hex');
});

describe('requestEmailChange', () => {
  it('throws user_not_found when user has no passwordHash', async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(
      requestEmailChange({ userId: 'u1', currentPassword: 'ValidPass123', newEmail: 'new@e.com' })
    ).rejects.toThrow('user_not_found');
  });

  it('throws current_password_invalid when current password is wrong', async () => {
    await expect(
      requestEmailChange({ userId: 'u1', currentPassword: 'WrongPass!', newEmail: 'new@e.com' })
    ).rejects.toThrow('current_password_invalid');
  });

  it('throws email_same_as_current when new email matches existing (case-insensitive)', async () => {
    await expect(
      requestEmailChange({ userId: 'u1', currentPassword: 'ValidPass123', newEmail: 'USER@EXAMPLE.COM' })
    ).rejects.toThrow('email_same_as_current');
  });

  it('throws email_already_in_use when another user has that email', async () => {
    // First call returns user record; second call (conflict check) returns existing user
    mockFindUnique
      .mockResolvedValueOnce(validUser)
      .mockResolvedValueOnce({ id: 'other-user' });
    await expect(
      requestEmailChange({ userId: 'u1', currentPassword: 'ValidPass123', newEmail: 'taken@e.com' })
    ).rejects.toThrow('email_already_in_use');
  });

  it('creates a token via withAudit and calls after() for email delivery', async () => {
    // Conflict check: no existing user for new email
    mockFindUnique
      .mockResolvedValueOnce(validUser)
      .mockResolvedValueOnce(null);

    await requestEmailChange({ userId: 'u1', currentPassword: 'ValidPass123', newEmail: 'new@e.com' });

    expect(mockWithAudit).toHaveBeenCalled();
    expect(mockAfter).toHaveBeenCalledTimes(1);
  });

  it('sends verification email inside the after() callback', async () => {
    mockFindUnique
      .mockResolvedValueOnce(validUser)
      .mockResolvedValueOnce(null);
    mockSend.mockResolvedValue({});

    let deferredTask: (() => Promise<void>) | undefined;
    mockAfter.mockImplementationOnce((fn: () => Promise<void>) => { deferredTask = fn; });

    const originalUrl = process.env.NEXTAUTH_URL;
    process.env.NEXTAUTH_URL = 'https://app.example.com';
    try {
      await requestEmailChange({ userId: 'u1', currentPassword: 'ValidPass123', newEmail: 'new@e.com' });
      expect(deferredTask).toBeDefined();
      await deferredTask!();
    } finally {
      process.env.NEXTAUTH_URL = originalUrl;
    }
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'new@e.com' })
    );
  });
});
