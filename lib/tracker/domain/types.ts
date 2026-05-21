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

export type DoseLogStatus = 'LOGGED' | 'SKIPPED';

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
};

export type SafetyWarning = {
  code: 'insufficient_inventory' | 'vial_expiry_warning' | 'dose_above_high_range';
  message: string;
};

export type LogDoseInput = {
  actorUserId: string;
  protocolId: string;
  scheduledDate: Date;
  amount: DoseAmount;
  status: DoseLogStatus;
  injectionSite?: InjectionSite;
  note?: string;
  vialId?: string;
};

export type LogDoseResult = {
  doseLog: DoseLog;
  warnings: SafetyWarning[];
};
