/**
 * Task 6.4 — Vial expiry cron service.
 * Verifies the transition from RECONSTITUTED → EXPIRED, VIAL_EXPIRED
 * audit emission, idempotency, and TOCTOU defense.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVialFindMany = vi.fn();
const mockVialUpdateMany = vi.fn();
const mockAuditCreate = vi.fn();

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    vial: { findMany: mockVialFindMany },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        vial: { updateMany: mockVialUpdateMany },
        auditEvent: { create: mockAuditCreate },
      }),
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  mockVialFindMany.mockResolvedValue([]);
  mockVialUpdateMany.mockResolvedValue({ count: 1 });
});

const { markVialsExpired } = await import(
  '@/lib/reconstitution/application/VialExpiryService'
);

const NOW = new Date('2026-05-23T12:00:00Z');

describe('markVialsExpired', () => {
  it('returns expired=0 when no vials are past expiresAt', async () => {
    mockVialFindMany.mockResolvedValueOnce([]);
    const result = await markVialsExpired(NOW);
    expect(result.expired).toBe(0);
    expect(mockVialUpdateMany).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it('transitions each expired vial to EXPIRED and emits VIAL_EXPIRED audit', async () => {
    mockVialFindMany.mockResolvedValueOnce([
      { id: 'v-1', userId: 'u-1', expiresAt: new Date('2026-05-22T00:00:00Z') },
      { id: 'v-2', userId: 'u-2', expiresAt: new Date('2026-05-20T00:00:00Z') },
    ]);
    const result = await markVialsExpired(NOW);
    expect(result.expired).toBe(2);

    expect(mockVialUpdateMany).toHaveBeenCalledWith({
      where: { id: 'v-1', userId: 'u-1', status: 'RECONSTITUTED' },
      data: { status: 'EXPIRED' },
    });
    expect(mockVialUpdateMany).toHaveBeenCalledWith({
      where: { id: 'v-2', userId: 'u-2', status: 'RECONSTITUTED' },
      data: { status: 'EXPIRED' },
    });
    const expiredAudits = mockAuditCreate.mock.calls.filter(
      (c) => c[0]?.data?.action === 'VIAL_EXPIRED'
    );
    expect(expiredAudits).toHaveLength(2);
    expect(expiredAudits[0][0].data.actorUserId).toBe('SYSTEM');
    expect(expiredAudits[0][0].data.subjectUserId).toBe('u-1');
    expect(expiredAudits[0][0].data.oldValues).toEqual({ status: 'RECONSTITUTED' });
    expect(expiredAudits[0][0].data.newValues).toEqual({ status: 'EXPIRED' });
  });

  it('TOCTOU defense — when updateMany count=0, no audit is emitted', async () => {
    mockVialFindMany.mockResolvedValueOnce([
      { id: 'v-1', userId: 'u-1', expiresAt: new Date('2026-05-22T00:00:00Z') },
      { id: 'v-2', userId: 'u-2', expiresAt: new Date('2026-05-20T00:00:00Z') },
    ]);
    mockVialUpdateMany
      .mockResolvedValueOnce({ count: 0 }) // v-1 already transitioned by a concurrent run
      .mockResolvedValueOnce({ count: 1 });
    const result = await markVialsExpired(NOW);
    expect(result.expired).toBe(1);
    const expiredAudits = mockAuditCreate.mock.calls.filter(
      (c) => c[0]?.data?.action === 'VIAL_EXPIRED'
    );
    expect(expiredAudits).toHaveLength(1);
    expect(expiredAudits[0][0].data.resourceId).toBe('v-2');
  });

  it('idempotent — a re-run after all are flipped finds nothing', async () => {
    mockVialFindMany.mockResolvedValueOnce([]);
    const result = await markVialsExpired(NOW);
    expect(result.expired).toBe(0);
  });
});
