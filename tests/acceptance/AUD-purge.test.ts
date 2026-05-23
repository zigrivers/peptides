/**
 * Task 6.3 — Audit purge service (ADR-009 + ADR-012).
 *
 * Verifies the purge service's contract and the cron endpoint guards.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDeleteMany = vi.fn();
vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    auditEvent: { deleteMany: mockDeleteMany },
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  mockDeleteMany.mockResolvedValue({ count: 0 });
});

const { purgeOldAuditEvents, DEFAULT_RETENTION_DAYS } = await import(
  '@/lib/audit/application/AuditPurgeService'
);

describe('purgeOldAuditEvents', () => {
  it('AC-1: deletes events older than the cutoff (default 90 days)', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 42 });
    const now = new Date('2026-05-23T00:00:00Z');
    const result = await purgeOldAuditEvents(now);
    expect(result.deleted).toBe(42);
    const expectedCutoff = new Date(
      now.getTime() - DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );
    expect(result.cutoff.getTime()).toBe(expectedCutoff.getTime());
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { timestamp: { lt: expectedCutoff } },
    });
  });

  it('AC-3: returns cutoff date so ops can correlate runs', async () => {
    const now = new Date('2026-05-23T00:00:00Z');
    const result = await purgeOldAuditEvents(now);
    expect(result.cutoff).toBeInstanceOf(Date);
  });

  it('AC-4: returns count=0 (idempotent no-op) when nothing past cutoff', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 0 });
    const result = await purgeOldAuditEvents(new Date());
    expect(result.deleted).toBe(0);
  });

  it('AC-5: respects custom retentionDays parameter', async () => {
    const now = new Date('2026-05-23T00:00:00Z');
    await purgeOldAuditEvents(now, 30);
    const expectedCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { timestamp: { lt: expectedCutoff } },
    });
  });

  it('rejects invalid retentionDays (zero, negative, NaN)', async () => {
    await expect(purgeOldAuditEvents(new Date(), 0)).rejects.toThrow('invalid_retention_days');
    await expect(purgeOldAuditEvents(new Date(), -1)).rejects.toThrow('invalid_retention_days');
    await expect(purgeOldAuditEvents(new Date(), NaN)).rejects.toThrow('invalid_retention_days');
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });
});
