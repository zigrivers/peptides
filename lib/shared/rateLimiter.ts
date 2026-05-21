type Window = { count: number; windowStart: number };

export function createRateLimiter(limit: number, windowMs: number, maxKeys = 10_000) {
  const store = new Map<string, Window>();

  function purgeExpired(now: number) {
    for (const [key, entry] of store) {
      if (now - entry.windowStart > windowMs) store.delete(key);
    }
  }

  return {
    check(key: string): boolean {
      const now = Date.now();
      const entry = store.get(key);
      if (!entry || now - entry.windowStart > windowMs) {
        // Evict expired entries before inserting a new key to bound Map size.
        if (!entry && store.size >= maxKeys) purgeExpired(now);
        store.set(key, { count: 1, windowStart: now });
        return true;
      }
      if (entry.count >= limit) return false;
      entry.count++;
      return true;
    },
  };
}
