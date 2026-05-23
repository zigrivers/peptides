/**
 * Story: US-AUT-02 — Account Deletion (self-serve, 48h-delay + immediate + cancel)
 * Task 6.1
 *
 * Verifies the service-layer behaviour:
 *  - Typed-email confirmation enforced
 *  - Export emailed BEFORE any destructive change (export_email_failed
 *    aborts the schedule with no side-effects)
 *  - Telegram session revoked
 *  - ADR + User.status atomic transition
 *  - Cancel restores User.status to ACTIVE
 *  - Immediate path requires `acknowledged: true`
 *  - ACCOUNT_DELETED audit emitted with `mode: 'immediate_self'`
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUserFindUnique = vi.fn();
const mockAdrFindUnique = vi.fn();
const mockAdrUpsert = vi.fn();
const mockAdrDeleteMany = vi.fn();
const mockUserUpdateMany = vi.fn();
const mockUserDeleteMany = vi.fn();
const mockVendorFindMany = vi.fn();
const mockOrderDeleteMany = vi.fn();
const mockAuditCreate = vi.fn();
const mockGenerateExport = vi.fn();
const mockResendSend = vi.fn();
const mockDeactivateTelegram = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    accountDeletionRequest: { findUnique: mockAdrFindUnique },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        accountDeletionRequest: { upsert: mockAdrUpsert, deleteMany: mockAdrDeleteMany },
        user: { updateMany: mockUserUpdateMany, deleteMany: mockUserDeleteMany },
        vendor: { findMany: mockVendorFindMany },
        order: { deleteMany: mockOrderDeleteMany },
        auditEvent: { create: mockAuditCreate },
      }),
  },
}));

vi.mock('@/lib/shared/userDataExport', () => ({
  generateUserDataExport: mockGenerateExport,
  INLINE_EXPORT_MAX_BYTES: 17 * 1024 * 1024,
}));

vi.mock('@/lib/shared/email', () => ({
  resend: { emails: { send: mockResendSend } },
  FROM_ADDRESS: 'noreply@peptides.app',
}));

vi.mock('@/lib/ordering/infrastructure/TelegramSessionRepo', () => ({
  deactivateSession: mockDeactivateTelegram,
}));

const USER_ID = 'user-1';
const USER_EMAIL = 'user@example.com';

beforeEach(() => {
  vi.resetAllMocks();
  mockUserFindUnique.mockResolvedValue({
    id: USER_ID,
    email: USER_EMAIL,
    name: 'Alice',
    status: 'ACTIVE',
    managedBy: null,
  });
  mockAdrFindUnique.mockResolvedValue(null);
  mockAdrUpsert.mockResolvedValue({ id: 'adr-1' });
  mockAdrDeleteMany.mockResolvedValue({ count: 1 });
  mockUserUpdateMany.mockResolvedValue({ count: 1 });
  mockUserDeleteMany.mockResolvedValue({ count: 1 });
  mockVendorFindMany.mockResolvedValue([]);
  mockOrderDeleteMany.mockResolvedValue({ count: 0 });
  mockGenerateExport.mockResolvedValue('{"data":"export"}');
  mockResendSend.mockResolvedValue({ error: null });
  mockDeactivateTelegram.mockResolvedValue(undefined);
});

const { requestSelfDeletion, cancelSelfDeletion, requestImmediateDeletion } = await import(
  '@/lib/auth/application/scheduleAccountDeletion'
);

describe('US-AUT-02: requestSelfDeletion (delayed)', () => {
  it('AC-1: throws email_mismatch when typed email differs and writes no side effects', async () => {
    await expect(
      requestSelfDeletion({ userId: USER_ID, confirmEmail: 'wrong@example.com' })
    ).rejects.toThrow('email_mismatch');
    expect(mockGenerateExport).not.toHaveBeenCalled();
    expect(mockDeactivateTelegram).not.toHaveBeenCalled();
    expect(mockAdrUpsert).not.toHaveBeenCalled();
  });

  it('AC-1b: accepts case-insensitive trimmed email match', async () => {
    await expect(
      requestSelfDeletion({ userId: USER_ID, confirmEmail: ` ${USER_EMAIL.toUpperCase()} ` })
    ).resolves.toBeDefined();
  });

  it('AC-2: when Resend fails, the ADR is NOT created (export-before-destruction)', async () => {
    mockResendSend.mockResolvedValueOnce({ error: { message: 'smtp_failed' } });
    await expect(
      requestSelfDeletion({ userId: USER_ID, confirmEmail: USER_EMAIL })
    ).rejects.toThrow('export_email_failed');
    expect(mockAdrUpsert).not.toHaveBeenCalled();
    expect(mockUserUpdateMany).not.toHaveBeenCalled();
  });

  it('AC-3: success path — export sent, Telegram revoked, ADR upserted, User.status → DELETION_PENDING, audit emitted', async () => {
    const { scheduledFor } = await requestSelfDeletion({
      userId: USER_ID,
      confirmEmail: USER_EMAIL,
    });
    expect(scheduledFor.getTime()).toBeGreaterThan(Date.now());

    expect(mockGenerateExport).toHaveBeenCalledWith(USER_ID, USER_EMAIL);
    expect(mockResendSend).toHaveBeenCalled();
    expect(mockDeactivateTelegram).toHaveBeenCalledWith(USER_ID, expect.anything());

    expect(mockAdrUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID },
        create: expect.objectContaining({ requestedByUserId: null, status: 'PENDING' }),
      })
    );
    expect(mockUserUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID, status: { not: 'DELETION_PENDING' } },
        data: { status: 'DELETION_PENDING' },
      })
    );
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ACCOUNT_DELETION_SCHEDULED',
          actorUserId: USER_ID,
          subjectUserId: USER_ID,
          metadata: expect.objectContaining({ mode: 'delayed_self' }),
        }),
      })
    );
  });

  it('AC-1c: rejects managed users (must use the admin path)', async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: USER_ID,
      email: USER_EMAIL,
      name: 'Alice',
      status: 'ACTIVE',
      managedBy: 'pu-1',
    });
    await expect(
      requestSelfDeletion({ userId: USER_ID, confirmEmail: USER_EMAIL })
    ).rejects.toThrow('managed_user_cannot_self_delete');
    expect(mockGenerateExport).not.toHaveBeenCalled();
    expect(mockAdrUpsert).not.toHaveBeenCalled();
  });

  it('throws deletion_already_pending if an active ADR already exists', async () => {
    mockAdrFindUnique.mockResolvedValueOnce({ id: 'adr-existing', status: 'PENDING' });
    await expect(
      requestSelfDeletion({ userId: USER_ID, confirmEmail: USER_EMAIL })
    ).rejects.toThrow('deletion_already_pending');
    expect(mockGenerateExport).not.toHaveBeenCalled();
  });
});

describe('US-AUT-02: cancelSelfDeletion', () => {
  it('AC-4: deletes the ADR and restores User.status; audit emitted', async () => {
    await cancelSelfDeletion(USER_ID);
    expect(mockAdrDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER_ID,
          status: 'PENDING',
          scheduledFor: expect.objectContaining({ gt: expect.any(Date) }),
        }),
      })
    );
    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: { id: USER_ID, status: 'DELETION_PENDING', managedBy: null },
      data: { status: 'ACTIVE' },
    });
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'ACCOUNT_DELETION_CANCELLED' }),
      })
    );
  });

  it('AC-5: throws no_pending_deletion when there is nothing to cancel', async () => {
    mockAdrDeleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(cancelSelfDeletion(USER_ID)).rejects.toThrow('no_pending_deletion');
  });

  it('AC-5b: cancel after scheduledFor has passed (cron about to run) → no_pending_deletion', async () => {
    // Simulate the race: deleteMany returns count=0 because the predicate's
    // `scheduledFor: { gt: now }` no longer matches.
    mockAdrDeleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(cancelSelfDeletion(USER_ID)).rejects.toThrow('no_pending_deletion');
    // The User row must NOT be restored when the cancel was rejected.
    expect(mockUserUpdateMany).not.toHaveBeenCalled();
  });
});

describe('US-AUT-02: requestImmediateDeletion', () => {
  it('AC-7: throws acknowledgment_required when acknowledged is false', async () => {
    await expect(
      requestImmediateDeletion({ userId: USER_ID, confirmEmail: USER_EMAIL, acknowledged: false })
    ).rejects.toThrow('acknowledgment_required');
    expect(mockUserDeleteMany).not.toHaveBeenCalled();
  });

  it('AC-6: throws email_mismatch when typed email differs', async () => {
    await expect(
      requestImmediateDeletion({
        userId: USER_ID,
        confirmEmail: 'wrong@example.com',
        acknowledged: true,
      })
    ).rejects.toThrow('email_mismatch');
  });

  it('AC-8: success — Telegram revoked, user deleted, ACCOUNT_DELETED audit (immediate_self)', async () => {
    await requestImmediateDeletion({
      userId: USER_ID,
      confirmEmail: USER_EMAIL,
      acknowledged: true,
    });
    expect(mockDeactivateTelegram).toHaveBeenCalledWith(USER_ID, expect.anything());
    expect(mockUserDeleteMany).toHaveBeenCalledWith({
      where: { id: USER_ID, managedBy: null },
    });
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ACCOUNT_DELETED',
          metadata: expect.objectContaining({ mode: 'immediate_self' }),
        }),
      })
    );
  });

  it('throws user_not_in_eligible_state when the user delete affects no rows', async () => {
    mockUserDeleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      requestImmediateDeletion({ userId: USER_ID, confirmEmail: USER_EMAIL, acknowledged: true })
    ).rejects.toThrow('user_not_in_eligible_state');
  });
});
