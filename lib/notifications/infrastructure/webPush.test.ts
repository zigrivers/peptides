/**
 * Transport init tests for the lazy web-push wrapper. Verifies:
 *   - Missing VAPID env vars produce a structured failure (not a throw).
 *   - The default-export shape exposed by web-push (CommonJS under ESM)
 *     is normalised so `setVapidDetails` / `sendNotification` resolve.
 *   - 410 / 404 from the push service are reported as `expired: true`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSetVapidDetails = vi.fn();
const mockSendNotification = vi.fn();

// Simulate the CommonJS-wrapped-as-ESM shape that Codex flagged: the named
// methods live under `default`, not on the module top-level.
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: mockSetVapidDetails,
    sendNotification: mockSendNotification,
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('sendWebPush', () => {
  it('returns ok=false when VAPID env vars are unset', async () => {
    const original = { pub: process.env.WEB_PUSH_PUBLIC_KEY, priv: process.env.WEB_PUSH_PRIVATE_KEY };
    delete process.env.WEB_PUSH_PUBLIC_KEY;
    delete process.env.WEB_PUSH_PRIVATE_KEY;
    try {
      const { sendWebPush, __resetWebPushClientForTesting } = await import('./webPush');
      __resetWebPushClientForTesting();
      const result = await sendWebPush(
        { endpoint: 'https://x', p256dh: 'p', auth: 'a' },
        { title: 't', body: 'b' }
      );
      expect(result.ok).toBe(false);
      expect(result.error).toContain('web_push_not_configured');
      expect(mockSendNotification).not.toHaveBeenCalled();
    } finally {
      if (original.pub !== undefined) process.env.WEB_PUSH_PUBLIC_KEY = original.pub;
      if (original.priv !== undefined) process.env.WEB_PUSH_PRIVATE_KEY = original.priv;
    }
  });

  it('normalises the CommonJS-under-ESM default-export shape and sends', async () => {
    process.env.WEB_PUSH_PUBLIC_KEY = 'fake-public';
    process.env.WEB_PUSH_PRIVATE_KEY = 'fake-private';
    mockSendNotification.mockResolvedValueOnce({});
    const { sendWebPush, __resetWebPushClientForTesting } = await import('./webPush');
    __resetWebPushClientForTesting();
    const result = await sendWebPush(
      { endpoint: 'https://fcm.example/x', p256dh: 'p', auth: 'a' },
      { title: 't', body: 'b', url: '/tracker', tag: 'r' }
    );
    expect(mockSetVapidDetails).toHaveBeenCalledWith(
      expect.stringContaining('mailto:'),
      'fake-public',
      'fake-private'
    );
    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, expired: false });
  });

  it('reports HTTP 410 as expired=true so the dispatcher prunes the row', async () => {
    process.env.WEB_PUSH_PUBLIC_KEY = 'fake-public';
    process.env.WEB_PUSH_PRIVATE_KEY = 'fake-private';
    const { sendWebPush, __resetWebPushClientForTesting } = await import('./webPush');
    __resetWebPushClientForTesting();
    mockSendNotification.mockRejectedValueOnce(
      Object.assign(new Error('Gone'), { statusCode: 410 })
    );
    const result = await sendWebPush(
      { endpoint: 'https://fcm.example/dead', p256dh: 'p', auth: 'a' },
      { title: 't', body: 'b' }
    );
    expect(result.ok).toBe(false);
    expect(result.expired).toBe(true);
    expect(result.statusCode).toBe(410);
  });

  it('treats 5xx as transient (expired=false)', async () => {
    process.env.WEB_PUSH_PUBLIC_KEY = 'fake-public';
    process.env.WEB_PUSH_PRIVATE_KEY = 'fake-private';
    const { sendWebPush, __resetWebPushClientForTesting } = await import('./webPush');
    __resetWebPushClientForTesting();
    mockSendNotification.mockRejectedValueOnce(
      Object.assign(new Error('temporary'), { statusCode: 503 })
    );
    const result = await sendWebPush(
      { endpoint: 'https://fcm.example/blip', p256dh: 'p', auth: 'a' },
      { title: 't', body: 'b' }
    );
    expect(result.ok).toBe(false);
    expect(result.expired).toBe(false);
    expect(result.statusCode).toBe(503);
  });
});
