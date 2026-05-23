/**
 * Task 6.4 — vial-expiry cron endpoint guard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockMarkVialsExpired = vi.fn();
vi.mock('@/lib/reconstitution/application/VialExpiryService', () => ({
  markVialsExpired: mockMarkVialsExpired,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mockMarkVialsExpired.mockResolvedValue({ expired: 0 });
});

function makeRequest(authHeader?: string): Request {
  return new Request('http://localhost/api/cron/vial-expiry', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : undefined,
  });
}

describe('POST /api/cron/vial-expiry', () => {
  it('returns 401 when CRON_SECRET is unset', async () => {
    const original = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const { POST } = await import('@/app/api/cron/vial-expiry/route');
      const res = await POST(makeRequest('Bearer anything'));
      expect(res.status).toBe(401);
      expect(mockMarkVialsExpired).not.toHaveBeenCalled();
    } finally {
      if (original !== undefined) process.env.CRON_SECRET = original;
    }
  });

  it('returns 401 with wrong bearer', async () => {
    process.env.CRON_SECRET = 'correct';
    const { POST } = await import('@/app/api/cron/vial-expiry/route');
    const res = await POST(makeRequest('Bearer wrong'));
    expect(res.status).toBe(401);
  });

  it('returns 200 + expired count with correct bearer', async () => {
    process.env.CRON_SECRET = 'correct';
    mockMarkVialsExpired.mockResolvedValueOnce({ expired: 5 });
    const { POST } = await import('@/app/api/cron/vial-expiry/route');
    const res = await POST(makeRequest('Bearer correct'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { expired: number };
    expect(json.expired).toBe(5);
  });

  it('returns 500 on service error', async () => {
    process.env.CRON_SECRET = 'correct';
    mockMarkVialsExpired.mockRejectedValueOnce(new Error('db_down'));
    const { POST } = await import('@/app/api/cron/vial-expiry/route');
    const res = await POST(makeRequest('Bearer correct'));
    expect(res.status).toBe(500);
  });
});
