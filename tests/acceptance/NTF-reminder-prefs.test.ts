/**
 * Story: US-TRK-09 (configuration side) — Reminder Preferences + Web Push Subscription
 * Task 5.1 — ADR-007 (PWA + Web Push)
 *
 * Tests the ReminderService application-layer surface. Dispatch (Task 5.2) is
 * not exercised here; this task only persists configuration + subscriptions
 * and audits the changes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReminderFindUnique = vi.fn();
const mockReminderUpsert = vi.fn();
const mockReminderUpdate = vi.fn();
const mockReminderCreate = vi.fn();
const mockPushFindUnique = vi.fn();
const mockPushCreate = vi.fn();
const mockPushUpdateMany = vi.fn();
const mockPushDeleteMany = vi.fn();
const mockAuditCreate = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    reminderPreference: {
      findUnique: mockReminderFindUnique,
      upsert: mockReminderUpsert,
      update: mockReminderUpdate,
      create: mockReminderCreate,
    },
    pushSubscription: {
      findUnique: mockPushFindUnique,
      create: mockPushCreate,
      updateMany: mockPushUpdateMany,
      deleteMany: mockPushDeleteMany,
    },
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        reminderPreference: {
          findUnique: mockReminderFindUnique,
          upsert: mockReminderUpsert,
          update: mockReminderUpdate,
          create: mockReminderCreate,
        },
        pushSubscription: {
          findUnique: mockPushFindUnique,
          create: mockPushCreate,
          updateMany: mockPushUpdateMany,
          deleteMany: mockPushDeleteMany,
        },
        auditEvent: { create: mockAuditCreate },
      }),
  },
}));

const USER_ID = 'user-1';
const OTHER_USER = 'user-2';

const baseRow = {
  id: 'rp-1',
  userId: USER_ID,
  reminderTime: '07:30',
  timezone: 'America/Denver',
  channel: 'PUSH',
  enabled: true,
  pushPermissionState: 'NOT_PROMPTED',
  emailFallbackEnabled: true,
  updatedAt: new Date('2026-05-23T00:00:00Z'),
};

beforeEach(() => {
  // resetAllMocks (vs clearAllMocks) also drains queued mockResolvedValueOnce returns,
  // preventing leakage between tests.
  vi.resetAllMocks();
});

const {
  getReminderPreference,
  upsertReminderPreference,
  setPushPermissionState,
  registerPushSubscription,
  removePushSubscription,
} = await import('@/lib/notifications/application/ReminderService');

describe('US-TRK-09: getReminderPreference', () => {
  it('AC-1: returns null when no preference row exists', async () => {
    mockReminderFindUnique.mockResolvedValueOnce(null);
    const result = await getReminderPreference(USER_ID);
    expect(result).toBeNull();
    expect(mockReminderFindUnique).toHaveBeenCalledWith({ where: { userId: USER_ID } });
  });

  it('returns the existing preference when one exists', async () => {
    mockReminderFindUnique.mockResolvedValueOnce(baseRow);
    const result = await getReminderPreference(USER_ID);
    expect(result?.reminderTime).toBe('07:30');
    expect(result?.timezone).toBe('America/Denver');
    expect(result?.channel).toBe('PUSH');
  });
});

describe('US-TRK-09: upsertReminderPreference', () => {
  it('AC-2: creates on first call and writes REMINDER_PREFERENCE_UPDATED audit', async () => {
    mockReminderFindUnique.mockResolvedValueOnce(null); // prior fetch
    mockReminderFindUnique.mockResolvedValueOnce(null); // inside tx (unused here)
    mockReminderUpsert.mockResolvedValueOnce(baseRow);

    await upsertReminderPreference(USER_ID, {
      reminderTime: '07:30',
      timezone: 'America/Denver',
      channel: 'PUSH',
    });

    expect(mockReminderUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID } })
    );
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'REMINDER_PREFERENCE_UPDATED',
          actorUserId: USER_ID,
          subjectUserId: USER_ID,
          resourceType: 'ReminderPreference',
        }),
      })
    );
  });

  it('AC-3: updates on subsequent call — oldValues carries the prior row', async () => {
    mockReminderFindUnique.mockResolvedValueOnce(baseRow); // prior
    mockReminderUpsert.mockResolvedValueOnce({ ...baseRow, reminderTime: '08:00' });

    await upsertReminderPreference(USER_ID, {
      reminderTime: '08:00',
      timezone: 'America/Denver',
      channel: 'PUSH',
    });

    const auditCall = mockAuditCreate.mock.calls.at(-1)?.[0];
    expect(auditCall.data.oldValues.reminderTime).toBe('07:30');
    expect(auditCall.data.newValues.reminderTime).toBe('08:00');
  });

  it('AC-4: rejects invalid reminderTime format (24h regex)', async () => {
    await expect(
      upsertReminderPreference(USER_ID, {
        reminderTime: '7:30', // missing leading zero
        timezone: 'America/Denver',
        channel: 'PUSH',
      })
    ).rejects.toThrow();
    expect(mockReminderUpsert).not.toHaveBeenCalled();
  });

  it('AC-4b: rejects 24:00 / 25:nn / negative values', async () => {
    for (const bad of ['24:00', '25:30', '12:60', 'aa:bb', '']) {
      mockReminderFindUnique.mockReset();
      mockReminderUpsert.mockReset();
      await expect(
        upsertReminderPreference(USER_ID, {
          reminderTime: bad,
          timezone: 'UTC',
          channel: 'PUSH',
        })
      ).rejects.toThrow();
      expect(mockReminderUpsert).not.toHaveBeenCalled();
    }
  });

  it('AC-5: rejects unknown IANA timezone', async () => {
    await expect(
      upsertReminderPreference(USER_ID, {
        reminderTime: '07:30',
        timezone: 'America/Not_A_Real_Place_2026',
        channel: 'PUSH',
      })
    ).rejects.toThrow();
    expect(mockReminderUpsert).not.toHaveBeenCalled();
  });

  it('AC-6: rejects unsupported channel values', async () => {
    await expect(
      upsertReminderPreference(USER_ID, {
        reminderTime: '07:30',
        timezone: 'UTC',
        // @ts-expect-error -- intentional invalid input
        channel: 'SMS',
      })
    ).rejects.toThrow();
    expect(mockReminderUpsert).not.toHaveBeenCalled();
  });

  it('accepts all three channel values', async () => {
    for (const channel of ['PUSH', 'EMAIL', 'BOTH'] as const) {
      mockReminderFindUnique.mockResolvedValueOnce(null);
      mockReminderUpsert.mockResolvedValueOnce({ ...baseRow, channel });
      await expect(
        upsertReminderPreference(USER_ID, { reminderTime: '08:00', timezone: 'UTC', channel })
      ).resolves.toMatchObject({ channel });
    }
  });
});

describe('US-TRK-09: setPushPermissionState', () => {
  it('AC-10: writes PUSH_PERMISSION_STATE_CHANGED audit', async () => {
    mockReminderFindUnique.mockResolvedValueOnce(baseRow); // prior
    mockReminderFindUnique.mockResolvedValueOnce(baseRow); // inside tx existence check
    mockReminderUpdate.mockResolvedValueOnce({ ...baseRow, pushPermissionState: 'GRANTED' });

    await setPushPermissionState(USER_ID, 'GRANTED');

    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PUSH_PERMISSION_STATE_CHANGED',
          newValues: { pushPermissionState: 'GRANTED' },
        }),
      })
    );
  });

  it('creates a default row when no preference exists', async () => {
    mockReminderFindUnique.mockResolvedValueOnce(null); // prior
    mockReminderFindUnique.mockResolvedValueOnce(null); // inside tx
    mockReminderCreate.mockResolvedValueOnce({
      ...baseRow,
      reminderTime: '08:00',
      timezone: 'UTC',
      channel: 'EMAIL',
      pushPermissionState: 'DENIED',
    });

    await setPushPermissionState(USER_ID, 'DENIED');

    expect(mockReminderCreate).toHaveBeenCalled();
  });

  it('rejects invalid permission state', async () => {
    await expect(
      // @ts-expect-error -- intentional invalid input
      setPushPermissionState(USER_ID, 'MAYBE')
    ).rejects.toThrow();
  });
});

describe('US-TRK-09: registerPushSubscription', () => {
  const endpointInput = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    p256dh: 'p256dh-key-base64url',
    auth: 'auth-key-base64url',
  };

  it('AC-7: creates a new subscription on first registration', async () => {
    mockPushFindUnique.mockResolvedValueOnce(null);
    mockPushCreate.mockResolvedValueOnce({ id: 'ps-1' });

    const result = await registerPushSubscription(USER_ID, endpointInput);
    expect(result.id).toBe('ps-1');
    expect(mockPushCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: USER_ID, endpoint: endpointInput.endpoint }),
      })
    );
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PUSH_SUBSCRIPTION_REGISTERED',
          metadata: { mode: 'create' },
        }),
      })
    );
  });

  it('AC-7b: refresh — same user re-registers same endpoint, updates keys without duplicate row', async () => {
    mockPushFindUnique.mockResolvedValueOnce({
      id: 'ps-1',
      userId: USER_ID,
      endpoint: endpointInput.endpoint,
    });
    mockPushUpdateMany.mockResolvedValueOnce({ count: 1 });

    const result = await registerPushSubscription(USER_ID, endpointInput);
    expect(result.id).toBe('ps-1');
    expect(mockPushCreate).not.toHaveBeenCalled();
    expect(mockPushUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ps-1', userId: USER_ID },
        data: { p256dh: endpointInput.p256dh, auth: endpointInput.auth },
      })
    );
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PUSH_SUBSCRIPTION_REGISTERED',
          metadata: { mode: 'refresh' },
        }),
      })
    );
  });

  it('AC-8: refuses to reassign an endpoint owned by another user (anti-hijack)', async () => {
    mockPushFindUnique.mockResolvedValueOnce({
      id: 'ps-1',
      userId: OTHER_USER,
      endpoint: endpointInput.endpoint,
    });

    await expect(registerPushSubscription(USER_ID, endpointInput)).rejects.toThrow(
      'push_subscription_endpoint_owned_by_another_user'
    );
    expect(mockPushCreate).not.toHaveBeenCalled();
    expect(mockPushUpdateMany).not.toHaveBeenCalled();
  });

  it('rejects invalid endpoint URL', async () => {
    await expect(
      registerPushSubscription(USER_ID, { ...endpointInput, endpoint: 'not-a-url' })
    ).rejects.toThrow();
  });

  it('rejects empty p256dh / auth', async () => {
    await expect(
      registerPushSubscription(USER_ID, { ...endpointInput, p256dh: '' })
    ).rejects.toThrow();
    await expect(
      registerPushSubscription(USER_ID, { ...endpointInput, auth: '' })
    ).rejects.toThrow();
  });
});

describe('US-TRK-09: removePushSubscription', () => {
  it('AC-9: deletes only the actor-owned row', async () => {
    mockPushDeleteMany.mockResolvedValueOnce({ count: 1 });
    const result = await removePushSubscription(USER_ID, 'https://fcm.googleapis.com/fcm/send/abc123');
    expect(result.removed).toBe(true);
    expect(mockPushDeleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, endpoint: 'https://fcm.googleapis.com/fcm/send/abc123' },
    });
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'PUSH_SUBSCRIPTION_REMOVED' }),
      })
    );
  });

  it('returns removed=false when nothing matched but still audits the intent', async () => {
    mockPushDeleteMany.mockResolvedValueOnce({ count: 0 });
    const result = await removePushSubscription(USER_ID, 'https://other-endpoint.example.com');
    expect(result.removed).toBe(false);
    expect(mockAuditCreate).toHaveBeenCalled();
  });

  it('rejects empty endpoint', async () => {
    await expect(removePushSubscription(USER_ID, '')).rejects.toThrow('invalid_endpoint');
    expect(mockPushDeleteMany).not.toHaveBeenCalled();
  });
});
