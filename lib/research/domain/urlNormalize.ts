const TRACKING_PREFIXES = ['utm_', 'fbclid', 'gclid', 'mc_eid', 'ref'];

/**
 * Canonicalize a URL for set-membership comparison between model-cited URLs
 * and the URLs we actually fetched. Scheme is folded to https, host lowercased,
 * trailing slash + fragment + tracking params stripped. Path/query case is
 * preserved (paths can be case-sensitive). Non-URLs return the trimmed input.
 */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return trimmed;
  u.protocol = 'https:';
  u.host = u.host.toLowerCase();
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PREFIXES.some((p) => key.toLowerCase().startsWith(p))) {
      u.searchParams.delete(key);
    }
  }
  let out = u.toString();
  // Strip a trailing slash on the path (but keep a bare-host slash off too).
  out = out.replace(/\/(?=$|\?)/, '');
  // URL serialization re-adds "?" only if params remain; drop a dangling "?".
  out = out.replace(/\?$/, '');
  return out;
}

export function isHttpUrl(input: string): boolean {
  try {
    const u = new URL(input.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
