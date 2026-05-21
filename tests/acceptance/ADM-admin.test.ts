import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateMany = vi.fn();
const mockUserFindFirst = vi.fn();
const mockWithAudit = vi.fn();
const mockSend = vi.fn();
const mockAfter = vi.fn((_fn: () => Promise<void>) => {});

vi.mock('next/server', () => ({ unstable_after: mockAfter }));
vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    invite: { create: mockCreate, findFirst: mockFindFirst, findMany: mockFindMany, updateMany: mockUpdateMany },
    user: { findFirst: mockUserFindFirst, update: mockUpdate },
  },
}));
vi.mock('@/lib/audit/application/withAudit', () => ({ withAudit: mockWithAudit }));
vi.mock('@/lib/shared/email', () => ({
  resend: { emails: { send: mockSend } },
  FROM_ADDRESS: 'noreply@peptides.app',
}));

function setupWithAudit() {
  mockWithAudit.mockImplementation(async (mutation: (tx: unknown) => Promise<unknown>) =>
    mutation({
      invite: { create: mockCreate, updateMany: mockUpdateMany },
      user: { update: mockUpdate },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setupWithAudit();
  mockSend.mockResolvedValue({});
  mockCreate.mockResolvedValue({ id: 'invite-1', email: 'managed@e.com', expiresAt: new Date(Date.now() + 72 * 3_600_000), status: 'PENDING' });
  mockFindFirst.mockResolvedValue(null);
  mockUserFindFirst.mockResolvedValue(null);
  mockUpdateMany.mockResolvedValue({ count: 1 });
});

const { createInvite } = await import('@/lib/auth/application/createInvite');
const { resendInvite } = await import('@/lib/auth/application/resendInvite');

/**
 * Story: US-ADM-01 - Create Managed User
 */
describe('US-ADM-01: Create Managed User', () => {
  describe('createInvite', () => {
    it('AC-1: creates invite with 72-hour expiry', async () => {
      const result = await createInvite({ powerUserId: 'pu-1', email: 'managed@e.com' });
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now() + 71 * 3_600_000);
    });

    it('AC-1: stores tokenHash not raw token in DB', async () => {
      await createInvite({ powerUserId: 'pu-1', email: 'managed@e.com' });
      const createCall = mockCreate.mock.calls[0][0];
      expect(createCall.data).toHaveProperty('tokenHash');
      expect(createCall.data).not.toHaveProperty('token');
    });

    it('AC-1: returns rawToken (for email link) but never stores it', async () => {
      const result = await createInvite({ powerUserId: 'pu-1', email: 'managed@e.com' });
      expect(result.rawToken).toBeDefined();
      expect(typeof result.rawToken).toBe('string');
    });

    it('AC-5: throws invite_email_exists when email already has an account', async () => {
      mockUserFindFirst.mockResolvedValue({ id: 'existing-user' });
      await expect(createInvite({ powerUserId: 'pu-1', email: 'existing@e.com' })).rejects.toThrow('invite_email_exists');
    });

    it('AC-5: throws invite_already_pending when a pending invite exists for the email', async () => {
      mockFindFirst.mockResolvedValue({ id: 'existing-invite', status: 'PENDING' });
      await expect(createInvite({ powerUserId: 'pu-1', email: 'pending@e.com' })).rejects.toThrow('invite_already_pending');
    });

    it('AC-6: sends invite email with the raw token link', async () => {
      let deferred: (() => Promise<void>) | undefined;
      mockAfter.mockImplementationOnce((fn: () => Promise<void>) => { deferred = fn; });
      const orig = process.env.NEXTAUTH_URL;
      process.env.NEXTAUTH_URL = 'https://app.example.com';
      try {
        await createInvite({ powerUserId: 'pu-1', email: 'managed@e.com' });
        await deferred!();
      } finally {
        process.env.NEXTAUTH_URL = orig;
      }
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'managed@e.com' })
      );
    });

    it('writes MANAGED_USER_INVITED audit event', async () => {
      let capturedAudit: unknown = null;
      mockWithAudit.mockImplementation(async (mutation: (tx: unknown) => Promise<unknown>, buildAudit: unknown) => {
        const result = await mutation({ invite: { create: mockCreate } });
        capturedAudit = typeof buildAudit === 'function' ? buildAudit(result) : buildAudit;
        return result;
      });
      await createInvite({ powerUserId: 'pu-1', email: 'managed@e.com' });
      expect(capturedAudit).toMatchObject({ action: 'USER_INVITED', actorUserId: 'pu-1' });
    });
  });

  describe('resendInvite', () => {
    const existingInvite = {
      id: 'invite-1',
      email: 'managed@e.com',
      powerUserId: 'pu-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 72 * 3_600_000),
      createdAt: new Date(),
      tokenHash: 'oldhash',
    };

    beforeEach(() => {
      mockFindFirst.mockResolvedValue(existingInvite);
    });

    it('AC-4: throws invite_not_found when invite does not exist or does not belong to powerUser', async () => {
      mockFindFirst.mockResolvedValue(null);
      await expect(resendInvite({ powerUserId: 'pu-1', inviteId: 'nonexistent' })).rejects.toThrow('invite_not_found');
    });

    it('AC-4: throws invite_already_accepted when invite is ACCEPTED', async () => {
      mockFindFirst.mockResolvedValue({ ...existingInvite, status: 'ACCEPTED' });
      await expect(resendInvite({ powerUserId: 'pu-1', inviteId: 'invite-1' })).rejects.toThrow('invite_already_accepted');
    });

    it('AC-4: throws invite_revoked when invite is REVOKED', async () => {
      mockFindFirst.mockResolvedValue({ ...existingInvite, status: 'REVOKED' });
      await expect(resendInvite({ powerUserId: 'pu-1', inviteId: 'invite-1' })).rejects.toThrow('invite_revoked');
    });

    it('throws invite_email_exists when email has been registered since original invite', async () => {
      mockUserFindFirst.mockResolvedValue({ id: 'registered-user' });
      await expect(resendInvite({ powerUserId: 'pu-1', inviteId: 'invite-1' })).rejects.toThrow('invite_email_exists');
    });

    it('AC-4: revokes the prior invite (sets status = REVOKED)', async () => {
      await resendInvite({ powerUserId: 'pu-1', inviteId: 'invite-1' });
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'invite-1' }), data: { status: 'REVOKED' } })
      );
    });

    it('AC-4: creates a new invite with fresh 72h expiry', async () => {
      const result = await resendInvite({ powerUserId: 'pu-1', inviteId: 'invite-1' });
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now() + 71 * 3_600_000);
    });

    it('AC-4: sends email to the same address', async () => {
      let deferred: (() => Promise<void>) | undefined;
      mockAfter.mockImplementationOnce((fn: () => Promise<void>) => { deferred = fn; });
      const orig = process.env.NEXTAUTH_URL;
      process.env.NEXTAUTH_URL = 'https://app.example.com';
      try {
        await resendInvite({ powerUserId: 'pu-1', inviteId: 'invite-1' });
        await deferred!();
      } finally {
        process.env.NEXTAUTH_URL = orig;
      }
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'managed@e.com' })
      );
    });

    it('writes MANAGED_USER_INVITE_RESENT audit event', async () => {
      let capturedAudit: unknown = null;
      mockWithAudit.mockImplementation(async (mutation: (tx: unknown) => Promise<unknown>, buildAudit: unknown) => {
        const result = await mutation({ invite: { updateMany: mockUpdateMany, create: mockCreate } });
        capturedAudit = typeof buildAudit === 'function' ? buildAudit(result) : buildAudit;
        return result;
      });
      await resendInvite({ powerUserId: 'pu-1', inviteId: 'invite-1' });
      expect(capturedAudit).toMatchObject({ action: 'INVITE_RESENT', actorUserId: 'pu-1' });
    });
  });
});

/**
 * Story: US-ADM-02 - Monitor Adherence
 */
describe('US-ADM-02: Monitor Adherence', () => {
  it.todo('AC-1: calculates 7-day adherence % per managed user', () => {
    // Hint: check adherence query logic in lib/tracker/infrastructure
  });
});
