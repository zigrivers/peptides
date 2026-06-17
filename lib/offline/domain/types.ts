export type DoseUnit = 'mcg' | 'mg' | 'IU' | 'mL';

export interface QueuedDoseLog {
  id?: string;
  protocolId: string;
  scheduledDate: string;
  /** Per-day dose slot (0 = first/morning dose, 1 = second/evening dose). Defaults to 0. */
  doseSlot: number;
  deviceId: string;
  amount: { amount: string; unit: DoseUnit };
  status: 'LOGGED' | 'SKIPPED';
  synced: boolean;
  queuedAt?: number;
  injectionSite?: { bodyPart: string; side: 'left' | 'right' } | null;
  note?: string;
}

// doseSlot is optional on input (defaults to 0 on enqueue) so once-daily callers
// that pre-date twice-daily support keep working unchanged.
export type EnqueueInput = Omit<QueuedDoseLog, 'synced' | 'id' | 'queuedAt' | 'doseSlot'> & {
  doseSlot?: number;
};

export type EnqueueResult = { ok: true; id: string } | { ok: false; error: string };

