import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockTavilySearch = vi.fn();
const mockTavily = vi.fn((..._a: unknown[]) => ({ search: mockTavilySearch }));
const mockDdgSearch = vi.fn();

vi.mock('@tavily/core', () => ({ tavily: (...a: unknown[]) => mockTavily(...a) }));
vi.mock('duck-duck-scrape', () => ({
  search: (...a: unknown[]) => mockDdgSearch(...a),
  SafeSearchType: { STRICT: 0, MODERATE: 1, OFF: -2 },
}));

import { webSearch, __resetWebSearchCacheForTesting } from '@/lib/research/infrastructure/webSearch';

const ORIG_ENV = { ...process.env };

describe('webSearch', () => {
  beforeEach(() => {
    __resetWebSearchCacheForTesting();
    mockTavilySearch.mockReset();
    mockTavily.mockClear();
    mockDdgSearch.mockReset();
    process.env = { ...ORIG_ENV };
  });
  afterEach(() => { process.env = { ...ORIG_ENV }; });

  it('uses Tavily when TAVILY_API_KEY is set and maps rawContent into content', async () => {
    process.env.WEB_SEARCH_PROVIDER = 'tavily';
    process.env.TAVILY_API_KEY = 'k';
    mockTavilySearch.mockResolvedValue({
      results: [{ title: 'T', url: 'https://a.com', content: 'snip', rawContent: 'full text' }],
    });
    const out = await webSearch('bpc-157 healing', { maxResults: 5 });
    expect(out).toEqual([{ title: 'T', url: 'https://a.com', snippet: 'snip', content: 'full text' }]);
    expect(mockTavilySearch).toHaveBeenCalledWith(
      'bpc-157 healing',
      expect.objectContaining({ searchDepth: 'basic', includeRawContent: 'markdown', maxResults: 5 })
    );
  });

  it('falls back to DDG when TAVILY_API_KEY is missing (snippet-only, no content)', async () => {
    process.env.WEB_SEARCH_PROVIDER = 'tavily';
    delete process.env.TAVILY_API_KEY;
    mockDdgSearch.mockResolvedValue({
      noResults: false,
      results: [{ title: 'D', url: 'https://b.com', description: 'desc' }],
    });
    const out = await webSearch('q', { maxResults: 5 });
    expect(out).toEqual([{ title: 'D', url: 'https://b.com', snippet: 'desc', content: undefined }]);
    expect(mockTavily).not.toHaveBeenCalled();
  });

  it('falls back to DDG when Tavily throws', async () => {
    process.env.TAVILY_API_KEY = 'k';
    mockTavilySearch.mockRejectedValue(new Error('tavily 500'));
    mockDdgSearch.mockResolvedValue({ noResults: false, results: [{ title: 'D', url: 'https://b.com', description: 'd' }] });
    const out = await webSearch('q', { maxResults: 5 });
    expect(out[0].url).toBe('https://b.com');
  });

  it('returns [] when DDG yields no results (caller surfaces "unavailable")', async () => {
    delete process.env.TAVILY_API_KEY;
    mockDdgSearch.mockResolvedValue({ noResults: true, results: [] });
    expect(await webSearch('q', { maxResults: 5 })).toEqual([]);
  });

  it('does not throw when DDG throws an anomaly error; returns []', async () => {
    delete process.env.TAVILY_API_KEY;
    mockDdgSearch.mockRejectedValue(new Error('anomaly detected'));
    expect(await webSearch('q', { maxResults: 5 })).toEqual([]);
  });

  it('caches identical queries (provider called once)', async () => {
    process.env.TAVILY_API_KEY = 'k';
    mockTavilySearch.mockResolvedValue({ results: [{ title: 'T', url: 'https://a.com', content: 's' }] });
    await webSearch('same', { maxResults: 5 });
    await webSearch('same', { maxResults: 5 });
    expect(mockTavilySearch).toHaveBeenCalledTimes(1);
  });
});
