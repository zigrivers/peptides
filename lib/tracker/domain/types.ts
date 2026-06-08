import type { DoseUnitsDisplay } from '@/lib/reconstitution/domain/doseUnits';
import Decimal from 'decimal.js';

export type DoseUnit = 'mcg' | 'mg' | 'IU' | 'mL';

export type DoseAmount = {
  amount: string; // Decimal-serialized string
  unit: DoseUnit;
};

export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export type Schedule =
  | { frequency: 'Daily' }
  | { frequency: 'EOD' }
  | { frequency: 'SpecificDaysOfWeek'; daysOfWeek: DayOfWeek[] }
  | { frequency: 'CustomInterval'; intervalDays: number };

export type ProtocolStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'DEACTIVATED';

export type Protocol = {
  id: string;
  userId: string;
  compoundId: string;
  cycleId: string | null;
  dose: DoseAmount;
  schedule: Schedule;
  administrationRoute: string;
  status: ProtocolStatus;
  startDate: Date;
  endDate: Date | null;
  notes: string | null;
  observedBenefits?: unknown;
};

export type CreateProtocolInput = {
  actorUserId: string;
  subjectUserId: string;
  compoundId: string;
  cycleId?: string;
  dose: DoseAmount;
  schedule: Schedule;
  administrationRoute: string;
  startDate: Date;
  endDate?: Date;
  notes?: string;
  initialVial?: {
    totalMg: string;
    bacWaterMl: string;
    expiresAt?: Date;
  };
};

export type UpdateProtocolInput = {
  actorUserId: string;
  protocolId: string;
  compoundId?: string;
  dose?: DoseAmount;
  schedule?: Schedule;
  administrationRoute?: string;
  startDate?: Date;
  endDate?: Date | null;
  notes?: string | null;
};

export type InjectionSite = {
  bodyPart: string;
  side: 'left' | 'right';
};

export type DoseLogStatus = 'LOGGED' | 'SKIPPED' | 'PENDING' | 'RESCHEDULED';

export type DoseLog = {
  id: string;
  protocolId: string;
  userId: string;
  vialId: string | null;
  idempotencyKey: string;
  loggedAt: Date;
  scheduledDate: Date;
  amount: DoseAmount;
  status: DoseLogStatus;
  injectionSite: InjectionSite | null;
  isBatchLog: boolean;
  note: string | null;
  loggedByUserId: string | null;
  loggedCost: Decimal | null;
  loggedCurrency: string | null;
};

export type SafetyWarning = {
  code: 'insufficient_inventory' | 'vial_expiry_warning' | 'dose_above_high_range';
  message: string;
};

export type LogDoseInput = {
  id?: string;
  actorUserId: string;
  protocolId: string;
  scheduledDate: Date;
  amount: DoseAmount;
  status: DoseLogStatus;
  injectionSite?: InjectionSite;
  note?: string;
  vialId?: string;
  /** When true, logDose enforces that a site is provided for injectable LOGGED doses. */
  requireInjectionSite?: boolean;
  /** When true, skips schedule validation checks (used for offline sync replay where current schedule might differ from the past schedule). */
  isOffline?: boolean;
};

export type LogDoseResult = {
  doseLog: DoseLog;
  warnings: SafetyWarning[];
};

export type CycleStatus = 'ACTIVE' | 'COMPLETED';

export type Cycle = {
  id: string;
  userId: string;
  name: string;
  startDate: Date;
  endDate: Date | null;
  status: CycleStatus;
};

export type CreateCycleInput = {
  actorUserId: string;
  name: string;
  startDate: Date;
  endDate?: Date;
};

export type RestartCycleInput = {
  actorUserId: string;
  cycleId: string;
  newStartDate: Date;
};

export type CycleWeekInfo = {
  cycleId: string;
  cycleName: string;
  weekNumber: number;
  totalWeeks: number | null;
};

export type BatchDueItem = {
  protocol: Protocol;
  existingLog: DoseLog | null;
  availableVials: number;
  isAvailable: boolean; // false when no inventory prevents logging
  safetyWarnings?: SafetyWarning[];
  doseUnits: DoseUnitsDisplay | null;
};

export type BatchLogInput = {
  actorUserId: string;
  selectedProtocolIds: string[];
  scheduledDate: Date;
};

export type BatchLogItemResult =
  | { ok: true; protocolId: string; doseLog: DoseLog; warnings: SafetyWarning[] }
  | { ok: false; protocolId: string; error: string };

export type BatchLogResult = {
  results: BatchLogItemResult[];
};
