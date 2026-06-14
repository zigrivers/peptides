import type { Prisma } from '@prisma/client';
import { webSearch } from '@/lib/research/infrastructure/webSearch';
import { normalizeUrl } from '../domain/urlNormalize';
import type { WebSearchResult } from '../domain/types';
import { prisma } from '@/lib/shared/prisma';
import { PrismaAuditRepo } from '@/lib/audit/infrastructure/PrismaAuditRepo';
import type { AIOperation } from '@/lib/ai/domain/types';

const OPERATION: AIOperation = 'compound_research';

export const STEP_TIMEOUT_MS = 240_000;
export const MAX_SOURCE_CONTENT_CHARS = 3000;
export const MAX_SOURCES_FOR_SYNTHESIS = 8;
export const MAX_TOTAL_SOURCE_CHARS = 24_000;
export const PER_QUERY_MAX_RESULTS = 5;

export function classify(err: unknown): 'timeout' | 'aborted' | 'invalid_schema' | 'provider_error' {
  if (!(err instanceof Error)) return 'provider_error';
  if (err.message === 'ai_timeout' || err.name === 'TimeoutError') return 'timeout';
  if (err.name === 'AbortError' || err.message === 'aborted') return 'aborted';
  if (err.name === 'ZodError' || err.message.includes('no_json')) return 'invalid_schema';
  return 'provider_error';
}

export async function emitResearchRunAudit(
  action: 'AI_REQUEST_INITIATED' | 'AI_REQUEST_FAILED',
  actorUserId: string,
  errors?: string[],
) {
  await PrismaAuditRepo.create(prisma as unknown as Prisma.TransactionClient, {
    actorUserId,
    category: 'Security',
    action,
    resourceId: OPERATION,
    resourceType: 'AIRequest',
    ...(errors ? { metadata: { errors } } : {}),
  }).catch(() => null);
}

/** Run searches for `queries`, dedupe into `sources` using the shared `seen` set. */
export async function runSearches(queries: string[], seen: Set<string>, sources: WebSearchResult[]): Promise<void> {
  for (const q of queries) {
    const results = await webSearch(q, { maxResults: PER_QUERY_MAX_RESULTS });
    for (const r of results) {
      const key = normalizeUrl(r.url);
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push(r);
    }
  }
}

/** Cap to MAX_SOURCES_FOR_SYNTHESIS then to MAX_TOTAL_SOURCE_CHARS; log drops. */
export function selectSources(sources: WebSearchResult[]): WebSearchResult[] {
  const capped = sources.slice(0, MAX_SOURCES_FOR_SYNTHESIS);
  const out: WebSearchResult[] = [];
  let total = 0;
  for (const s of capped) {
    const text = (s.content ?? s.snippet).slice(0, MAX_SOURCE_CONTENT_CHARS);
    if (total + text.length > MAX_TOTAL_SOURCE_CHARS) break;
    total += text.length;
    out.push(s);
  }
  const dropped = capped.length - out.length;
  if (dropped > 0) console.warn(`[compoundResearch] dropped ${dropped} sources over char budget`);
  return out;
}

export function buildSourceBlock(sources: WebSearchResult[]): string {
  return sources
    .map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\n${(s.content ?? s.snippet).slice(0, MAX_SOURCE_CONTENT_CHARS)}`)
    .join('\n\n');
}

/** Returns a fn that keeps only model-cited URLs present in `fetched`, mapped back to originals. */
export function makeKeepCited(fetched: WebSearchResult[]): (urls: string[]) => string[] {
  const fetchedSet = new Set(fetched.map((s) => normalizeUrl(s.url)));
  const fetchedByNorm = new Map(fetched.map((s) => [normalizeUrl(s.url), s.url] as const));
  return (urls) => urls.map(normalizeUrl).filter((u) => fetchedSet.has(u)).map((u) => fetchedByNorm.get(u) ?? u);
}
