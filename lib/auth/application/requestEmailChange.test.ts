import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockCancelPending = vi.fn();
const mockWithAudit = vi.fn();
const mockCreate = vi.fn();
const mockAfter = vi.fn((_fn: () => Promise<void>) => {});
const mockSend = vi.fn();

vi.mock('next/server', () => ({ unstable_after: mockAfter }));
const mockEmailFindFirst = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    user: { findUnique: mockFindUnique, findFirst: mockFindFirst },
    emailChangeRequest: { findFirst: mockEmailFindFirst },
  },
}));
vi.mock('@/lib/audit/application/withAudit', () => ({ withAudit: mockWithAudit }));
vi.mock('@/lib/auth/infrastructure/EmailChangeRepo', () => ({
  EmailChangeRepo: { create: mockCreate, cancelPending: mockCancelPending },
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

// tx passed to withAudit mutation
const fakeTx = {};

beforeEach(() => {
  vi.clearAllMocks();
  mockFindUnique.mockResolvedValue(validUser);
  mockFindFirst.mockResolvedValue(null); // no user conflict by default
  mockEmailFindFirst.mockResolvedValue(null); // no oldEmail reservation by default
  mockCancelPending.mockResolvedValue(undefined);
  mockWithAudit.mockImplementation(async (mutation: (tx: unknown) => Promise<unknown>) =>
    mutation(fakeTx)
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
    mockFindFirst.mockResolvedValue({ id: 'other-user' });
    await expect(
      requestEmailChange({ userId: 'u1', currentPassword: 'ValidPass123', newEmail: 'taken@e.com' })
    ).rejects.toThrow('email_already_in_use');
  });

  it('throws email_already_in_use when newEmail is reserved as oldEmail in an active revert window', async () => {
    mockEmailFindFirst.mockResolvedValue({ id: 'req-existing' });
    await expect(
      requestEmailChange({ userId: 'u1', currentPassword: 'ValidPass123', newEmail: 'reserved@e.com' })
    ).rejects.toThrow('email_already_in_use');
  });

  it('cancels existing PENDING tokens via EmailChangeRepo.cancelPending before creating a new one', async () => {
    await requestEmailChange({ userId: 'u1', currentPassword: 'ValidPass123', newEmail: 'new@e.com' });
    expect(mockCancelPending).toHaveBeenCalledWith(fakeTx, 'u1');
  });

  it('creates a token via withAudit and calls after() for email delivery', async () => {
    await requestEmailChange({ userId: 'u1', currentPassword: 'ValidPass123', newEmail: 'new@e.com' });

    expect(mockWithAudit).toHaveBeenCalled();
    expect(mockAfter).toHaveBeenCalledTimes(1);
  });

  it('sends verification email inside the after() callback', async () => {
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
