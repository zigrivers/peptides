// Auth-scoping exception (see CLAUDE.md + AGENTS.md): CatalogItem/CompoundProfile/SupplementProfile/Citation
// are admin-curated global reference data. No userId column exists on these
// models. All authenticated users have full read access to the catalog.
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import type {
  AdjunctCategory,
  AdjunctSafetyCategory,
  CatalogItem,
  CatalogItemKind,
  DoseAmount,
  DosingFrequency,
  EvidenceQuality,
  MissingCompoundAction,
  PreferredTime,
  RevisionStatus,
} from '../domain/types';
import { parseCompoundDosing, parseBenefitTimeline } from '../domain/validation';

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

const itemInclude = {
  include: {
    profile: true,
    supplementProfile: true,
    citations: true,
    sourcePairings: sourcePairingsInclude,
    sourceAdjunctRecommendations: sourceAdjunctRecommendationsInclude,
  },
};

type PrismaCatalogItemResult = Prisma.CatalogItemGetPayload<typeof itemInclude>;

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

function mapCatalogItem(raw: PrismaCatalogItemResult): CatalogItem {
  const sourcePairings = raw.sourcePairings ?? [];
  const sourceAdjunctRecommendations = raw.sourceAdjunctRecommendations ?? [];

  return {
    id: raw.id,
    catalogKey: raw.catalogKey,
    kind: raw.kind as CatalogItemKind,
    name: raw.name,
    slug: raw.slug,
    iupacName: raw.iupacName,
    synonyms: raw.synonyms,
    mechanismOfAction: raw.mechanismOfAction,
    administrationRoutes: raw.administrationRoutes,
    sourceVersion: raw.sourceVersion,
    lastReviewedAt: raw.lastReviewedAt,
    revisionStatus: raw.revisionStatus as RevisionStatus,
    status: raw.status,
    tags: raw.tags,
    archivedAt: raw.archivedAt,
    profile: raw.profile
      ? {
          id: raw.profile.id,
          catalogItemId: raw.profile.catalogItemId,
          dosingLow: parseDoseAmount(raw.profile.dosingLow, 'dosingLow'),
          dosingTypical: parseDoseAmount(raw.profile.dosingTypical, 'dosingTypical'),
          dosingHigh: parseDoseAmount(raw.profile.dosingHigh, 'dosingHigh'),
          sideEffects: raw.profile.sideEffects,
          stackingNotes: raw.profile.stackingNotes,
          reconstitutedShelfLifeDays: raw.profile.reconstitutedShelfLifeDays,
          fridgeShelfLifeMonths: raw.profile.fridgeShelfLifeMonths,
          freezerShelfLifeMonths: raw.profile.freezerShelfLifeMonths,
          benefitTimeline: parseBenefitTimeline(raw.profile.benefitTimeline),
          cycleLengthWeeks: raw.profile.cycleLengthWeeks,
          cycleRationale: raw.profile.cycleRationale,
          restPeriodWeeks: raw.profile.restPeriodWeeks,
          restPeriodRationale: raw.profile.restPeriodRationale,
          dosingFrequency: raw.profile.dosingFrequency as DosingFrequency | null,
          dosesPerDay: raw.profile.dosesPerDay,
          customFrequencyDescription: raw.profile.customFrequencyDescription,
          daysOn: raw.profile.daysOn,
          daysOff: raw.profile.daysOff,
          preferredTime: raw.profile.preferredTime as PreferredTime | null,
          timingNotes: raw.profile.timingNotes,
          isFdaApproved: raw.profile.isFdaApproved,
          expectedBenefitsSummary: raw.profile.expectedBenefitsSummary,
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
    supplementProfile: raw.supplementProfile
      ? {
          id: raw.supplementProfile.id,
          catalogItemId: raw.supplementProfile.catalogItemId,
          form: raw.supplementProfile.form,
          servingSize: raw.supplementProfile.servingSize.toString(),
          servingUnit: raw.supplementProfile.servingUnit,
          dosingLow: parseDoseAmount(raw.supplementProfile.dosingLow, 'dosingLow'),
          dosingTypical: parseDoseAmount(raw.supplementProfile.dosingTypical, 'dosingTypical'),
          dosingHigh: parseDoseAmount(raw.supplementProfile.dosingHigh, 'dosingHigh'),
          benefitTimeline: parseBenefitTimeline(raw.supplementProfile.benefitTimeline),
          dosingFrequency: raw.supplementProfile.dosingFrequency as DosingFrequency | null,
          dosesPerDay: raw.supplementProfile.dosesPerDay,
          preferredTime: raw.supplementProfile.preferredTime as PreferredTime | null,
          timingNotes: raw.supplementProfile.timingNotes,
          expectedBenefitsSummary: raw.supplementProfile.expectedBenefitsSummary,
        }
      : null,
    citations: raw.citations.map((citation) => ({
      id: citation.id,
      catalogItemId: citation.catalogItemId,
      title: citation.title,
      url: citation.url,
      doi: citation.doi,
      pmid: citation.pmid,
    })),
    // Revisions are intentionally omitted from read paths to avoid loading large JSON snapshots;
    // they are managed via direct revision-history queries only when doing audit logs or admin history reviews.
    revisions: [],
  };
}

export async function findCatalogItemBySlug(slug: string): Promise<CatalogItem | null> {
  const raw = await prisma.catalogItem.findFirst({
    where: { slug: slug.toLowerCase() },
    ...itemInclude,
  });
  return raw ? mapCatalogItem(raw) : null;
}

export async function findCatalogItems(
  query: string,
  category?: string
): Promise<CatalogItem[]> {
  const where: Prisma.CatalogItemWhereInput = {
    status: 'PUBLISHED',
  };

  if (query) {
    where.OR = [
      { name: { contains: query, mode: 'insensitive' } },
      { synonyms: { has: query.toLowerCase() } },
    ];
  }

  if (category) {
    where.tags = { has: category };
  }

  const rows = await prisma.catalogItem.findMany({
    where,
    ...itemInclude,
  });
  return rows.map((row) => mapCatalogItem(row));
}

export async function findCatalogItemById(id: string): Promise<{ name: string; slug: string } | null> {
  return prisma.catalogItem.findUnique({
    where: { id },
    select: { name: true, slug: true },
  });
}

export async function findCatalogItemsByIds(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await prisma.catalogItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return Object.fromEntries(rows.map((row) => [row.id, row.name]));
}

export async function getReconstitutedShelfLifeDays(catalogItemId: string, tx?: Prisma.TransactionClient): Promise<number | null> {
  const client = tx || prisma;
  const profile = await client.compoundProfile.findFirst({
    where: { catalogItemId },
    select: { reconstitutedShelfLifeDays: true },
  });
  return profile?.reconstitutedShelfLifeDays ?? null;
}

export async function getFreezerShelfLifeMonths(catalogItemId: string, tx?: Prisma.TransactionClient): Promise<number | null> {
  const client = tx || prisma;
  const profile = await client.compoundProfile.findFirst({
    where: { catalogItemId },
    select: { freezerShelfLifeMonths: true },
  });
  return profile?.freezerShelfLifeMonths ?? null;
}

export async function getFridgeShelfLifeMonths(catalogItemId: string, tx?: Prisma.TransactionClient): Promise<number | null> {
  const client = tx || prisma;
  const profile = await client.compoundProfile.findFirst({
    where: { catalogItemId },
    select: { fridgeShelfLifeMonths: true },
  });
  return profile?.fridgeShelfLifeMonths ?? null;
}

export async function listCatalogItems(opts?: { includeArchived?: boolean }): Promise<CatalogItem[]> {
  const where: Prisma.CatalogItemWhereInput = {};

  if (!opts?.includeArchived) {
    where.status = 'PUBLISHED';
  }

  const rows = await prisma.catalogItem.findMany({
    where,
    ...itemInclude,
    orderBy: { name: 'asc' },
  });
  return rows.map((row) => mapCatalogItem(row));
}

export async function getCatalogItemsMinimal(): Promise<{ id: string; name: string; slug: string }[]> {
  return prisma.catalogItem.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  });
}

export const findCompoundById = findCatalogItemById;
export const findCompoundsByIds = findCatalogItemsByIds;
export const findCompoundBySlug = findCatalogItemBySlug;
export const findCompounds = findCatalogItems;
export const listCompounds = listCatalogItems;
export const getCompoundsMinimal = getCatalogItemsMinimal;
