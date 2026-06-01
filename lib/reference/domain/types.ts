export type DoseAmount = {
  amount: string;
  unit: string;
  researchBenefits?: string;
  recommendedFrequency?: string;
};

export type Citation = {
  id: string;
  profileId: string;
  title: string;
  url: string | null;
  doi: string | null;
  pmid: string | null;
};

export type BenefitTimelineItem = {
  week: number;
  benefits: string[];
};

export type DosingFrequency =
  | 'DAILY'
  | 'EOD'
  | 'THRICE_WEEKLY'
  | 'WEEKLY'
  | 'TWICE_WEEKLY'
  | 'EVERY_TWO_WEEKS'
  | 'EVERY_FOUR_WEEKS'
  | 'AS_NEEDED'
  | 'CUSTOM';

export type PreferredTime =
  | 'MORNING'
  | 'AFTERNOON'
  | 'NIGHT'
  | 'PRE_WORKOUT'
  | 'POST_WORKOUT'
  | 'MORNING_AND_NIGHT'
  | 'MORNING_AFTERNOON_NIGHT'
  | 'PRE_AND_POST_WORKOUT'
  | 'ANYTIME'
  | 'AS_NEEDED';

export type CompoundProfile = {
  id: string;
  compoundId: string;
  dosingLow: DoseAmount;
  dosingTypical: DoseAmount;
  dosingHigh: DoseAmount;
  sideEffects: string | null;
  stackingNotes: string | null;
  reconstitutedShelfLifeDays: number | null;
  fridgeShelfLifeMonths: number | null;
  freezerShelfLifeMonths: number | null;
  citations: Citation[];
  benefitTimeline: BenefitTimelineItem[] | null;
  cycleLengthWeeks: number | null;
  restPeriodWeeks: number | null;
  dosingFrequency: DosingFrequency | null;
  dosesPerDay: number | null;
  customFrequencyDescription: string | null;
  daysOn: number | null;
  daysOff: number | null;
  preferredTime: PreferredTime | null;
  timingNotes: string | null;
  isFdaApproved: boolean;
};

export type Compound = {
  id: string;
  name: string;
  slug: string;
  iupacName: string | null;
  synonyms: string[];
  mechanismOfAction: string | null;
  administrationRoutes: string[];
  status: string;
  tags: string[];
  archivedAt: Date | null;
  profile: CompoundProfile | null;
};

export type ListCompoundsOptions = {
  includeArchived?: boolean;
};
