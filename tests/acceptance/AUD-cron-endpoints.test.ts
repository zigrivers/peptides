/**
 * Task 6.3 — Cron endpoint guards for /api/cron/audit-purge and
 * /api/cron/backup-verify. Verifies that both routes require the
 * CRON_SECRET bearer and surface a structured response when the
 * service succeeds.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPurge = vi.fn();
vi.mock('@/lib/audit/application/AuditPurgeService', () => ({
  purgeOldAuditEvents: mockPurge,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mockPurge.mockResolvedValue({ deleted: 0, cutoff: new Date('2026-02-22T00:00:00Z') });
});

function makeRequest(path: string, authHeader?: string): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : undefined,
  });
}

describe('POST /api/cron/audit-purge', () => {
  it('returns 401 when CRON_SECRET is unset', async () => {
    const original = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const { POST } = await import('@/app/api/cron/audit-purge/route');
      const res = await POST(makeRequest('/api/cron/audit-purge', 'Bearer anything'));
      expect(res.status).toBe(401);
      expect(mockPurge).not.toHaveBeenCalled();
    } finally {
      if (original !== undefined) process.env.CRON_SECRET = original;
    }
  });

  it('returns 401 with the wrong bearer', async () => {
    process.env.CRON_SECRET = 'correct';
    const { POST } = await import('@/app/api/cron/audit-purge/route');
    const res = await POST(makeRequest('/api/cron/audit-purge', 'Bearer wrong'));
    expect(res.status).toBe(401);
    expect(mockPurge).not.toHaveBeenCalled();
  });

  it('returns 200 + deleted count + cutoff with the correct bearer', async () => {
    process.env.CRON_SECRET = 'correct';
    mockPurge.mockResolvedValueOnce({
      deleted: 12,
      cutoff: new Date('2026-02-22T00:00:00Z'),
    });
    const { POST } = await import('@/app/api/cron/audit-purge/route');
    const res = await POST(makeRequest('/api/cron/audit-purge', 'Bearer correct'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { deleted: number; cutoff: string };
    expect(json.deleted).toBe(12);
    expect(json.cutoff).toBe('2026-02-22T00:00:00.000Z');
  });

  it('returns 500 on a service error', async () => {
    process.env.CRON_SECRET = 'correct';
    mockPurge.mockRejectedValueOnce(new Error('db_down'));
    const { POST } = await import('@/app/api/cron/audit-purge/route');
    const res = await POST(makeRequest('/api/cron/audit-purge', 'Bearer correct'));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/cron/backup-verify', () => {
  it('returns 401 when CRON_SECRET is unset', async () => {
    const original = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const { POST } = await import('@/app/api/cron/backup-verify/route');
      const res = await POST(makeRequest('/api/cron/backup-verify', 'Bearer anything'));
      expect(res.status).toBe(401);
    } finally {
      if (original !== undefined) process.env.CRON_SECRET = original;
    }
  });

  it('returns 200 + verifiedAt with the correct bearer', async () => {
    process.env.CRON_SECRET = 'correct';
    const { POST } = await import('@/app/api/cron/backup-verify/route');
    const res = await POST(makeRequest('/api/cron/backup-verify', 'Bearer correct'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; verifiedAt: string };
    expect(json.ok).toBe(true);
    expect(typeof json.verifiedAt).toBe('string');
  });
});
