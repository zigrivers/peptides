import { openDB, type IDBPDatabase } from 'idb';
import type { QueuedDoseLog, EnqueueInput, EnqueueResult } from '../domain/types';

const DB_NAME = 'peptides-offline';
const DB_VERSION = 1;
const STORE = 'dose-queue';

type QueueDB = {
  [STORE]: {
    key: string;
    value: QueuedDoseLog & { id: string };
    indexes: { 'by-key': string };
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
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: false });
        store.createIndex('by-key', 'id');
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
