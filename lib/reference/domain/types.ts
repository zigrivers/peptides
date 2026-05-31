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
