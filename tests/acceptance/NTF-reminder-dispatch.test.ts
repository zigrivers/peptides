/**
 * Story: US-TRK-09 (dispatch side) — Reminder Dispatch Cron
 * Task 5.2 — ADR-012 (15-minute cadence)
 *
 * Tests the dispatcher's behaviour:
 *   - per-user local time window detection
 *   - same-day dedupe
 *   - push + email channel matrix
 *   - expired-subscription cleanup (410)
 *   - email fallback when all pushes fail
 *   - REMINDER_DISPATCHED audit
 *   - resilience to per-user exceptions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrefFindMany = vi.fn();
const mockPrefUpdateMany = vi.fn();
const mockPushFindMany = vi.fn();
const mockPushDeleteMany = vi.fn();
const mockProtocolFindMany = vi.fn();
const mockAuditCreate = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    reminderPreference: { findMany: mockPrefFindMany, updateMany: mockPrefUpdateMany },
    pushSubscription: { findMany: mockPushFindMany, deleteMany: mockPushDeleteMany },
    protocol: { findMany: mockProtocolFindMany },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        reminderPreference: { updateMany: mockPrefUpdateMany },
        auditEvent: { create: mockAuditCreate },
      }),
  },
}));

const mockSendWebPush = vi.fn();
const mockSendReminderEmail = vi.fn();
vi.mock('@/lib/notifications/infrastructure/webPush', () => ({
  sendWebPush: mockSendWebPush,
}));
vi.mock('@/lib/notifications/infrastructure/reminderEmail', () => ({
  sendReminderEmail: mockSendReminderEmail,
}));

const TIMEZONE = 'America/Denver';
// 2026-05-23 14:00 UTC === 08:00 MDT. Pref 08:00 → in window.
const NOW = new Date('2026-05-23T14:00:00Z');
// Yesterday in MDT
const YESTERDAY_LOCAL_UTC = new Date('2026-05-22T14:00:00Z');

const basePref = {
  id: 'rp-1',
  userId: 'user-1',
  reminderTime: '08:00',
  timezone: TIMEZONE,
  channel: 'PUSH',
  emailFallbackEnabled: true,
  pushPermissionState: 'GRANTED',
  lastDispatchedAt: null,
  user: { email: 'u@example.com' },
};

const activeDailyProtocol = {
  id: 'p-1',
  userId: 'user-1',
  compoundId: 'c-1',
  status: 'ACTIVE',
  startDate: new Date('2026-05-01T00:00:00Z'),
  endDate: null,
  schedule: { frequency: 'Daily' },
};

beforeEach(() => {
  vi.resetAllMocks();
  mockSendWebPush.mockResolvedValue({ ok: true, expired: false });
  mockSendReminderEmail.mockResolvedValue({ ok: true });
  mockPushFindMany.mockResolvedValue([
    { endpoint: 'https://fcm.example/abc', p256dh: 'p', auth: 'a' },
  ]);
  mockProtocolFindMany.mockResolvedValue([activeDailyProtocol]);
  // Default: every claim succeeds (count: 1). Specific tests override
  // this to simulate a competing worker that already claimed the day.
  mockPrefUpdateMany.mockResolvedValue({ count: 1 });
});

const { dispatchDoseReminders } = await import(
  '@/lib/notifications/application/ReminderDispatcher'
);

describe('US-TRK-09: dispatchDoseReminders', () => {
  it('AC-1: returns zero summary when no preferences exist', async () => {
    mockPrefFindMany.mockResolvedValueOnce([]);
    const summary = await dispatchDoseReminders(NOW);
    expect(summary.examined).toBe(0);
    expect(summary.dispatched).toBe(0);
    expect(mockSendWebPush).not.toHaveBeenCalled();
  });

  it('AC-3: skips preferences whose local time is outside the 15-minute window', async () => {
    // 09:00 reminder, local is 08:00 — out of window
    mockPrefFindMany.mockResolvedValueOnce([{ ...basePref, reminderTime: '09:00' }]);
    const summary = await dispatchDoseReminders(NOW);
    expect(summary.examined).toBe(1);
    expect(summary.dispatched).toBe(0);
    expect(mockSendWebPush).not.toHaveBeenCalled();
  });

  it('AC-4: dispatches push when in-window with no prior lastDispatchedAt', async () => {
    mockPrefFindMany.mockResolvedValueOnce([basePref]);
    const summary = await dispatchDoseReminders(NOW);
    expect(summary.dispatched).toBe(1);
    expect(summary.pushSent).toBe(1);
    expect(mockSendWebPush).toHaveBeenCalledTimes(1);
    // The atomic claim should fire with the CAS predicate and stamp lastDispatchedAt.
    const claimCall = mockPrefUpdateMany.mock.calls[0]?.[0];
    expect(claimCall.where.userId).toBe('user-1');
    expect(claimCall.where.OR).toBeDefined();
    expect(claimCall.data.lastDispatchedAt).toEqual(NOW);
  });

  it('AC-4b: skips dispatch when atomic claim returns count=0 (another worker won)', async () => {
    mockPrefFindMany.mockResolvedValueOnce([basePref]);
    mockPrefUpdateMany.mockResolvedValueOnce({ count: 0 }); // claim lost
    const summary = await dispatchDoseReminders(NOW);
    expect(summary.dispatched).toBe(0);
    expect(mockSendWebPush).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it('AC-5: dedupes when lastDispatchedAt is earlier-today local', async () => {
    mockPrefFindMany.mockResolvedValueOnce([
      { ...basePref, lastDispatchedAt: new Date('2026-05-23T13:00:00Z') }, // 07:00 local same day
    ]);
    const summary = await dispatchDoseReminders(NOW);
    expect(summary.dispatched).toBe(0);
    expect(mockSendWebPush).not.toHaveBeenCalled();
  });

  it('AC-6: dispatches when lastDispatchedAt was yesterday local', async () => {
    mockPrefFindMany.mockResolvedValueOnce([
      { ...basePref, lastDispatchedAt: YESTERDAY_LOCAL_UTC },
    ]);
    const summary = await dispatchDoseReminders(NOW);
    expect(summary.dispatched).toBe(1);
  });

  it('AC-7: skips when no doses are scheduled today (no audit, no push)', async () => {
    mockPrefFindMany.mockResolvedValueOnce([basePref]);
    mockProtocolFindMany.mockResolvedValueOnce([]); // no active protocols
    const summary = await dispatchDoseReminders(NOW);
    expect(summary.dispatched).toBe(0);
    expect(summary.skippedNoDoses).toBe(1);
    expect(mockSendWebPush).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it('AC-8: PUSH channel + push success → no email sent', async () => {
    mockPrefFindMany.mockResolvedValueOnce([basePref]);
    const summary = await dispatchDoseReminders(NOW);
    expect(summary.pushSent).toBe(1);
    expect(summary.emailSent).toBe(0);
    expect(mockSendReminderEmail).not.toHaveBeenCalled();
  });

  it('AC-9: EMAIL channel → push not attempted, only email sent', async () => {
    mockPrefFindMany.mockResolvedValueOnce([{ ...basePref, channel: 'EMAIL' }]);
    const summary = await dispatchDoseReminders(NOW);
    expect(summary.pushSent).toBe(0);
    expect(summary.emailSent).toBe(1);
    expect(mockSendWebPush).not.toHaveBeenCalled();
  });

  it('AC-10: BOTH channel → push AND email sent', async () => {
    mockPrefFindMany.mockResolvedValueOnce([{ ...basePref, channel: 'BOTH' }]);
    const summary = await dispatchDoseReminders(NOW);
    expect(summary.pushSent).toBe(1);
    expect(summary.emailSent).toBe(1);
  });

  it('AC-11: expired push (410) prunes subscription and email fallback fires', async () => {
    mockPrefFindMany.mockResolvedValueOnce([basePref]);
    mockSendWebPush.mockResolvedValueOnce({ ok: false, expired: true, statusCode: 410 });
    const summary = await dispatchDoseReminders(NOW);
    expect(summary.pushExpired).toBe(1);
    expect(summary.pushSent).toBe(0);
    expect(mockPushDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', endpoint: 'https://fcm.example/abc' },
    });
    expect(summary.emailSent).toBe(1); // email fallback because emailFallbackEnabled
  });

  it('AC-11c: multi-device — partial push delivery still triggers email fallback', async () => {
    mockPrefFindMany.mockResolvedValueOnce([basePref]);
    mockPushFindMany.mockResolvedValueOnce([
      { endpoint: 'https://fcm.example/primary', p256dh: 'p', auth: 'a' },
      { endpoint: 'https://fcm.example/secondary', p256dh: 'p', auth: 'a' },
    ]);
    // Primary fails transiently, secondary succeeds. The user might be on
    // their primary device — fallback email is needed so they don't miss it.
    mockSendWebPush
      .mockResolvedValueOnce({ ok: false, expired: false, statusCode: 500 })
      .mockResolvedValueOnce({ ok: true, expired: false });

    const summary = await dispatchDoseReminders(NOW);
    expect(summary.pushSent).toBe(1);
    expect(summary.emailSent).toBe(1);
  });

  it('AC-11b: transient push failure does NOT prune subscription; still falls back to email per setting', async () => {
    mockPrefFindMany.mockResolvedValueOnce([basePref]);
    mockSendWebPush.mockResolvedValueOnce({ ok: false, expired: false, statusCode: 500 });
    const summary = await dispatchDoseReminders(NOW);
    expect(mockPushDeleteMany).not.toHaveBeenCalled();
    expect(summary.emailSent).toBe(1);
  });

  it('AC-12: PUSH channel + push fails + emailFallbackEnabled=false → no email', async () => {
    mockPrefFindMany.mockResolvedValueOnce([
      { ...basePref, emailFallbackEnabled: false },
    ]);
    mockSendWebPush.mockResolvedValueOnce({ ok: false, expired: true });
    const summary = await dispatchDoseReminders(NOW);
    expect(mockSendReminderEmail).not.toHaveBeenCalled();
    // Nothing delivered → no audit. The claim should have been rolled back
    // so a later tick gets another chance.
    expect(summary.dispatched).toBe(0);
    expect(mockAuditCreate).not.toHaveBeenCalled();
    const calls = mockPrefUpdateMany.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2); // claim + rollback
    expect(calls[calls.length - 1][0].data.lastDispatchedAt).toBe(null);
  });

  it('AC-13: continues after a per-user exception', async () => {
    const goodPref = { ...basePref, id: 'rp-2', userId: 'user-2' };
    mockPrefFindMany.mockResolvedValueOnce([
      { ...basePref, timezone: 'Not/A_Real_Zone' },
      goodPref,
    ]);
    // For user-2 we need protocol findMany to resolve; reset its impl
    mockProtocolFindMany.mockResolvedValue([
      { ...activeDailyProtocol, userId: 'user-2' },
    ]);
    const summary = await dispatchDoseReminders(NOW);
    expect(summary.errors).toBeGreaterThanOrEqual(1);
    expect(summary.dispatched).toBe(1);
  });

  it('AC-13b: channel=BOTH, push succeeds + email fails → partialDelivery flagged in audit + summary', async () => {
    mockPrefFindMany.mockResolvedValueOnce([{ ...basePref, channel: 'BOTH' }]);
    mockSendReminderEmail.mockResolvedValueOnce({ ok: false, error: 'resend_unreachable' });

    const summary = await dispatchDoseReminders(NOW);
    expect(summary.dispatched).toBe(1);
    expect(summary.partialDeliveries).toBe(1);
    expect(summary.emailFailed).toBe(1);
    expect(summary.pushSent).toBe(1);

    const auditCall = mockAuditCreate.mock.calls.at(-1)?.[0];
    expect(auditCall.data.metadata.partialDelivery).toBe(true);
    expect(auditCall.data.metadata.emailAttempted).toBe(true);
    expect(auditCall.data.metadata.emailDelivered).toBe(false);
    expect(auditCall.data.metadata.emailError).toBe('resend_unreachable');
  });

  it('AC-14: writes REMINDER_DISPATCHED audit on success', async () => {
    mockPrefFindMany.mockResolvedValueOnce([basePref]);
    await dispatchDoseReminders(NOW);
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: 'SYSTEM',
          subjectUserId: 'user-1',
          action: 'REMINDER_DISPATCHED',
          category: 'Notification',
        }),
      })
    );
  });

  it('PUSH+permission=DENIED → does not attempt push but still emails when channel=BOTH', async () => {
    mockPrefFindMany.mockResolvedValueOnce([
      { ...basePref, channel: 'BOTH', pushPermissionState: 'DENIED' },
    ]);
    const summary = await dispatchDoseReminders(NOW);
    expect(mockSendWebPush).not.toHaveBeenCalled();
    expect(summary.emailSent).toBe(1);
  });
});
