/**
 * Task 6.2 R2 upgrade — /api/cron/export-cleanup endpoint guard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCleanup = vi.fn();
vi.mock('@/lib/auth/application/exportCleanupService', () => ({
  cleanupExpiredExports: mockCleanup,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mockCleanup.mockResolvedValue({
    deletedObjects: 0,
    expiredRequestRows: 0,
    errors: 0,
    skipped: false,
  });
});

function makeRequest(authHeader?: string): Request {
  return new Request('http://localhost/api/cron/export-cleanup', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : undefined,
  });
}

describe('POST /api/cron/export-cleanup', () => {
  it('returns 401 without CRON_SECRET', async () => {
    const original = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const { POST } = await import('@/app/api/cron/export-cleanup/route');
      const res = await POST(makeRequest('Bearer anything'));
      expect(res.status).toBe(401);
      expect(mockCleanup).not.toHaveBeenCalled();
    } finally {
      if (original !== undefined) process.env.CRON_SECRET = original;
    }
  });

  it('returns 401 with wrong bearer', async () => {
    process.env.CRON_SECRET = 'correct';
    const { POST } = await import('@/app/api/cron/export-cleanup/route');
    const res = await POST(makeRequest('Bearer wrong'));
    expect(res.status).toBe(401);
  });

  it('returns 200 + summary with the correct bearer', async () => {
    process.env.CRON_SECRET = 'correct';
    mockCleanup.mockResolvedValueOnce({
      deletedObjects: 3,
      expiredRequestRows: 4,
      errors: 0,
      skipped: false,
    });
    const { POST } = await import('@/app/api/cron/export-cleanup/route');
    const res = await POST(makeRequest('Bearer correct'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { deletedObjects: number };
    expect(json.deletedObjects).toBe(3);
  });

  it('returns 500 on service exception', async () => {
    process.env.CRON_SECRET = 'correct';
    mockCleanup.mockRejectedValueOnce(new Error('connection_reset'));
    const { POST } = await import('@/app/api/cron/export-cleanup/route');
    const res = await POST(makeRequest('Bearer correct'));
    expect(res.status).toBe(500);
  });
});
