import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockSendWebPush: vi.fn(),
  mockPushFindMany: vi.fn(),
  mockPushDeleteMany: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockRateLimiterCheck: vi.fn().mockReturnValue(true),
}));

// Mock auth
vi.mock('@/lib/auth', () => ({
  auth: () => mocks.mockAuth(),
}));

// Mock webPush
vi.mock('@/lib/notifications/infrastructure/webPush', () => ({
  sendWebPush: (target: any, payload: any) => mocks.mockSendWebPush(target, payload),
}));

// Mock rateLimiter
vi.mock('@/lib/shared/rateLimiter', () => ({
  createRateLimiter: () => ({
    check: () => mocks.mockRateLimiterCheck(),
  }),
}));

// Mock prisma and transaction client
vi.mock('@/lib/shared/prisma', () => {
  const mockTx = {
    pushSubscription: {
      deleteMany: mocks.mockPushDeleteMany,
    },
    auditEvent: {
      create: mocks.mockAuditCreate,
    },
  };

  return {
    prisma: {
      pushSubscription: {
        findMany: mocks.mockPushFindMany,
        deleteMany: mocks.mockPushDeleteMany,
      },
      $transaction: async (cb: any) => cb(mockTx),
    },
  };
});

// Mock PushSubscriptionRepo listByUser
vi.mock('@/lib/notifications/infrastructure/PushSubscriptionRepo', () => ({
  PushSubscriptionRepo: {
    listByUser: (userId: string) => mocks.mockPushFindMany(userId),
  },
}));

// Import the action after mocks are set up
import { sendTestPushAction } from '@/app/actions/notifications/send-test-push';

describe('sendTestPushAction Acceptance', () => {
  const userId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockRateLimiterCheck.mockReturnValue(true);
  });

  it('rejects unauthorized sessions', async () => {
    mocks.mockAuth.mockResolvedValue(null);

    const result = await sendTestPushAction();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('unauthorized');
  });

  it('handles user with no subscriptions gracefully', async () => {
    mocks.mockAuth.mockResolvedValue({ user: { id: userId } });
    mocks.mockPushFindMany.mockResolvedValue([]);

    const result = await sendTestPushAction();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('no_subscriptions');
  });

  it('sends test notification to all user subscriptions and logs audit', async () => {
    mocks.mockAuth.mockResolvedValue({ user: { id: userId } });
    mocks.mockPushFindMany.mockResolvedValue([
      { endpoint: 'ep-1', p256dh: 'dh-1', auth: 'auth-1' },
      { endpoint: 'ep-2', p256dh: 'dh-2', auth: 'auth-2' },
    ]);
    mocks.mockSendWebPush.mockResolvedValue({ ok: true, expired: false });

    const result = await sendTestPushAction();
    expect(result.ok).toBe(true);
    expect(result.sentCount).toBe(2);

    expect(mocks.mockSendWebPush).toHaveBeenCalledTimes(2);
    expect(mocks.mockSendWebPush).toHaveBeenNthCalledWith(
      1,
      { endpoint: 'ep-1', p256dh: 'dh-1', auth: 'auth-1' },
      {
        title: 'Test Notification',
        body: 'Your push notification subscription is working correctly!',
        tag: 'test-notification',
      }
    );

    // Verify TEST_PUSH_SENT audit was logged
    expect(mocks.mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: userId,
          subjectUserId: userId,
          category: 'Notification',
          action: 'TEST_PUSH_SENT',
          resourceType: 'PushSubscription',
        }),
      })
    );
  });

  it('batch prunes expired subscriptions (404/410) and logs PRUNED audit', async () => {
    mocks.mockAuth.mockResolvedValue({ user: { id: userId } });
    mocks.mockPushFindMany.mockResolvedValue([
      { endpoint: 'ep-1', p256dh: 'dh-1', auth: 'auth-1' },
      { endpoint: 'ep-2', p256dh: 'dh-2', auth: 'auth-2' },
      { endpoint: 'ep-3', p256dh: 'dh-3', auth: 'auth-3' },
    ]);

    // ep-1: OK, ep-2: expired (410), ep-3: expired (404)
    mocks.mockSendWebPush.mockImplementation(async (sub: any) => {
      if (sub.endpoint === 'ep-1') return { ok: true, expired: false };
      return { ok: false, expired: true };
    });

    mocks.mockPushDeleteMany.mockResolvedValue({ count: 2 });

    const result = await sendTestPushAction();
    expect(result.ok).toBe(true);
    expect(result.sentCount).toBe(1);

    // Verify database pruning was executed in a transaction for both expired endpoints
    expect(mocks.mockPushDeleteMany).toHaveBeenCalledWith({
      where: {
        userId,
        endpoint: { in: ['ep-2', 'ep-3'] },
      },
    });

    // Verify PUSH_SUBSCRIPTION_PRUNED audit was logged
    expect(mocks.mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: userId,
          subjectUserId: userId,
          category: 'Notification',
          action: 'PUSH_SUBSCRIPTION_PRUNED',
          resourceType: 'PushSubscription',
        }),
      })
    );
  });

  it('enforces rate limit of 5 requests per 10 minutes', async () => {
    mocks.mockAuth.mockResolvedValue({ user: { id: userId } });
    mocks.mockPushFindMany.mockResolvedValue([{ endpoint: 'ep-1', p256dh: 'dh-1', auth: 'auth-1' }]);
    mocks.mockSendWebPush.mockResolvedValue({ ok: true, expired: false });

    // Mock check to return true 5 times, then false
    mocks.mockRateLimiterCheck
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValue(false);

    // Call 5 times (should be OK)
    for (let i = 0; i < 5; i++) {
      const res = await sendTestPushAction();
      expect(res.ok).toBe(true);
    }

    // 6th call should be rate limited
    const res6 = await sendTestPushAction();
    expect(res6.ok).toBe(false);
    expect(res6.error).toBe('rate_limited');
  });

  it('returns send_failed if all web push sends fail with non-expired errors', async () => {
    mocks.mockAuth.mockResolvedValue({ user: { id: userId } });
    mocks.mockPushFindMany.mockResolvedValue([{ endpoint: 'ep-1', p256dh: 'dh-1', auth: 'auth-1' }]);
    mocks.mockSendWebPush.mockResolvedValue({ ok: false, expired: false });

    const result = await sendTestPushAction();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('send_failed');
  });
});

