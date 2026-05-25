// Auth-scoping exception (see CLAUDE.md + AGENTS.md): Compound/CompoundProfile/Citation
// are admin-curated global reference data. No userId column exists on these
// models. All authenticated users have full read access to the catalog.
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import type { Compound, DoseAmount } from '../domain/types';

type PrismaCompoundResult = Prisma.CompoundGetPayload<{
  include: {
    profile: {
      include: { citations: true };
    };
  };
}>;

function parseDoseAmount(value: Prisma.JsonValue, field: string): DoseAmount {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).amount === 'string' &&
    typeof (value as Record<string, unknown>).unit === 'string'
  ) {
    return value as unknown as DoseAmount;
  }
  throw new Error(`CompoundProfile.${field} is not a valid DoseAmount: ${JSON.stringify(value)}`);
}

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
          dosingLow: parseDoseAmount(raw.profile.dosingLow, 'dosingLow'),
          dosingTypical: parseDoseAmount(raw.profile.dosingTypical, 'dosingTypical'),
          dosingHigh: parseDoseAmount(raw.profile.dosingHigh, 'dosingHigh'),
          sideEffects: raw.profile.sideEffects,
          stackingNotes: raw.profile.stackingNotes,
          reconstitutedShelfLifeDays: raw.profile.reconstitutedShelfLifeDays,
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
    include: { profile: profileInclude },
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

export async function listCompounds(opts?: { includeArchived?: boolean }): Promise<Compound[]> {
  const where: Prisma.CompoundWhereInput = {};

  if (!opts?.includeArchived) {
    where.status = 'PUBLISHED';
  }

  const rows = await prisma.compound.findMany({
    where,
    include: { profile: profileInclude },
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

