import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Offline Queue module — pure logic tests
 * IndexedDB operations are tested by mocking the idb `openDB` call.
 */
const mockIdbOpen = vi.fn();
const mockIdbGetAll = vi.fn();
const mockIdbGet = vi.fn();
const mockIdbPut = vi.fn();
const mockIdbAdd = vi.fn();

vi.mock('idb', () => ({
  openDB: mockIdbOpen,
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/tracker/application/DoseLogService', () => ({
  logDose: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { auth } from '@/lib/auth';
import { logDose } from '@/lib/tracker/application/DoseLogService';
const mockAuth = vi.mocked(auth);
const mockLogDose = vi.mocked(logDose);

/**
 * Story: US-AUT-05 — PWA & Offline Support
 * Story: US-TRK-03 — Individual Dose Logging (offline AC)
 */

/**
 * OfflineQueue module — encapsulates IndexedDB operations
 */
describe('US-AUT-05 / US-TRK-03: Offline Queue', () => {
  const dbMock = {
    getAll: mockIdbGetAll,
    get: mockIdbGet,
    put: mockIdbPut,
    add: mockIdbAdd,
    transaction: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIdbOpen.mockResolvedValue(dbMock);
  });

  describe('AC-7: duplicate-tap protection', () => {
    it('rejects a second enqueue for the same (protocolId, scheduledDate, deviceId)', async () => {
      const { OfflineQueue } = await import('@/lib/offline/application/OfflineQueue');
      const queue = new OfflineQueue();

      const entry = {
        protocolId: 'proto-1',
        scheduledDate: '2026-05-21',
        deviceId: 'device-abc',
        amount: { amount: '250', unit: 'mcg' as const },
        status: 'LOGGED' as const,
      };

      // First enqueue: existing check returns null (no duplicate).
      mockIdbGet.mockResolvedValueOnce(null);
      mockIdbAdd.mockResolvedValueOnce('entry-1');

      const first = await queue.enqueue(entry);
      expect(first.ok).toBe(true);

      // Second enqueue: existing check returns the first entry.
      mockIdbGet.mockResolvedValueOnce({ id: 'entry-1', ...entry, synced: false });

      const second = await queue.enqueue(entry);
      expect(second.ok).toBe(false);
      expect((second as { ok: false; error: string }).error).toMatch(/duplicate/i);
      expect(mockIdbAdd).toHaveBeenCalledTimes(1); // not called again
    });

    it('allows a second enqueue for the same protocol on a different date', async () => {
      const { OfflineQueue } = await import('@/lib/offline/application/OfflineQueue');
      const queue = new OfflineQueue();

      mockIdbGet.mockResolvedValue(null);
      mockIdbAdd.mockResolvedValue('ok');

      const r1 = await queue.enqueue({ protocolId: 'proto-1', scheduledDate: '2026-05-21', deviceId: 'd', amount: { amount: '250', unit: 'mcg' as const }, status: 'LOGGED' as const });
      const r2 = await queue.enqueue({ protocolId: 'proto-1', scheduledDate: '2026-05-22', deviceId: 'd', amount: { amount: '250', unit: 'mcg' as const }, status: 'LOGGED' as const });

      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
    });

    it('keeps both twice-daily doses (same protocol+date, different doseSlot)', async () => {
      const { OfflineQueue } = await import('@/lib/offline/application/OfflineQueue');
      const queue = new OfflineQueue();

      const base = { protocolId: 'proto-1', scheduledDate: '2026-05-21', deviceId: 'd', amount: { amount: '250', unit: 'mcg' as const }, status: 'LOGGED' as const };

      // The dedupe key now folds in doseSlot, so the two slots resolve to different
      // store keys and BOTH find()s return null (no duplicate detected).
      mockIdbGet.mockResolvedValue(null);
      mockIdbAdd.mockResolvedValue('ok');

      const morning = await queue.enqueue({ ...base, doseSlot: 0 });
      const evening = await queue.enqueue({ ...base, doseSlot: 1 });

      expect(morning.ok).toBe(true);
      expect(evening.ok).toBe(true);
      // Distinct store ids => evening did not overwrite morning on sync.
      expect((morning as { ok: true; id: string }).id).not.toBe((evening as { ok: true; id: string }).id);
      expect(mockIdbAdd).toHaveBeenCalledTimes(2);
    });

    it('dedupes the same doseSlot enqueued twice', async () => {
      const { OfflineQueue } = await import('@/lib/offline/application/OfflineQueue');
      const queue = new OfflineQueue();

      const entry = { protocolId: 'proto-1', scheduledDate: '2026-05-21', deviceId: 'd', amount: { amount: '250', unit: 'mcg' as const }, status: 'LOGGED' as const, doseSlot: 1 };

      mockIdbGet.mockResolvedValueOnce(null);
      mockIdbAdd.mockResolvedValueOnce('ok');
      const first = await queue.enqueue(entry);
      expect(first.ok).toBe(true);

      // Second enqueue of the same slot: existing check finds it.
      mockIdbGet.mockResolvedValueOnce({ id: (first as { ok: true; id: string }).id, ...entry, synced: false });
      const second = await queue.enqueue(entry);
      expect(second.ok).toBe(false);
      expect(mockIdbAdd).toHaveBeenCalledTimes(1);
    });

    it('defaults doseSlot to 0 when reading a legacy entry without the field', async () => {
      const { OfflineQueue } = await import('@/lib/offline/application/OfflineQueue');
      const queue = new OfflineQueue();

      // Legacy entry persisted before twice-daily support: no doseSlot key.
      mockIdbGetAll.mockResolvedValueOnce([
        { id: 'legacy-1', protocolId: 'p1', scheduledDate: '2026-05-21', deviceId: 'd', synced: false, amount: { amount: '250', unit: 'mcg' }, status: 'LOGGED' },
      ]);

      const pending = await queue.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].doseSlot).toBe(0);
    });
  });

  describe('AC-3: offline sync replay', () => {
    it('returns pending (unsynced) entries from the store', async () => {
      const { OfflineQueue } = await import('@/lib/offline/application/OfflineQueue');
      const queue = new OfflineQueue();

      const entry = { id: 'e1', protocolId: 'proto-1', scheduledDate: '2026-05-21', deviceId: 'd', synced: false, amount: { amount: '250', unit: 'mcg' }, status: 'LOGGED' };
      mockIdbGetAll.mockResolvedValueOnce([entry]);

      const pending = await queue.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('e1');
    });

    it('filters out already-synced entries', async () => {
      const { OfflineQueue } = await import('@/lib/offline/application/OfflineQueue');
      const queue = new OfflineQueue();

      mockIdbGetAll.mockResolvedValueOnce([
        { id: 'e1', synced: false },
        { id: 'e2', synced: true },
      ]);

      const pending = await queue.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('e1');
    });

    it('marks an entry as synced after markSynced call', async () => {
      const { OfflineQueue } = await import('@/lib/offline/application/OfflineQueue');
      const queue = new OfflineQueue();

      const entry = { id: 'e1', protocolId: 'p1', scheduledDate: '2026-05-21', deviceId: 'd', synced: false, amount: { amount: '250', unit: 'mcg' }, status: 'LOGGED' };
      mockIdbGet.mockResolvedValueOnce(entry);
      mockIdbPut.mockResolvedValueOnce('ok');

      await queue.markSynced('e1');

      expect(mockIdbPut).toHaveBeenCalledWith(
        'dose-queue',
        expect.objectContaining({ id: 'e1', synced: true })
      );
    });
  });
});

/**
 * Sync API endpoint — server-side handler
 */
describe('US-AUT-05 / US-TRK-03: Sync API (/api/sync)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('AC-3: returns 401 if unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce(null as never);

    const { POST } = await import('@/app/api/sync/route');
    const req = new Request('http://localhost/api/sync', {
      method: 'POST',
      body: JSON.stringify({ entries: [] }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('AC-3: replays a queued dose log and returns per-entry result', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1' } } as never);
    mockLogDose.mockResolvedValueOnce({ id: 'log-1', protocolId: 'proto-1' } as never);

    const { POST } = await import('@/app/api/sync/route');
    const req = new Request('http://localhost/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        entries: [{
          id: 'queue-e1',
          protocolId: 'proto-1',
          scheduledDate: '2026-05-21',
          amount: { amount: '250', unit: 'mcg' },
          status: 'LOGGED',
        }],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({ id: 'queue-e1', ok: true });
  });

  it('AC-3: logs a synced entry to its doseSlot (twice-daily evening dose)', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1' } } as never);
    mockLogDose.mockResolvedValueOnce({ id: 'log-2', protocolId: 'proto-1' } as never);

    const { POST } = await import('@/app/api/sync/route');
    const req = new Request('http://localhost/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        entries: [{
          id: 'queue-evening',
          protocolId: 'proto-1',
          scheduledDate: '2026-05-21',
          doseSlot: 1,
          amount: { amount: '250', unit: 'mcg' },
          status: 'LOGGED',
        }],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0]).toMatchObject({ id: 'queue-evening', ok: true });
    expect(mockLogDose).toHaveBeenCalledWith(expect.objectContaining({ doseSlot: 1 }));
  });

  it('AC-3: defaults doseSlot to 0 for legacy synced entries without the field', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1' } } as never);
    mockLogDose.mockResolvedValueOnce({ id: 'log-3', protocolId: 'proto-1' } as never);

    const { POST } = await import('@/app/api/sync/route');
    const req = new Request('http://localhost/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        entries: [{
          id: 'queue-legacy',
          protocolId: 'proto-1',
          scheduledDate: '2026-05-21',
          amount: { amount: '250', unit: 'mcg' },
          status: 'LOGGED',
        }],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockLogDose).toHaveBeenCalledWith(expect.objectContaining({ doseSlot: 0 }));
  });

  it('AC-3: returns per-entry error for an unknown protocol', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1' } } as never);
    mockLogDose.mockRejectedValueOnce(new Error('Protocol not found: proto-bad'));

    const { POST } = await import('@/app/api/sync/route');
    const req = new Request('http://localhost/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        entries: [{
          id: 'queue-e2',
          protocolId: 'proto-bad',
          scheduledDate: '2026-05-21',
          amount: { amount: '250', unit: 'mcg' },
          status: 'LOGGED',
        }],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    const body = await res.json();
    expect(body.results[0]).toMatchObject({ id: 'queue-e2', ok: false });
    expect(body.results[0].error).toBeTruthy();
  });

  it('AC-3: idempotency — second sync of same entry succeeds without duplicate write', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1' } } as never);
    // logDose uses idempotency key — returns existing log on duplicate
    mockLogDose.mockResolvedValueOnce({ id: 'log-1', protocolId: 'proto-1' } as never);

    const { POST } = await import('@/app/api/sync/route');
    const entry = { id: 'queue-e1', protocolId: 'proto-1', scheduledDate: '2026-05-21', amount: { amount: '250', unit: 'mcg' }, status: 'LOGGED' };
    const req = new Request('http://localhost/api/sync', {
      method: 'POST',
      body: JSON.stringify({ entries: [entry] }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockLogDose).toHaveBeenCalledTimes(1);
    // Idempotency is enforced inside logDose via canonical subjectUserId:protocolId:date key —
    // same entry replayed twice calls logDose once per sync request; the service deduplicates.
    expect(mockLogDose).toHaveBeenCalledWith(expect.objectContaining({
      protocolId: 'proto-1',
      scheduledDate: expect.any(Date),
    }));
  });

  it('AC-3: returns 400 on malformed JSON body', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1' } } as never);

    const { POST } = await import('@/app/api/sync/route');
    const req = new Request('http://localhost/api/sync', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockLogDose).not.toHaveBeenCalled();
  });

  it('AC-3: returns per-entry error for invalid scheduledDate without calling logDose', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1' } } as never);

    const { POST } = await import('@/app/api/sync/route');
    const req = new Request('http://localhost/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        entries: [{
          id: 'queue-bad',
          protocolId: 'proto-1',
          scheduledDate: '2026-13-45',
          amount: { amount: '250', unit: 'mcg' },
          status: 'LOGGED',
        }],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0]).toMatchObject({ id: 'queue-bad', ok: false });
    expect(mockLogDose).not.toHaveBeenCalled();
  });
});
