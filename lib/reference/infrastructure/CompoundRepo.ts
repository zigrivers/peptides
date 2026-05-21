import { prisma } from '@/lib/shared/prisma';
import type { Compound, ListCompoundsOptions } from '../domain/types';

const profileInclude = {
  include: { citations: true },
};

export async function findCompoundBySlug(slug: string): Promise<Compound | null> {
  return prisma.compound.findFirst({
    where: { name: { equals: slug, mode: 'insensitive' } },
    include: { profile: profileInclude },
  }) as Promise<Compound | null>;
}

export async function findCompounds(
  query: string,
  category?: string
): Promise<Compound[]> {
  const where: Record<string, unknown> = {};

  if (query) {
    where.OR = [
      { name: { contains: query, mode: 'insensitive' } },
      { synonyms: { has: query } },
    ];
  }

  if (category) {
    where.tags = { has: category };
  }

  return prisma.compound.findMany({
    where,
    include: { profile: profileInclude },
  }) as Promise<Compound[]>;
}

export async function listCompounds(opts?: ListCompoundsOptions): Promise<Compound[]> {
  const where: Record<string, unknown> = {};

  if (!opts?.includeArchived) {
    where.status = 'PUBLISHED';
  }

  return prisma.compound.findMany({
    where,
    include: { profile: profileInclude },
    orderBy: { name: 'asc' },
  }) as Promise<Compound[]>;
}
