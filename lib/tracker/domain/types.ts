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
