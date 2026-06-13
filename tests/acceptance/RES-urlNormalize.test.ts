import { describe, it, expect } from 'vitest';
import { normalizeUrl, isHttpUrl } from '@/lib/research/domain/urlNormalize';

describe('normalizeUrl', () => {
  it('lowercases host, drops trailing slash, fragment, and tracking params', () => {
    expect(normalizeUrl('HTTPS://Example.com/Path/?utm_source=x&q=1#frag'))
      .toBe('https://example.com/Path?q=1');
  });
  it('treats http and https as equal by normalizing scheme to https', () => {
    expect(normalizeUrl('http://example.com/a')).toBe(normalizeUrl('https://example.com/a'));
  });
  it('returns the raw trimmed string when not a valid URL', () => {
    expect(normalizeUrl('  not a url ')).toBe('not a url');
  });
});

describe('isHttpUrl', () => {
  it('accepts http(s) and rejects other schemes', () => {
    expect(isHttpUrl('https://x.com')).toBe(true);
    expect(isHttpUrl('http://x.com')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('data:text/html,x')).toBe(false);
    expect(isHttpUrl('ftp://x.com')).toBe(false);
    expect(isHttpUrl('garbage')).toBe(false);
  });
});
