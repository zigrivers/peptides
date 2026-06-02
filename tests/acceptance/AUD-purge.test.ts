/**
 * Task 6.3 — Audit purge service (ADR-009 + ADR-012).
 *
 * Verifies the purge service's contract and the cron endpoint guards.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.fn();
const mockDeleteMany = vi.fn();
vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    auditEvent: { findMany: mockFindMany, deleteMany: mockDeleteMany },
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  mockFindMany.mockResolvedValue([]);
  mockDeleteMany.mockResolvedValue({ count: 0 });
});

const { purgeOldAuditEvents, DEFAULT_RETENTION_DAYS } = await import(
  '@/lib/audit/application/AuditPurgeService'
);

describe('purgeOldAuditEvents', () => {
  it('AC-1: deletes events older than the cutoff (default 90 days) in batches', async () => {
    // Two batches: first returns 1000 IDs, second returns 42 (< batch size → loop exits).
    const firstBatch = Array.from({ length: 1000 }, (_, i) => ({ id: `id-${i}` }));
    const secondBatch = Array.from({ length: 42 }, (_, i) => ({ id: `id-${1000 + i}` }));
    mockFindMany.mockResolvedValueOnce(firstBatch).mockResolvedValueOnce(secondBatch);
    mockDeleteMany.mockResolvedValueOnce({ count: 1000 }).mockResolvedValueOnce({ count: 42 });

    const now = new Date('2026-05-23T00:00:00Z');
    const result = await purgeOldAuditEvents(now);
    expect(result.deleted).toBe(1042);
    expect(result.batches).toBe(2);
    const expectedCutoff = new Date(
      now.getTime() - DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );
    expect(result.cutoff.getTime()).toBe(expectedCutoff.getTime());
    // First findMany used the cutoff predicate.
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { timestamp: { lt: expectedCutoff } },
        take: 1000,
      })
    );
    // deleteMany used the id-set predicate.
    expect(mockDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: expect.any(Array) } } })
    );
  });

  it('AC-3: returns cutoff date so ops can correlate runs', async () => {
    const now = new Date('2026-05-23T00:00:00Z');
    const result = await purgeOldAuditEvents(now);
    expect(result.cutoff).toBeInstanceOf(Date);
  });

  it('AC-4: returns count=0 (idempotent no-op) when nothing past cutoff', async () => {
    // findMany returns empty → outer loop breaks immediately.
    mockFindMany.mockResolvedValueOnce([]);
    const result = await purgeOldAuditEvents(new Date());
    expect(result.deleted).toBe(0);
    expect(result.batches).toBe(0);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it('AC-5: respects custom retentionDays parameter', async () => {
    const now = new Date('2026-05-23T00:00:00Z');
    mockFindMany.mockResolvedValueOnce([{ id: 'a' }]);
    mockDeleteMany.mockResolvedValueOnce({ count: 1 });
    await purgeOldAuditEvents(now, 30);
    const expectedCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { timestamp: { lt: expectedCutoff } },
      })
    );
  });

  it('rejects invalid retentionDays (zero, negative, NaN)', async () => {
    await expect(purgeOldAuditEvents(new Date(), 0)).rejects.toThrow('invalid_retention_days');
    await expect(purgeOldAuditEvents(new Date(), -1)).rejects.toThrow('invalid_retention_days');
    await expect(purgeOldAuditEvents(new Date(), NaN)).rejects.toThrow('invalid_retention_days');
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it('rejects invalid batchSize (zero, negative, NaN)', async () => {
    await expect(purgeOldAuditEvents(new Date(), 90, 0)).rejects.toThrow('invalid_batch_size');
    await expect(purgeOldAuditEvents(new Date(), 90, -5)).rejects.toThrow('invalid_batch_size');
    await expect(purgeOldAuditEvents(new Date(), 90, NaN)).rejects.toThrow('invalid_batch_size');
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });
});
