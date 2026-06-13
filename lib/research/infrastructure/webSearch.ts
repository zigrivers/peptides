import type { WebSearchResult } from '../domain/types';

interface WebSearchOptions {
  maxResults?: number;
}

// Small in-memory cache (per process) keyed by normalized query+limit.
const cache = new Map<string, { at: number; results: WebSearchResult[] }>();
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_KEYS = 500;

function provider(): 'tavily' | 'ddg' {
  return process.env.WEB_SEARCH_PROVIDER === 'ddg' ? 'ddg' : 'tavily';
}

async function searchTavily(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const { tavily } = await import('@tavily/core');
  const client = tavily({ apiKey: process.env.TAVILY_API_KEY as string });
  const res = await client.search(query, {
    searchDepth: 'basic',
    maxResults,
    includeRawContent: 'markdown',
  });
  const results = (res?.results ?? []) as { title: string; url: string; content?: string; rawContent?: string }[];
  return results.map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content ?? '',
    content: r.rawContent,
  }));
}

async function searchDdg(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const ddg = await import('duck-duck-scrape');
  const res = await ddg.search(query, { safeSearch: ddg.SafeSearchType.MODERATE });
  if (!res || res.noResults || !Array.isArray(res.results)) return [];
  return res.results.slice(0, maxResults).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.description ?? '',
    content: undefined,
  }));
}

async function retry<T>(fn: () => Promise<T>, attempts: number, baseDelayMs: number): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseDelayMs * (i + 1)));
    }
  }
  throw lastErr;
}

/**
 * Server-only web search. Tavily primary (cleaned page text via rawContent),
 * DDG fallback (snippet-only). Passes ONLY the query string to providers; the
 * server never fetches model/result URLs itself (SSRF boundary, ADR-017).
 */
export async function webSearch(query: string, opts: WebSearchOptions = {}): Promise<WebSearchResult[]> {
  const maxResults = opts.maxResults ?? 5;
  const prov = provider();
  const useTavily = prov === 'tavily' && !!process.env.TAVILY_API_KEY;
  const key = `${useTavily ? 'tavily' : 'ddg'}:${maxResults}:${query.trim().toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.results;
  let results: WebSearchResult[] = [];

  if (useTavily) {
    try {
      results = await searchTavily(query, maxResults);
      console.warn('[webSearch] served by tavily');
    } catch (err) {
      console.warn('[webSearch] tavily failed, falling back to ddg:', (err as Error).message);
      results = [];
    }
  }

  if (results.length === 0) {
    try {
      results = await retry(() => searchDdg(query, maxResults), 2, 400);
      console.warn('[webSearch] served by ddg');
    } catch (err) {
      console.warn('[webSearch] ddg failed:', (err as Error).message);
      results = [];
    }
  }

  if (cache.size >= CACHE_MAX_KEYS) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), results });
  return results;
}

export function __resetWebSearchCacheForTesting(): void {
  cache.clear();
}
