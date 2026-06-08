export type DoseAmount = {
  amount: string;
  unit: string;
  researchBenefits?: string;
  recommendedFrequency?: string;
};

export type CatalogItemKind = 'PEPTIDE' | 'SUPPLEMENT';
export type RevisionStatus = 'PUBLISHED' | 'PENDING_REVIEW';

export type Citation = {
  id: string;
  catalogItemId: string;
  title: string;
  url: string | null;
  doi: string | null;
  pmid: string | null;
};

export type EvidenceQuality =
  | 'human_strong'
  | 'human_limited'
  | 'mechanistic'
  | 'preclinical'
  | 'expert_consensus';

export type MissingCompoundAction =
  | 'none'
  | 'add_complete_compound'
  | 'defer_candidate';

export type CompoundPairingCitation = Citation;

export type CompoundPairing = {
  id: string;
  sourceCompoundId: string;
  pairedCompoundId: string | null;
  pairedCompoundName: string;
  pairedCompoundSlug: string | null;
  benefitGoal: string;
  rationale: string;
  expectedSynergy: string;
  evidenceQuality: EvidenceQuality;
  safetyCaveats: string;
  avoidIf: string;
  timingOrSequencingNotes: string | null;
  bestOverall: boolean;
  partnerExistsInCatalog: boolean;
  missingCompoundAction: MissingCompoundAction;
  citationRefs: CompoundPairingCitation[];
};

export type AdjunctCategory =
  | 'SUPPLEMENT'
  | 'MINERAL'
  | 'MEDICATION'
  | 'LIFESTYLE_PROTOCOL'
  | 'LAB_MONITORING'
  | 'SAFETY_MITIGATION';

export type AdjunctSafetyCategory =
  | 'CONTRAINDICATED'
  | 'CLINICIAN_SUPERVISION'
  | 'LAB_MONITORING_RECOMMENDED'
  | 'TIMING_SENSITIVE'
  | 'INTERACTION_SENSITIVE'
  | 'SAFETY_MITIGATION'
  | 'OPTIONAL_SUPPORTIVE_MEASURE';

export type CatalogAdjunctCitation = {
  id: string;
  adjunctId: string;
  title: string;
  url: string | null;
  doi: string | null;
  pmid: string | null;
};

export type CompoundAdjunctRecommendation = {
  id: string;
  sourceCompoundId: string;
  adjunctId: string;
  adjunctName: string;
  adjunctSlug: string;
  adjunctCategory: AdjunctCategory;
  adjunctDescription: string;
  adjunctEvidenceSummary: string;
  adjunctSafetyNotes: string;
  benefitGoal: string;
  rationale: string;
  expectedBenefit: string;
  evidenceQuality: EvidenceQuality;
  safetyCategory: AdjunctSafetyCategory;
  safetyCaveats: string;
  avoidIf: string;
  implementationNotes: string | null;
  citationRefs: CatalogAdjunctCitation[];
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
  catalogItemId: string;
  dosingLow: DoseAmount;
  dosingTypical: DoseAmount;
  dosingHigh: DoseAmount;
  sideEffects: string | null;
  stackingNotes: string | null;
  reconstitutedShelfLifeDays: number | null;
  fridgeShelfLifeMonths: number | null;
  freezerShelfLifeMonths: number | null;
  benefitTimeline: BenefitTimelineItem[] | null;
  cycleLengthWeeks: number | null;
  cycleRationale: string | null;
  restPeriodWeeks: number | null;
  restPeriodRationale: string | null;
  dosingFrequency: DosingFrequency | null;
  dosesPerDay: number | null;
  customFrequencyDescription: string | null;
  daysOn: number | null;
  daysOff: number | null;
  preferredTime: PreferredTime | null;
  timingNotes: string | null;
  isFdaApproved: boolean;
  pairings: CompoundPairing[];
  adjuncts: CompoundAdjunctRecommendation[];
};

export type SupplementProfile = {
  id: string;
  catalogItemId: string;
  form: string;
  servingSize: string;
  servingUnit: string;
  dosingLow: DoseAmount;
  dosingTypical: DoseAmount;
  dosingHigh: DoseAmount;
  benefitTimeline: BenefitTimelineItem[] | null;
  dosingFrequency: DosingFrequency | null;
  dosesPerDay: number | null;
  preferredTime: PreferredTime | null;
  timingNotes: string | null;
};

export type CatalogItemRevision = {
  id: string;
  catalogItemId: string;
  version: number;
  kind: CatalogItemKind;
  snapshot: unknown;
  source: string;
  createdAt: Date;
  publishedAt: Date | null;
};

export type CatalogItem = {
  id: string;
  catalogKey: string;
  kind: CatalogItemKind;
  name: string;
  slug: string;
  iupacName: string | null;
  synonyms: string[];
  mechanismOfAction: string | null;
  administrationRoutes: string[];
  sourceVersion: number;
  lastReviewedAt: Date | null;
  revisionStatus: RevisionStatus;
  status: string;
  tags: string[];
  archivedAt: Date | null;
  profile: CompoundProfile | null;
  supplementProfile: SupplementProfile | null;
  citations: Citation[];
  revisions: CatalogItemRevision[];
};

export type ListCompoundsOptions = {
  includeArchived?: boolean;
};

export type Compound = CatalogItem;
