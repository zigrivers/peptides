export type DoseAmount = {
  amount: string;
  unit: string;
};

export type Citation = {
  id: string;
  profileId: string;
  title: string;
  url: string | null;
  doi: string | null;
  pmid: string | null;
};

export type CompoundProfile = {
  id: string;
  compoundId: string;
  dosingLow: DoseAmount;
  dosingTypical: DoseAmount;
  dosingHigh: DoseAmount;
  sideEffects: string | null;
  stackingNotes: string | null;
  citations: Citation[];
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
