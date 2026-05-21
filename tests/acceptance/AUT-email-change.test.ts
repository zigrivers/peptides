import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailChangeToken } from '@/lib/auth/domain/EmailChangeToken';
import bcrypt from 'bcryptjs';

/**
 * Story: US-AUT-07 - Change Own Email
 * Domain-level and application-service-level acceptance tests.
 * DB-integration cases require a real Postgres instance and are marked it.todo.
 */

// --- Domain-level AC coverage (no DB required) ---

describe('US-AUT-07: Change Own Email', () => {
  it('AC-6: verify token expires in 24h; revert window is 48h from apply time', () => {
    const msIn24h = 24 * 60 * 60 * 1000;
    const msIn48h = 48 * 60 * 60 * 1000;
    const before = Date.now();
    const verifyExpiry = EmailChangeToken.verifyExpiry();
    const revertExpiry = EmailChangeToken.revertExpiry(new Date(before));
    const after = Date.now();

    expect(verifyExpiry.getTime()).toBeGreaterThanOrEqual(before + msIn24h);
    expect(verifyExpiry.getTime()).toBeLessThanOrEqual(after + msIn24h + 100);
    expect(revertExpiry.getTime()).toBeGreaterThanOrEqual(before + msIn48h);
    expect(revertExpiry.getTime()).toBeLessThanOrEqual(after + msIn48h + 100);
  });

  it('AC-6: verify token past expiresAt → token_expired', () => {
    const record = { status: 'PENDING', expiresAt: new Date(Date.now() - 1) };
    expect(() => EmailChangeToken.validateForVerify(record)).toThrow('token_expired');
  });

  it('AC-7: token reuse after apply returns token_already_used (via validateForVerify)', () => {
    const future = new Date(Date.now() + 3_600_000);
    const appliedRecord = { status: 'APPLIED', expiresAt: future };
    expect(() => EmailChangeToken.validateForVerify(appliedRecord)).toThrow('token_already_used');
  });

  it('AC-7: revert token reuse after revert returns token_already_used (via validateForRevert)', () => {
    const future = new Date(Date.now() + 3_600_000);
    const revertedRecord = { status: 'REVERTED', revertibleUntil: future };
    expect(() => EmailChangeToken.validateForRevert(revertedRecord)).toThrow('token_already_used');
  });

  it('AC-6: revert token past revertibleUntil → token_expired', () => {
    const past = new Date(Date.now() - 1);
    const record = { status: 'APPLIED', revertibleUntil: past };
    expect(() => EmailChangeToken.validateForRevert(record)).toThrow('token_expired');
  });

  it('verify token is hashed at rest — raw token never stored', () => {
    const { rawToken, tokenHash } = EmailChangeToken.generate();
    expect(rawToken).toHaveLength(64);
    expect(tokenHash).toHaveLength(64);
    expect(tokenHash).not.toBe(rawToken);
    expect(EmailChangeToken.hash(rawToken)).toBe(tokenHash);
  });
});

// --- Application-service-level AC coverage (mocked DB) ---

const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockCancelPending = vi.fn();
const mockCreate = vi.fn();
const mockFindByRawToken = vi.fn();
const mockApplyById = vi.fn();
const mockRevertById = vi.fn();
const mockWithAudit = vi.fn();
const mockAfter = vi.fn((_fn: () => Promise<void>) => {});
const mockSend = vi.fn();
const mockEmailUpdateMany = vi.fn();
const mockEmailFindFirst = vi.fn();

vi.mock('next/server', () => ({ unstable_after: mockAfter }));
vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    user: { findUnique: mockFindUnique, findFirst: mockFindFirst },
    emailChangeRequest: { updateMany: mockEmailUpdateMany, findFirst: mockEmailFindFirst },
  },
}));
vi.mock('@/lib/audit/application/withAudit', () => ({ withAudit: mockWithAudit }));
vi.mock('@/lib/auth/infrastructure/EmailChangeRepo', () => ({
  EmailChangeRepo: {
    create: mockCreate,
    cancelPending: mockCancelPending,
    findByRawToken: mockFindByRawToken,
    applyById: mockApplyById,
    revertById: mockRevertById,
  },
}));
vi.mock('@/lib/shared/email', () => ({
  resend: { emails: { send: mockSend } },
  FROM_ADDRESS: 'noreply@peptides.app',
}));

const { requestEmailChange } = await import('@/lib/auth/application/requestEmailChange');
const { verifyEmailChange } = await import('@/lib/auth/application/verifyEmailChange');
const { revertEmailChange } = await import('@/lib/auth/application/revertEmailChange');

const PASSWORD = 'ValidPass123';
const HASH = await bcrypt.hash(PASSWORD, 4);
const future = new Date(Date.now() + 3_600_000);
const fakeTx = {};

const fakeCreatedAt = new Date('2026-01-01T00:00:00Z');
const pendingRecord = {
  id: 'req-1', userId: 'u1', oldEmail: 'old@e.com', newEmail: 'new@e.com',
  createdAt: fakeCreatedAt, expiresAt: future, status: 'PENDING',
  appliedAt: null, revertibleUntil: null, verifiedAt: null,
};
const appliedRecord = {
  ...pendingRecord,
  status: 'APPLIED',
  appliedAt: new Date(),
  revertibleUntil: new Date(Date.now() + 48 * 3_600_000),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFindUnique.mockResolvedValue({ email: 'old@e.com', passwordHash: HASH });
  mockFindFirst.mockResolvedValue(null);
  mockEmailFindFirst.mockResolvedValue(null);
  mockCancelPending.mockResolvedValue(undefined);
  mockCreate.mockResolvedValue('raw-token-64hex');
  mockEmailUpdateMany.mockResolvedValue({ count: 0 });
  mockWithAudit.mockImplementation(async (mutation: (tx: unknown) => Promise<unknown>) => mutation(fakeTx));
  mockApplyById.mockResolvedValue(true);
  mockRevertById.mockResolvedValue(true);
  mockFindByRawToken.mockResolvedValue(pendingRecord);
  mockSend.mockResolvedValue({});
});

describe('US-AUT-07 (application-service level)', () => {
  it('AC-1: requestEmailChange requires correct current password', async () => {
    await expect(
      requestEmailChange({ userId: 'u1', currentPassword: 'WrongPass!', newEmail: 'new@e.com' })
    ).rejects.toThrow('current_password_invalid');
  });

  it('AC-1: requestEmailChange throws user_not_found when account missing', async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(
      requestEmailChange({ userId: 'u1', currentPassword: PASSWORD, newEmail: 'new@e.com' })
    ).rejects.toThrow('user_not_found');
  });

  it('AC-2: requestEmailChange creates token via withAudit and defers email via after()', async () => {
    await requestEmailChange({ userId: 'u1', currentPassword: PASSWORD, newEmail: 'new@e.com' });
    expect(mockWithAudit).toHaveBeenCalled();
    expect(mockAfter).toHaveBeenCalledTimes(1);
  });

  it('AC-3: conflict check throws same error regardless of who owns the new email', async () => {
    mockFindFirst.mockResolvedValue({ id: 'other-user' });
    await expect(
      requestEmailChange({ userId: 'u1', currentPassword: PASSWORD, newEmail: 'taken@e.com' })
    ).rejects.toThrow('email_already_in_use');
  });

  it('AC-2+AC-7: verifyEmailChange applies the change and throws on token reuse', async () => {
    await verifyEmailChange({ rawToken: 'valid-token' });
    expect(mockApplyById).toHaveBeenCalled();

    // Simulate reuse — record now APPLIED
    mockFindByRawToken.mockResolvedValue({ ...pendingRecord, status: 'APPLIED' });
    await expect(verifyEmailChange({ rawToken: 'valid-token' })).rejects.toThrow('token_already_used');
  });

  it('AC-4+AC-6: revertEmailChange restores old email within 48h window', async () => {
    mockFindByRawToken.mockResolvedValue(appliedRecord);
    await revertEmailChange({ rawToken: 'revert-token' });
    expect(mockRevertById).toHaveBeenCalledWith(
      expect.anything(), 'req-1', 'u1', 'old@e.com', fakeCreatedAt
    );
  });

  it('AC-6: revertEmailChange throws token_expired after 48h window', async () => {
    mockFindByRawToken.mockResolvedValue({
      ...appliedRecord,
      revertibleUntil: new Date(Date.now() - 1),
    });
    await expect(revertEmailChange({ rawToken: 'expired-revert-token' })).rejects.toThrow('token_expired');
  });

  it.todo('AC-5: full audit chain — EMAIL_CHANGE_REQUESTED, EMAIL_CHANGE_VERIFIED, EMAIL_CHANGE_REVERTED events recorded (requires DB)');
});
