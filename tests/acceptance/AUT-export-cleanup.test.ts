/**
 * Task 6.2 R2 upgrade — cleanupExpiredExports service.
 * Verifies the cleanup logic: deletes expired R2 objects, nulls expired
 * DB rows, no-ops when R2 isn't configured, tolerates per-key failures.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockIsR2Configured = vi.fn();
const mockListExpired = vi.fn();
const mockDeleteFromR2 = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock('@/lib/auth/infrastructure/exportStorage', () => ({
  isR2Configured: mockIsR2Configured,
  listExpiredExports: mockListExpired,
  deleteExportFromR2: mockDeleteFromR2,
  R2NotConfiguredError: class extends Error {
    constructor() {
      super('r2_not_configured');
    }
  },
}));

vi.mock('@/lib/shared/prisma', () => ({
  prisma: {
    dataExportRequest: { updateMany: mockUpdateMany },
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  mockIsR2Configured.mockReturnValue(true);
  mockListExpired.mockResolvedValue([]);
  mockUpdateMany.mockResolvedValue({ count: 0 });
});

const { cleanupExpiredExports } = await import(
  '@/lib/auth/application/exportCleanupService'
);

const NOW = new Date('2026-05-23T03:00:00Z');

describe('cleanupExpiredExports — service', () => {
  it('no-ops cleanly when R2 is not configured', async () => {
    mockIsR2Configured.mockReturnValueOnce(false);
    const result = await cleanupExpiredExports(NOW);
    expect(result.skipped).toBe(true);
    expect(result.deletedObjects).toBe(0);
    expect(mockListExpired).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('deletes each expired R2 object and nulls expired DB rows', async () => {
    mockListExpired.mockResolvedValueOnce([
      { key: 'exports/user-1/req-a.json', userId: 'user-1' },
      { key: 'exports/user-2/req-b.json', userId: 'user-2' },
    ]);
    mockUpdateMany.mockResolvedValueOnce({ count: 5 });

    const result = await cleanupExpiredExports(NOW);
    expect(result).toEqual({
      deletedObjects: 2,
      expiredRequestRows: 5,
      errors: 0,
      skipped: false,
    });
    expect(mockDeleteFromR2).toHaveBeenCalledTimes(2);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          expiresAt: { not: null, lt: NOW },
          downloadUrl: { not: null },
        }),
        data: { downloadUrl: null, expiresAt: null },
      })
    );
  });

  it('continues past a per-key delete failure and counts it as an error', async () => {
    mockListExpired.mockResolvedValueOnce([
      { key: 'exports/user-1/a.json', userId: 'user-1' },
      { key: 'exports/user-2/b.json', userId: 'user-2' },
    ]);
    mockDeleteFromR2
      .mockRejectedValueOnce(new Error('502 Bad Gateway'))
      .mockResolvedValueOnce(undefined);

    const result = await cleanupExpiredExports(NOW);
    expect(result.deletedObjects).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.skipped).toBe(false);
    expect(mockUpdateMany).toHaveBeenCalled();
  });

  it('returns zeros when nothing is expired yet (idempotent)', async () => {
    mockListExpired.mockResolvedValueOnce([]);
    const result = await cleanupExpiredExports(NOW);
    expect(result.deletedObjects).toBe(0);
    expect(result.errors).toBe(0);
  });
});
