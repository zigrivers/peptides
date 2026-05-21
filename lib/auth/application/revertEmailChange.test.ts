import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindByRawToken = vi.fn();
const mockRevertById = vi.fn();
const mockWithAudit = vi.fn();

vi.mock('@/lib/auth/infrastructure/EmailChangeRepo', () => ({
  EmailChangeRepo: { findByRawToken: mockFindByRawToken, revertById: mockRevertById },
}));
vi.mock('@/lib/audit/application/withAudit', () => ({ withAudit: mockWithAudit }));

const { revertEmailChange } = await import('./revertEmailChange');

const future48h = new Date(Date.now() + 48 * 3_600_000);
const validRecord = {
  id: 'req-1',
  userId: 'user-1',
  oldEmail: 'old@e.com',
  newEmail: 'new@e.com',
  expiresAt: new Date(Date.now() + 3_600_000),
  status: 'APPLIED',
  appliedAt: new Date(),
  revertibleUntil: future48h,
  verifiedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFindByRawToken.mockResolvedValue(validRecord);
  mockRevertById.mockResolvedValue(true);
  mockWithAudit.mockImplementation(async (mutation: (tx: unknown) => Promise<unknown>) =>
    mutation({})
  );
});

describe('revertEmailChange', () => {
  it('throws token_not_found when findByRawToken returns null', async () => {
    mockFindByRawToken.mockResolvedValue(null);
    await expect(revertEmailChange({ rawToken: 'bad-token' })).rejects.toThrow('token_not_found');
  });

  it('throws token_not_found when status is PENDING (not applied yet)', async () => {
    mockFindByRawToken.mockResolvedValue({ ...validRecord, status: 'PENDING' });
    await expect(revertEmailChange({ rawToken: 'pending-token' })).rejects.toThrow('token_not_found');
  });

  it('throws token_already_used when status is REVERTED', async () => {
    mockFindByRawToken.mockResolvedValue({ ...validRecord, status: 'REVERTED' });
    await expect(revertEmailChange({ rawToken: 'reverted-token' })).rejects.toThrow('token_already_used');
  });

  it('throws token_expired when revertibleUntil is null', async () => {
    mockFindByRawToken.mockResolvedValue({ ...validRecord, revertibleUntil: null });
    await expect(revertEmailChange({ rawToken: 'past-token' })).rejects.toThrow('token_expired');
  });

  it('throws token_expired when revertibleUntil is in the past', async () => {
    const past = new Date(Date.now() - 1000);
    mockFindByRawToken.mockResolvedValue({ ...validRecord, revertibleUntil: past });
    await expect(revertEmailChange({ rawToken: 'past-token' })).rejects.toThrow('token_expired');
  });

  it('throws token_already_used when revertById returns false (concurrent revert)', async () => {
    mockRevertById.mockResolvedValue(false);
    await expect(revertEmailChange({ rawToken: 'valid-token' })).rejects.toThrow('token_already_used');
  });

  it('calls revertById with id + userId + oldEmail', async () => {
    const fakeTx = {};
    mockWithAudit.mockImplementation(async (mutation: (tx: unknown) => Promise<unknown>) =>
      mutation(fakeTx)
    );
    await revertEmailChange({ rawToken: 'valid-token' });
    expect(mockRevertById).toHaveBeenCalledWith(fakeTx, 'req-1', 'user-1', 'old@e.com');
  });

  it('audit factory returns EMAIL_CHANGE_REVERTED with correct actorUserId', async () => {
    let capturedFactory: ((userId: string) => unknown) | null = null;
    mockWithAudit.mockImplementation(async (mutation: (tx: unknown) => Promise<unknown>, buildAudit: (userId: string) => unknown) => {
      capturedFactory = buildAudit;
      return mutation({});
    });
    await revertEmailChange({ rawToken: 'valid-token' });
    expect(capturedFactory!('user-1')).toMatchObject({
      action: 'EMAIL_CHANGE_REVERTED',
      actorUserId: 'user-1',
    });
  });
});
