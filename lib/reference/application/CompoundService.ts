import type { Compound, ListCompoundsOptions } from '../domain/types';
import {
  findCompoundBySlug,
  findCompounds,
  listCompounds as repoListCompounds,
} from '../infrastructure/CompoundRepo';

export async function getCompoundBySlug(slug: string): Promise<Compound | null> {
  return findCompoundBySlug(slug);
}

export async function searchCompounds(
  query: string,
  category?: string
): Promise<Compound[]> {
  return findCompounds(query, category);
}

export async function listCompounds(opts?: ListCompoundsOptions): Promise<Compound[]> {
  return repoListCompounds(opts);
}
