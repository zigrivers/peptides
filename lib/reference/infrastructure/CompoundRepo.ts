// Auth-scoping exception (see CLAUDE.md): Compound/CompoundProfile/Citation
// are admin-curated global reference data. No userId column exists on these
// models. All authenticated users have full read access to the catalog.
import { prisma } from '@/lib/shared/prisma';
import type { Compound, DoseAmount } from '../domain/types';

type PrismaCompoundResult = {
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
  profile: {
    id: string;
    compoundId: string;
    dosingLow: unknown;
    dosingTypical: unknown;
    dosingHigh: unknown;
    sideEffects: string | null;
    stackingNotes: string | null;
    citations: {
      id: string;
      profileId: string;
      title: string;
      url: string | null;
      doi: string | null;
      pmid: string | null;
    }[];
  } | null;
};

function mapCompound(raw: PrismaCompoundResult): Compound {
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
          dosingLow: raw.profile.dosingLow as DoseAmount,
          dosingTypical: raw.profile.dosingTypical as DoseAmount,
          dosingHigh: raw.profile.dosingHigh as DoseAmount,
          sideEffects: raw.profile.sideEffects,
          stackingNotes: raw.profile.stackingNotes,
          citations: raw.profile.citations,
        }
      : null,
  };
}

const profileInclude = {
  include: { citations: true },
};

export async function findCompoundBySlug(slug: string): Promise<Compound | null> {
  const raw = await prisma.compound.findFirst({
    where: { slug: slug.toLowerCase() },
    include: { profile: profileInclude },
  });
  return raw ? mapCompound(raw as PrismaCompoundResult) : null;
}

export async function findCompounds(
  query: string,
  category?: string
): Promise<Compound[]> {
  const where: Record<string, unknown> = {
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
    include: { profile: profileInclude },
  });
  return (rows as PrismaCompoundResult[]).map(mapCompound);
}

export async function listCompounds(opts?: { includeArchived?: boolean }): Promise<Compound[]> {
  const where: Record<string, unknown> = {};

  if (!opts?.includeArchived) {
    where.status = 'PUBLISHED';
  }

  const rows = await prisma.compound.findMany({
    where,
    include: { profile: profileInclude },
    orderBy: { name: 'asc' },
  });
  return (rows as PrismaCompoundResult[]).map(mapCompound);
}
