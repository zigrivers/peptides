type Window = { count: number; windowStart: number };

export function createRateLimiter(limit: number, windowMs: number) {
  const store = new Map<string, Window>();

  return {
    check(key: string): boolean {
      const now = Date.now();
      const entry = store.get(key);
      if (!entry || now - entry.windowStart > windowMs) {
        store.set(key, { count: 1, windowStart: now });
        return true;
      }
      if (entry.count >= limit) return false;
      entry.count++;
      return true;
    },
  };
}
