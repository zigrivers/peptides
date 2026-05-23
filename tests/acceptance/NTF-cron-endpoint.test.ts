/**
 * Cron route guard tests for POST /api/cron/dose-reminders.
 * Mirrors the contract of /api/cron/stale-orders and /api/cron/pending-deletions:
 *   - 401 when CRON_SECRET is unset
 *   - 401 with a bad bearer
 *   - 200 + dispatcher invocation with the correct bearer
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDispatcher = vi.fn();
vi.mock('@/lib/notifications/application/ReminderDispatcher', () => ({
  dispatchDoseReminders: mockDispatcher,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mockDispatcher.mockResolvedValue({ examined: 0, dispatched: 0 });
});

async function importRoute() {
  return import('@/app/api/cron/dose-reminders/route');
}

function makeRequest(authHeader?: string): Request {
  return new Request('http://localhost/api/cron/dose-reminders', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : undefined,
  });
}

describe('POST /api/cron/dose-reminders', () => {
  it('returns 401 when CRON_SECRET is unset', async () => {
    const original = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const { POST } = await importRoute();
      const res = await POST(makeRequest('Bearer anything'));
      expect(res.status).toBe(401);
      expect(mockDispatcher).not.toHaveBeenCalled();
    } finally {
      if (original !== undefined) process.env.CRON_SECRET = original;
    }
  });

  it('returns 401 with a missing Authorization header', async () => {
    process.env.CRON_SECRET = 'correct-secret';
    const { POST } = await importRoute();
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mockDispatcher).not.toHaveBeenCalled();
  });

  it('returns 401 with a wrong bearer', async () => {
    process.env.CRON_SECRET = 'correct-secret';
    const { POST } = await importRoute();
    const res = await POST(makeRequest('Bearer wrong-secret'));
    expect(res.status).toBe(401);
    expect(mockDispatcher).not.toHaveBeenCalled();
  });

  it('invokes the dispatcher and returns the summary with a correct bearer', async () => {
    process.env.CRON_SECRET = 'correct-secret';
    mockDispatcher.mockResolvedValueOnce({
      examined: 3,
      dispatched: 1,
      pushSent: 1,
      pushExpired: 0,
      emailSent: 0,
      skippedNoDoses: 1,
      errors: 0,
    });
    const { POST } = await importRoute();
    const res = await POST(makeRequest('Bearer correct-secret'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { dispatched: number; examined: number };
    expect(json.examined).toBe(3);
    expect(json.dispatched).toBe(1);
    expect(mockDispatcher).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when the dispatcher throws a fatal error', async () => {
    process.env.CRON_SECRET = 'correct-secret';
    mockDispatcher.mockRejectedValueOnce(new Error('db_unreachable'));
    const { POST } = await importRoute();
    const res = await POST(makeRequest('Bearer correct-secret'));
    expect(res.status).toBe(500);
  });
});
