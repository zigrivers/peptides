import { openDB, type IDBPDatabase } from 'idb';
import type { QueuedDoseLog, EnqueueInput, EnqueueResult } from '../domain/types';

const DB_NAME = 'peptides-offline';
const DB_VERSION = 1;
const STORE = 'dose-queue';

type QueueDB = {
  [STORE]: {
    key: string;
    value: QueuedDoseLog & { id: string };
    indexes: Record<never, never>;
  };
};

function dedupeKey(entry: Pick<EnqueueInput, 'protocolId' | 'scheduledDate' | 'deviceId'>): string {
  return `${entry.protocolId}|${entry.scheduledDate}|${entry.deviceId}`;
}

export class OfflineQueue {
  private dbPromise: Promise<IDBPDatabase<QueueDB>>;

  constructor() {
    this.dbPromise = openDB<QueueDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: false });
      },
    });
  }

  async enqueue(input: EnqueueInput): Promise<EnqueueResult> {
    const db = await this.dbPromise;
    const key = dedupeKey(input);

    const existing = await db.get(STORE, key);
    if (existing) {
      return { ok: false, error: 'duplicate: entry already queued for this protocol/date/device' };
    }

    const entry: QueuedDoseLog & { id: string } = {
      id: key,
      ...input,
      synced: false,
      queuedAt: Date.now(),
    };

    await db.add(STORE, entry);

    // Request Background Sync so the SW can replay this entry when connectivity returns.
    // Falls back silently on browsers that don't support the Background Sync API (e.g. iOS Safari).
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        if ('sync' in reg) {
          (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } })
            .sync.register('dose-sync').catch(() => null);
        }
      }).catch(() => null);
    }

    return { ok: true, id: key };
  }

  async getPending(): Promise<(QueuedDoseLog & { id: string })[]> {
    const db = await this.dbPromise;
    const all = await db.getAll(STORE);
    return all.filter((e) => !e.synced);
  }

  async markSynced(id: string): Promise<void> {
    const db = await this.dbPromise;
    const entry = await db.get(STORE, id);
    if (!entry) return;
    await db.put(STORE, { ...entry, synced: true });
  }
}
