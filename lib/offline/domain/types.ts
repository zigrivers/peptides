export type DoseUnit = 'mcg' | 'mg' | 'IU' | 'mL';

export interface QueuedDoseLog {
  id?: string;
  protocolId: string;
  scheduledDate: string;
  deviceId: string;
  amount: { amount: string; unit: DoseUnit };
  status: 'LOGGED' | 'SKIPPED';
  synced: boolean;
  queuedAt?: number;
  injectionSite?: { bodyPart: string; side: 'left' | 'right' } | null;
  note?: string;
}

export type EnqueueInput = Omit<QueuedDoseLog, 'synced' | 'id' | 'queuedAt'>;

export type EnqueueResult = { ok: true; id: string } | { ok: false; error: string };

