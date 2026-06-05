// Auth-scoping exception (see CLAUDE.md + AGENTS.md): Compound/CompoundProfile/Citation
// are admin-curated global reference data. No userId column exists on these
// models. All authenticated users have full read access to the catalog.
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import type {
  AdjunctCategory,
  AdjunctSafetyCategory,
  Compound,
  DoseAmount,
  EvidenceQuality,
  MissingCompoundAction,
} from '../domain/types';
import { parseCompoundDosing, parseBenefitTimeline } from '../domain/validation';

const profileInclude = {
  include: { citations: true },
};

const sourcePairingsInclude = {
  include: {
    pairedCompound: {
      select: { name: true, slug: true },
    },
    citations: {
      include: {
        citation: true,
      },
    },
  },
  orderBy: [{ sortOrder: 'asc' as const }, { pairedCompoundName: 'asc' as const }],
};

const sourceAdjunctRecommendationsInclude = {
  include: {
    adjunct: true,
    citations: {
      include: {
        citation: true,
      },
    },
  },
  orderBy: [{ sortOrder: 'asc' as const }, { benefitGoal: 'asc' as const }],
};

type PrismaCompoundResult = Prisma.CompoundGetPayload<{
  include: {
    profile: typeof profileInclude;
    sourcePairings: typeof sourcePairingsInclude;
    sourceAdjunctRecommendations: typeof sourceAdjunctRecommendationsInclude;
  };
}>;

function parseDoseAmount(value: Prisma.JsonValue, _field: string): DoseAmount {
  return parseCompoundDosing(value);
}

function parseEvidenceQuality(value: string): EvidenceQuality {
  const allowed = new Set<EvidenceQuality>([
    'human_strong',
    'human_limited',
    'mechanistic',
    'preclinical',
    'expert_consensus',
  ]);
  return allowed.has(value as EvidenceQuality) ? (value as EvidenceQuality) : 'expert_consensus';
}

function parseMissingCompoundAction(value: string): MissingCompoundAction {
  const allowed = new Set<MissingCompoundAction>([
    'none',
    'add_complete_compound',
    'defer_candidate',
  ]);
  return allowed.has(value as MissingCompoundAction) ? (value as MissingCompoundAction) : 'none';
}

function parseAdjunctCategory(value: string): AdjunctCategory {
  const allowed = new Set<AdjunctCategory>([
    'SUPPLEMENT',
    'MINERAL',
    'MEDICATION',
    'LIFESTYLE_PROTOCOL',
    'LAB_MONITORING',
    'SAFETY_MITIGATION',
  ]);
  return allowed.has(value as AdjunctCategory) ? (value as AdjunctCategory) : 'SUPPLEMENT';
}

function parseAdjunctSafetyCategory(value: string): AdjunctSafetyCategory {
  const allowed = new Set<AdjunctSafetyCategory>([
    'CONTRAINDICATED',
    'CLINICIAN_SUPERVISION',
    'LAB_MONITORING_RECOMMENDED',
    'TIMING_SENSITIVE',
    'INTERACTION_SENSITIVE',
    'SAFETY_MITIGATION',
    'OPTIONAL_SUPPORTIVE_MEASURE',
  ]);
  return allowed.has(value as AdjunctSafetyCategory)
    ? (value as AdjunctSafetyCategory)
    : 'OPTIONAL_SUPPORTIVE_MEASURE';
}

function mapCompound(raw: PrismaCompoundResult): Compound {
  const sourcePairings = raw.sourcePairings ?? [];
  const sourceAdjunctRecommendations = raw.sourceAdjunctRecommendations ?? [];

  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    iupacName: raw.iupacName,
    synonyms: raw.synonyms,
    mechanismOfAction: raw.mechanismOfAction,
    administrationRoutes: raw.administrationRoutes,
    status: raw.status,
    tags: raw.tags,
    archivedAt: raw.archivedAt,
    profile: raw.profile
      ? {
          id: raw.profile.id,
          compoundId: raw.profile.compoundId,
          dosingLow: parseDoseAmount(raw.profile.dosingLow, 'dosingLow'),
          dosingTypical: parseDoseAmount(raw.profile.dosingTypical, 'dosingTypical'),
          dosingHigh: parseDoseAmount(raw.profile.dosingHigh, 'dosingHigh'),
          sideEffects: raw.profile.sideEffects,
          stackingNotes: raw.profile.stackingNotes,
          reconstitutedShelfLifeDays: raw.profile.reconstitutedShelfLifeDays,
          fridgeShelfLifeMonths: raw.profile.fridgeShelfLifeMonths,
          freezerShelfLifeMonths: raw.profile.freezerShelfLifeMonths,
          citations: raw.profile.citations,
          benefitTimeline: parseBenefitTimeline(raw.profile.benefitTimeline),
          cycleLengthWeeks: raw.profile.cycleLengthWeeks,
          restPeriodWeeks: raw.profile.restPeriodWeeks,
          dosingFrequency: raw.profile.dosingFrequency,
          dosesPerDay: raw.profile.dosesPerDay,
          customFrequencyDescription: raw.profile.customFrequencyDescription,
          daysOn: raw.profile.daysOn,
          daysOff: raw.profile.daysOff,
          preferredTime: raw.profile.preferredTime,
          timingNotes: raw.profile.timingNotes,
          isFdaApproved: raw.profile.isFdaApproved,
          pairings: sourcePairings.map((pairing) => ({
            id: pairing.id,
            sourceCompoundId: pairing.sourceCompoundId,
            pairedCompoundId: pairing.pairedCompoundId,
            pairedCompoundName: pairing.pairedCompound?.name ?? pairing.pairedCompoundName,
            pairedCompoundSlug: pairing.pairedCompound?.slug ?? null,
            benefitGoal: pairing.benefitGoal,
            rationale: pairing.rationale,
            expectedSynergy: pairing.expectedSynergy,
            evidenceQuality: parseEvidenceQuality(pairing.evidenceQuality),
            safetyCaveats: pairing.safetyCaveats,
            avoidIf: pairing.avoidIf,
            timingOrSequencingNotes: pairing.timingOrSequencingNotes,
            bestOverall: pairing.bestOverall,
            partnerExistsInCatalog: pairing.partnerExistsInCatalog,
            missingCompoundAction: parseMissingCompoundAction(pairing.missingCompoundAction),
            citationRefs: pairing.citations.map((pairingCitation) => pairingCitation.citation),
          })),
          adjuncts: sourceAdjunctRecommendations.map((recommendation) => ({
            id: recommendation.id,
            sourceCompoundId: recommendation.sourceCompoundId,
            adjunctId: recommendation.adjunctId,
            adjunctName: recommendation.adjunct.name,
            adjunctSlug: recommendation.adjunct.slug,
            adjunctCategory: parseAdjunctCategory(recommendation.adjunct.category),
            adjunctDescription: recommendation.adjunct.description,
            adjunctEvidenceSummary: recommendation.adjunct.evidenceSummary,
            adjunctSafetyNotes: recommendation.adjunct.safetyNotes,
            benefitGoal: recommendation.benefitGoal,
            rationale: recommendation.rationale,
            expectedBenefit: recommendation.expectedBenefit,
            evidenceQuality: parseEvidenceQuality(recommendation.evidenceQuality),
            safetyCategory: parseAdjunctSafetyCategory(recommendation.safetyCategory),
            safetyCaveats: recommendation.safetyCaveats,
            avoidIf: recommendation.avoidIf,
            implementationNotes: recommendation.implementationNotes,
            citationRefs: recommendation.citations.map(
              (recommendationCitation) => recommendationCitation.citation
            ),
          })),
        }
      : null,
  };
}

export async function findCompoundBySlug(slug: string): Promise<Compound | null> {
  const raw = await prisma.compound.findFirst({
    where: { slug: slug.toLowerCase() },
    include: {
      profile: profileInclude,
      sourcePairings: sourcePairingsInclude,
      sourceAdjunctRecommendations: sourceAdjunctRecommendationsInclude,
    },
  });
  return raw ? mapCompound(raw) : null;
}

export async function findCompounds(
  query: string,
  category?: string
): Promise<Compound[]> {
  const where: Prisma.CompoundWhereInput = {
    status: 'PUBLISHED',
  };

  if (query) {
    // name: partial case-insensitive match; synonyms: exact-match against the
    // stored lowercase synonym (Prisma 'has' is case-sensitive; synonyms are
    // stored lowercase in seed so callers should lowercase the query too).
    where.OR = [
      { name: { contains: query, mode: 'insensitive' } },
      { synonyms: { has: query.toLowerCase() } },
    ];
  }

  if (category) {
    where.tags = { has: category };
  }

  const rows = await prisma.compound.findMany({
    where,
    include: {
      profile: profileInclude,
      sourcePairings: sourcePairingsInclude,
      sourceAdjunctRecommendations: sourceAdjunctRecommendationsInclude,
    },
  });
  return rows.map(mapCompound);
}

export async function findCompoundById(id: string): Promise<{ name: string; slug: string } | null> {
  return prisma.compound.findUnique({
    where: { id },
    select: { name: true, slug: true },
  });
}

export async function findCompoundsByIds(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await prisma.compound.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

export async function getReconstitutedShelfLifeDays(compoundId: string): Promise<number | null> {
  const profile = await prisma.compoundProfile.findFirst({
    where: { compoundId },
    select: { reconstitutedShelfLifeDays: true },
  });
  return profile?.reconstitutedShelfLifeDays ?? null;
}

export async function getFreezerShelfLifeMonths(compoundId: string): Promise<number | null> {
  const profile = await prisma.compoundProfile.findFirst({
    where: { compoundId },
    select: { freezerShelfLifeMonths: true },
  });
  return profile?.freezerShelfLifeMonths ?? null;
}

export async function getFridgeShelfLifeMonths(compoundId: string): Promise<number | null> {
  const profile = await prisma.compoundProfile.findFirst({
    where: { compoundId },
    select: { fridgeShelfLifeMonths: true },
  });
  return profile?.fridgeShelfLifeMonths ?? null;
}

export async function listCompounds(opts?: { includeArchived?: boolean }): Promise<Compound[]> {
  const where: Prisma.CompoundWhereInput = {};

  if (!opts?.includeArchived) {
    where.status = 'PUBLISHED';
  }

  const rows = await prisma.compound.findMany({
    where,
    include: {
      profile: profileInclude,
      sourcePairings: sourcePairingsInclude,
      sourceAdjunctRecommendations: sourceAdjunctRecommendationsInclude,
    },
    orderBy: { name: 'asc' },
  });
  return rows.map(mapCompound);
}

export async function getCompoundsMinimal(): Promise<{ id: string; name: string; slug: string }[]> {
  return prisma.compound.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  });
}
