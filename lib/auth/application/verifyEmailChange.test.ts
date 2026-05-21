import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindByRawToken = vi.fn();
const mockApplyById = vi.fn();
const mockWithAudit = vi.fn();
const mockAfter = vi.fn((_fn: () => Promise<void>) => {});
const mockSend = vi.fn();

vi.mock('next/server', () => ({ unstable_after: mockAfter }));
vi.mock('@/lib/auth/infrastructure/EmailChangeRepo', () => ({
  EmailChangeRepo: { findByRawToken: mockFindByRawToken, applyById: mockApplyById },
}));
vi.mock('@/lib/audit/application/withAudit', () => ({ withAudit: mockWithAudit }));
vi.mock('@/lib/shared/email', () => ({
  resend: { emails: { send: mockSend } },
  FROM_ADDRESS: 'noreply@peptides.app',
}));

const { verifyEmailChange } = await import('./verifyEmailChange');

const future = new Date(Date.now() + 3_600_000);
const validRecord = {
  id: 'req-1',
  userId: 'user-1',
  oldEmail: 'old@e.com',
  newEmail: 'new@e.com',
  expiresAt: future,
  status: 'PENDING',
  appliedAt: null,
  revertibleUntil: null,
  verifiedAt: null,
};

function setupWithAudit() {
  mockWithAudit.mockImplementation(async (mutation: (tx: unknown) => Promise<unknown>) =>
    mutation({})
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindByRawToken.mockResolvedValue(validRecord);
  mockApplyById.mockResolvedValue(true);
  setupWithAudit();
});

describe('verifyEmailChange', () => {
  it('throws token_not_found when findByRawToken returns null', async () => {
    mockFindByRawToken.mockResolvedValue(null);
    await expect(
      verifyEmailChange({ rawToken: 'no-such-token' })
    ).rejects.toThrow('token_not_found');
  });

  it('throws token_expired when record is past expiresAt', async () => {
    mockFindByRawToken.mockResolvedValue({
      ...validRecord,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(
      verifyEmailChange({ rawToken: 'expired-token' })
    ).rejects.toThrow('token_expired');
  });

  it('throws token_already_used when status is APPLIED', async () => {
    mockFindByRawToken.mockResolvedValue({ ...validRecord, status: 'APPLIED' });
    await expect(
      verifyEmailChange({ rawToken: 'used-token' })
    ).rejects.toThrow('token_already_used');
  });

  it('throws token_already_used when applyById returns false (concurrent consumption)', async () => {
    mockApplyById.mockResolvedValue(false);
    await expect(
      verifyEmailChange({ rawToken: 'valid-token' })
    ).rejects.toThrow('token_already_used');
  });

  it('calls applyById with id + userId + newEmail inside transaction', async () => {
    const fakeTx = {};
    mockWithAudit.mockImplementation(async (mutation: (tx: unknown) => Promise<unknown>) =>
      mutation(fakeTx)
    );
    await verifyEmailChange({ rawToken: 'valid-token' });
    expect(mockApplyById).toHaveBeenCalledWith(fakeTx, 'req-1', 'user-1', 'new@e.com');
  });

  it('calls after() for old-address notification', async () => {
    await verifyEmailChange({ rawToken: 'valid-token' });
    expect(mockAfter).toHaveBeenCalledTimes(1);
  });

  it('sends notification to oldEmail inside the after() callback', async () => {
    mockSend.mockResolvedValue({});
    let deferredTask: (() => Promise<void>) | undefined;
    mockAfter.mockImplementationOnce((fn: () => Promise<void>) => { deferredTask = fn; });

    const originalUrl = process.env.NEXTAUTH_URL;
    process.env.NEXTAUTH_URL = 'https://app.example.com';
    try {
      await verifyEmailChange({ rawToken: 'valid-token' });
      await deferredTask!();
    } finally {
      process.env.NEXTAUTH_URL = originalUrl;
    }
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'old@e.com' })
    );
  });
});
