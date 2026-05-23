import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateMany = vi.fn();
const mockUserFindFirst = vi.fn();
const mockUserFindMany = vi.fn();
const mockUserDelete = vi.fn();
const mockUserDeleteMany = vi.fn();
const mockDoseLogFindMany = vi.fn();
const mockProtocolFindMany = vi.fn();
const mockOutcomeLogFindMany = vi.fn();
const mockVialFindMany = vi.fn();
const mockADRCreate = vi.fn();
const mockADRFindFirst = vi.fn();
const mockADRFindMany = vi.fn();
const mockADRDelete = vi.fn();
const mockADRDeleteMany = vi.fn();
const mockCycleFindMany = vi.fn();
const mockVendorFindMany = vi.fn();
const mockReminderFindMany = vi.fn();
const mockPushSubFindMany = vi.fn();
const mockTelegramFindMany = vi.fn();
const mockEmailChangeFindMany = vi.fn();
const mockDataExportFindMany = vi.fn();
const mockAuditEventFindMany = vi.fn();
const mockWithAudit = vi.fn();
const mockSend = vi.fn();
const mockAfter = vi.fn((_fn: () => Promise<void>) => {});
const mockAuditEventCreate = vi.fn();
const mockPasswordResetCreate = vi.fn();

vi.mock('@/lib/auth/infrastructure/PasswordResetRepo', () => ({
  PasswordResetRepo: { create: mockPasswordResetCreate },
}));
vi.mock('next/server', () => ({ unstable_after: mockAfter }));
vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    invite: { create: mockCreate, findFirst: mockFindFirst, findMany: mockFindMany, updateMany: mockUpdateMany },
    user: { findFirst: mockUserFindFirst, findMany: mockUserFindMany, update: mockUpdate, delete: mockUserDelete, deleteMany: mockUserDeleteMany },
    doseLog: { findMany: mockDoseLogFindMany },
    protocol: { findMany: mockProtocolFindMany },
    outcomeLog: { findMany: mockOutcomeLogFindMany },
    vial: { findMany: mockVialFindMany },
    accountDeletionRequest: { create: mockADRCreate, findFirst: mockADRFindFirst, findMany: mockADRFindMany, delete: mockADRDelete, deleteMany: mockADRDeleteMany },
    auditEvent: { create: mockAuditEventCreate, findMany: mockAuditEventFindMany },
    cycle: { findMany: mockCycleFindMany },
    vendor: { findMany: mockVendorFindMany },
    reminderPreference: { findMany: mockReminderFindMany },
    pushSubscription: { findMany: mockPushSubFindMany },
    telegramSession: { findMany: mockTelegramFindMany },
    emailChangeRequest: { findMany: mockEmailChangeFindMany },
    dataExportRequest: { findMany: mockDataExportFindMany },
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
      user: { update: mockUpdate, updateMany: mockUpdateMany, delete: mockUserDelete, deleteMany: mockUserDeleteMany },
      accountDeletionRequest: { create: mockADRCreate, delete: mockADRDelete, deleteMany: mockADRDeleteMany },
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
  mockUserFindMany.mockResolvedValue([]);
  mockDoseLogFindMany.mockResolvedValue([]);
  mockProtocolFindMany.mockResolvedValue([]);
  mockAuditEventCreate.mockResolvedValue({});
  mockPasswordResetCreate.mockResolvedValue('raw-token-test');
  mockUpdateMany.mockResolvedValue({ count: 1 });
  mockUserDelete.mockResolvedValue({});
  mockUserDeleteMany.mockResolvedValue({ count: 1 });
  mockADRCreate.mockResolvedValue({});
  mockADRFindFirst.mockResolvedValue(null);
  mockADRFindMany.mockResolvedValue([]);
  mockADRDelete.mockResolvedValue({});
  mockADRDeleteMany.mockResolvedValue({ count: 1 });
  mockOutcomeLogFindMany.mockResolvedValue([]);
  mockVialFindMany.mockResolvedValue([]);
  mockCycleFindMany.mockResolvedValue([]);
  mockVendorFindMany.mockResolvedValue([]);
  mockReminderFindMany.mockResolvedValue([]);
  mockPushSubFindMany.mockResolvedValue([]);
  mockTelegramFindMany.mockResolvedValue([]);
  mockEmailChangeFindMany.mockResolvedValue([]);
  mockDataExportFindMany.mockResolvedValue([]);
  mockAuditEventFindMany.mockResolvedValue([]);
});

const { createInvite } = await import('@/lib/auth/application/createInvite');
const { resendInvite } = await import('@/lib/auth/application/resendInvite');
const {
  getManagedUsersWithAdherence,
  getManagedUserDoseHistory,
  deactivateManagedUser,
  triggerManagedUserPasswordReset,
  requestManagedUserDeletion,
  cancelManagedUserDeletion,
  processPendingDeletions,
} = await import('@/lib/admin/application/AdminService');

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
  it('AC-1: returns active managed users with 7-day and 30-day adherence %', async () => {
    mockUserFindMany.mockResolvedValueOnce([
      { id: 'mu-1', email: 'user@e.com', name: 'Test User', status: 'ACTIVE' },
    ]);
    mockFindMany.mockResolvedValueOnce([]); // no pending invites
    // bulk 7-day query (includes userId for group-by)
    mockDoseLogFindMany.mockResolvedValueOnce([
      { userId: 'mu-1', status: 'LOGGED' },
      { userId: 'mu-1', status: 'LOGGED' },
      { userId: 'mu-1', status: 'SKIPPED' },
    ]);
    // bulk 30-day query
    mockDoseLogFindMany.mockResolvedValueOnce([
      { userId: 'mu-1', status: 'LOGGED' },
      { userId: 'mu-1', status: 'PENDING' },
    ]);

    const result = await getManagedUsersWithAdherence('pu-1');
    expect(result.activeUsers).toHaveLength(1);
    const user = result.activeUsers[0];
    expect(user.id).toBe('mu-1');
    expect(user.inviteStatus).toBe('ACTIVE');
    expect(user.adherence7Day).toEqual({ logged: 2, total: 3, percent: expect.closeTo(66.67, 1) });
    expect(user.adherence30Day).toEqual({ logged: 1, total: 2, percent: 50 });
  });

  it('AC-3 (invite states): includes pending invites as INVITED rows', async () => {
    mockUserFindMany.mockResolvedValueOnce([]);
    mockFindMany.mockResolvedValueOnce([
      { id: 'inv-1', email: 'pending@e.com', expiresAt: new Date(Date.now() + 24 * 3_600_000) },
    ]);

    const result = await getManagedUsersWithAdherence('pu-1');
    expect(result.activeUsers).toHaveLength(0);
    expect(result.pendingInvites).toHaveLength(1);
    expect(result.pendingInvites[0].inviteStatus).toBe('INVITED');
    expect(result.pendingInvites[0].email).toBe('pending@e.com');
  });

  it('AC-3 (invite states): marks expired invites as INVITE_EXPIRED', async () => {
    mockUserFindMany.mockResolvedValueOnce([]);
    mockFindMany.mockResolvedValueOnce([
      { id: 'inv-2', email: 'expired@e.com', expiresAt: new Date(Date.now() - 1_000) },
    ]);

    const result = await getManagedUsersWithAdherence('pu-1');
    expect(result.pendingInvites[0].inviteStatus).toBe('INVITE_EXPIRED');
  });

  it('AC-3 (invite states): marks deactivated managed users as DEACTIVATED', async () => {
    mockUserFindMany.mockResolvedValueOnce([
      { id: 'mu-2', email: 'inactive@e.com', name: null, status: 'DEACTIVATED' },
    ]);
    mockFindMany.mockResolvedValueOnce([]);
    mockDoseLogFindMany.mockResolvedValue([]);

    const result = await getManagedUsersWithAdherence('pu-1');
    expect(result.activeUsers[0].inviteStatus).toBe('DEACTIVATED');
  });
});

/**
 * Story: US-ADM-02 - Dose History View
 */
describe('US-ADM-02: getManagedUserDoseHistory', () => {
  const mockDoseLog = {
    id: 'dl-1',
    scheduledDate: new Date('2026-05-20T00:00:00Z'),
    loggedAt: new Date('2026-05-20T08:00:00Z'),
    status: 'LOGGED',
    amount: { value: 2, unit: 'mg' },
    protocol: { compound: { name: 'BPC-157' } },
  };

  it('throws managed_user_not_found when userId does not belong to powerUser', async () => {
    mockUserFindFirst.mockResolvedValueOnce(null);
    await expect(getManagedUserDoseHistory('pu-1', 'other-user', 30)).rejects.toThrow('managed_user_not_found');
  });

  it('returns dose history entries for a managed user', async () => {
    mockUserFindFirst.mockResolvedValueOnce({ id: 'mu-1' });
    mockDoseLogFindMany.mockResolvedValueOnce([mockDoseLog]);

    const result = await getManagedUserDoseHistory('pu-1', 'mu-1', 30);
    expect(result).toHaveLength(1);
    expect(result[0].compoundName).toBe('BPC-157');
    expect(result[0].status).toBe('LOGGED');
    expect(result[0].scheduledDate).toEqual(mockDoseLog.scheduledDate);
  });

  it('queries only completed (LOGGED/SKIPPED) logs within the requested day window', async () => {
    mockUserFindFirst.mockResolvedValueOnce({ id: 'mu-1' });
    mockDoseLogFindMany.mockResolvedValueOnce([]);

    await getManagedUserDoseHistory('pu-1', 'mu-1', 7);

    const call = mockDoseLogFindMany.mock.calls[0][0];
    expect(call.where.scheduledDate.gte).toBeDefined();
    expect(call.where.scheduledDate.lt).toBeDefined();
    const windowDays = (call.where.scheduledDate.lt.getTime() - call.where.scheduledDate.gte.getTime()) / 86400_000;
    expect(windowDays).toBe(7);
    expect(call.where.status).toEqual({ in: ['LOGGED', 'SKIPPED'] });
  });
});

/**
 * Story: US-ADM-03 - Manage Managed Users
 */
describe('US-ADM-03: deactivateManagedUser', () => {

  const activeUser = { id: 'mu-1', email: 'user@e.com', status: 'ACTIVE' };

  it('AC-1: throws managed_user_not_found when user does not belong to powerUser', async () => {
    mockUserFindFirst.mockResolvedValueOnce(null);
    await expect(deactivateManagedUser('pu-1', 'stranger', true)).rejects.toThrow('managed_user_not_found');
  });

  it('AC-1: throws user_pending_deletion when user is DELETION_PENDING (cannot revert to DEACTIVATED)', async () => {
    mockUserFindFirst.mockResolvedValueOnce({ id: 'mu-1', status: 'DELETION_PENDING' });
    await expect(deactivateManagedUser('pu-1', 'mu-1', true)).rejects.toThrow('user_pending_deletion');
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('AC-3: returns needs_confirmation when user has active protocols and confirmed=false', async () => {
    mockUserFindFirst.mockResolvedValueOnce(activeUser);
    mockProtocolFindMany.mockResolvedValueOnce([{ id: 'p-1' }, { id: 'p-2' }]);

    const result = await deactivateManagedUser('pu-1', 'mu-1', false);
    expect(result.status).toBe('needs_confirmation');
    expect(result.activeProtocolCount).toBe(2);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('AC-1: deactivates user (sets status=DEACTIVATED) when confirmed=true', async () => {
    mockUserFindFirst.mockResolvedValueOnce(activeUser);
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });

    const result = await deactivateManagedUser('pu-1', 'mu-1', true);
    expect(result.status).toBe('deactivated');
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'mu-1', managedBy: 'pu-1' }),
        data: { status: 'DEACTIVATED', passwordVersion: { increment: 1 } },
      })
    );
  });

  it('AC-1: deactivates user with no active protocols without confirmation prompt', async () => {
    mockUserFindFirst.mockResolvedValueOnce(activeUser);
    mockProtocolFindMany.mockResolvedValueOnce([]);
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });

    const result = await deactivateManagedUser('pu-1', 'mu-1', false);
    expect(result.status).toBe('deactivated');
  });

  it('writes USER_DEACTIVATED audit event on deactivation', async () => {
    let capturedAudit: unknown = null;
    mockWithAudit.mockImplementationOnce(async (mutation: (tx: unknown) => Promise<unknown>, buildAudit: unknown) => {
      const result = await mutation({ user: { update: mockUpdate, updateMany: mockUpdateMany } });
      capturedAudit = typeof buildAudit === 'function' ? buildAudit(result) : buildAudit;
      return result;
    });
    mockUserFindFirst.mockResolvedValueOnce(activeUser);
    mockProtocolFindMany.mockResolvedValueOnce([]);
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });

    await deactivateManagedUser('pu-1', 'mu-1', false);
    expect(capturedAudit).toMatchObject({ action: 'MANAGED_USER_DEACTIVATED', actorUserId: 'pu-1' });
  });
});

describe('US-ADM-03: triggerManagedUserPasswordReset', () => {

  it('AC-2: throws managed_user_not_found when user does not belong to powerUser', async () => {
    mockUserFindFirst.mockResolvedValueOnce(null);
    await expect(triggerManagedUserPasswordReset('pu-1', 'stranger')).rejects.toThrow('managed_user_not_found');
  });

  it('AC-2: creates reset token and dispatches email for the managed user', async () => {
    let deferred: (() => Promise<void>) | undefined;
    mockAfter.mockImplementationOnce((fn: () => Promise<void>) => { deferred = fn; });
    mockUserFindFirst.mockResolvedValueOnce({ id: 'mu-1', email: 'user@e.com' });
    const orig = process.env.NEXTAUTH_URL;
    process.env.NEXTAUTH_URL = 'https://app.example.com';
    try {
      await triggerManagedUserPasswordReset('pu-1', 'mu-1');
      await deferred!();
    } finally {
      process.env.NEXTAUTH_URL = orig;
    }
    expect(mockPasswordResetCreate).toHaveBeenCalledWith(expect.anything(), 'mu-1');
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: 'user@e.com' }));
  });

  it('AC-2: writes MANAGED_USER_PASSWORD_RESET_TRIGGERED audit event with powerUser as actor', async () => {
    let capturedAudit: unknown = null;
    mockWithAudit.mockImplementationOnce(async (mutation: (tx: unknown) => Promise<unknown>, buildAudit: unknown) => {
      const result = await mutation({});
      capturedAudit = typeof buildAudit === 'function' ? buildAudit(result) : buildAudit;
      return result;
    });
    mockUserFindFirst.mockResolvedValueOnce({ id: 'mu-1', email: 'user@e.com' });
    await triggerManagedUserPasswordReset('pu-1', 'mu-1');
    expect(capturedAudit).toMatchObject({ action: 'MANAGED_USER_PASSWORD_RESET_TRIGGERED', actorUserId: 'pu-1' });
  });
});

/**
 * Story: US-ADM-04 - Managed User Deletion with Export-First
 */
describe('US-ADM-04: requestManagedUserDeletion', () => {
  const activeUser = { id: 'mu-1', email: 'user@e.com', status: 'ACTIVE' };
  const deactivatedUser = { id: 'mu-1', email: 'user@e.com', status: 'DEACTIVATED' };
  const powerUser = { id: 'pu-1', email: 'admin@e.com' };

  it('AC-1: throws managed_user_not_found when user does not belong to powerUser', async () => {
    mockUserFindFirst.mockResolvedValueOnce(null);
    await expect(requestManagedUserDeletion('pu-1', 'stranger', 'user@e.com')).rejects.toThrow('managed_user_not_found');
  });

  it('AC-1: throws user_must_be_deactivated when user is not DEACTIVATED', async () => {
    mockUserFindFirst.mockResolvedValueOnce(activeUser).mockResolvedValueOnce(powerUser);
    await expect(requestManagedUserDeletion('pu-1', 'mu-1', 'user@e.com')).rejects.toThrow('user_must_be_deactivated');
  });

  it('AC-1: throws email_confirmation_mismatch when typed email does not match', async () => {
    mockUserFindFirst.mockResolvedValueOnce(deactivatedUser).mockResolvedValueOnce(powerUser);
    await expect(requestManagedUserDeletion('pu-1', 'mu-1', 'wrong@e.com')).rejects.toThrow('email_confirmation_mismatch');
    expect(mockADRCreate).not.toHaveBeenCalled();
  });

  it('AC-1: sends export email synchronously before scheduling DB write', async () => {
    mockUserFindFirst.mockResolvedValueOnce(deactivatedUser).mockResolvedValueOnce(powerUser);
    mockProtocolFindMany.mockResolvedValueOnce([]);
    mockDoseLogFindMany.mockResolvedValueOnce([]);
    mockVialFindMany.mockResolvedValueOnce([]);
    mockOutcomeLogFindMany.mockResolvedValueOnce([]);

    await requestManagedUserDeletion('pu-1', 'mu-1', 'user@e.com');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin@e.com', subject: expect.stringContaining('user@e.com') })
    );
  });

  it('AC-1: throws export_email_failed and aborts when Resend returns error', async () => {
    mockSend.mockResolvedValueOnce({ error: { message: 'resend-down' } });
    mockUserFindFirst.mockResolvedValueOnce(deactivatedUser).mockResolvedValueOnce(powerUser);
    mockProtocolFindMany.mockResolvedValueOnce([]);
    mockDoseLogFindMany.mockResolvedValueOnce([]);
    mockVialFindMany.mockResolvedValueOnce([]);
    mockOutcomeLogFindMany.mockResolvedValueOnce([]);

    await expect(requestManagedUserDeletion('pu-1', 'mu-1', 'user@e.com')).rejects.toThrow('export_email_failed');
    expect(mockADRCreate).not.toHaveBeenCalled();
  });

  it('AC-2: schedules deletion 48h in future and returns scheduled status', async () => {
    mockUserFindFirst.mockResolvedValueOnce(deactivatedUser).mockResolvedValueOnce(powerUser);
    mockProtocolFindMany.mockResolvedValueOnce([]);
    mockDoseLogFindMany.mockResolvedValueOnce([]);
    mockVialFindMany.mockResolvedValueOnce([]);
    mockOutcomeLogFindMany.mockResolvedValueOnce([]);

    const before = Date.now();
    const result = await requestManagedUserDeletion('pu-1', 'mu-1', 'user@e.com');
    expect(result.status).toBe('scheduled');
    expect(result.scheduledFor.getTime()).toBeGreaterThan(before + 47 * 3_600_000);
    expect(mockADRCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'mu-1', status: 'PENDING' }) })
    );
  });

  it('AC-3: writes MANAGED_USER_DELETION_REQUESTED audit event', async () => {
    let capturedAudit: unknown = null;
    mockWithAudit.mockImplementationOnce(async (mutation: (tx: unknown) => Promise<unknown>, buildAudit: unknown) => {
      const result = await mutation({ accountDeletionRequest: { create: mockADRCreate }, user: { updateMany: mockUpdateMany } });
      capturedAudit = typeof buildAudit === 'function' ? buildAudit(result) : buildAudit;
      return result;
    });
    mockUserFindFirst.mockResolvedValueOnce(deactivatedUser).mockResolvedValueOnce(powerUser);
    mockProtocolFindMany.mockResolvedValueOnce([]);
    mockDoseLogFindMany.mockResolvedValueOnce([]);
    mockVialFindMany.mockResolvedValueOnce([]);
    mockOutcomeLogFindMany.mockResolvedValueOnce([]);

    await requestManagedUserDeletion('pu-1', 'mu-1', 'user@e.com');
    expect(capturedAudit).toMatchObject({ action: 'MANAGED_USER_DELETION_REQUESTED', actorUserId: 'pu-1', subjectUserId: 'mu-1' });
  });
});

describe('US-ADM-04: cancelManagedUserDeletion', () => {
  it('throws managed_user_not_found when user does not belong to powerUser', async () => {
    mockUserFindFirst.mockResolvedValueOnce(null);
    await expect(cancelManagedUserDeletion('pu-1', 'stranger')).rejects.toThrow('managed_user_not_found');
  });

  it('throws no_pending_deletion when no PENDING request exists', async () => {
    mockUserFindFirst.mockResolvedValueOnce({ id: 'mu-1' });
    mockADRFindFirst.mockResolvedValueOnce(null);
    await expect(cancelManagedUserDeletion('pu-1', 'mu-1')).rejects.toThrow('no_pending_deletion');
  });

  it('cancels deletion and restores user status to DEACTIVATED', async () => {
    mockUserFindFirst.mockResolvedValueOnce({ id: 'mu-1' });
    mockADRFindFirst.mockResolvedValueOnce({ id: 'adr-1' });

    await cancelManagedUserDeletion('pu-1', 'mu-1');
    expect(mockADRDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'adr-1', userId: 'mu-1', status: 'PENDING' } })
    );
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mu-1', managedBy: 'pu-1', status: 'DELETION_PENDING' }, data: { status: 'DEACTIVATED' } })
    );
  });

  it('writes MANAGED_USER_DELETION_CANCELLED audit event', async () => {
    let capturedAudit: unknown = null;
    mockWithAudit.mockImplementationOnce(async (mutation: (tx: unknown) => Promise<unknown>, buildAudit: unknown) => {
      const result = await mutation({ accountDeletionRequest: { deleteMany: mockADRDeleteMany }, user: { updateMany: mockUpdateMany } });
      capturedAudit = typeof buildAudit === 'function' ? buildAudit(result) : buildAudit;
      return result;
    });
    mockUserFindFirst.mockResolvedValueOnce({ id: 'mu-1' });
    mockADRFindFirst.mockResolvedValueOnce({ id: 'adr-1' });

    await cancelManagedUserDeletion('pu-1', 'mu-1');
    expect(capturedAudit).toMatchObject({ action: 'MANAGED_USER_DELETION_CANCELLED', actorUserId: 'pu-1', subjectUserId: 'mu-1' });
  });
});

describe('US-ADM-04: processPendingDeletions', () => {
  it('returns 0 deleted when no pending deletions are due', async () => {
    mockADRFindMany.mockResolvedValueOnce([]);
    const result = await processPendingDeletions();
    expect(result.deleted).toBe(0);
    expect(mockUserDeleteMany).not.toHaveBeenCalled();
  });

  it('deletes users whose scheduled deletion time has passed', async () => {
    mockADRFindMany.mockResolvedValueOnce([{ id: 'adr-1', userId: 'mu-1' }]);
    mockUserFindFirst.mockResolvedValueOnce({ id: 'mu-1', managedBy: 'pu-1' });

    const result = await processPendingDeletions();
    expect(result.deleted).toBe(1);
    expect(mockUserDeleteMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'mu-1', status: 'DELETION_PENDING' } }));
  });

  it('cleans up orphaned ADR when user no longer exists', async () => {
    mockADRFindMany.mockResolvedValueOnce([{ id: 'adr-orphan', userId: 'mu-orphan' }]);
    mockUserFindFirst.mockResolvedValueOnce(null);

    const result = await processPendingDeletions();
    expect(result.deleted).toBe(0);
    expect(mockADRDelete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'adr-orphan' } }));
  });

  it('writes MANAGED_USER_DELETED audit event for each processed deletion', async () => {
    let capturedAudit: unknown = null;
    mockWithAudit.mockImplementationOnce(async (mutation: (tx: unknown) => Promise<unknown>, buildAudit: unknown) => {
      const result = await mutation({ user: { deleteMany: mockUserDeleteMany }, accountDeletionRequest: { deleteMany: mockADRDeleteMany } });
      capturedAudit = typeof buildAudit === 'function' ? buildAudit(result) : buildAudit;
      return result;
    });
    mockADRFindMany.mockResolvedValueOnce([{ id: 'adr-1', userId: 'mu-1' }]);
    mockUserFindFirst.mockResolvedValueOnce({ id: 'mu-1', managedBy: 'pu-1' });

    await processPendingDeletions();
    expect(capturedAudit).toMatchObject({ action: 'MANAGED_USER_DELETED', actorUserId: 'SYSTEM', subjectUserId: 'mu-1' });
  });
});
