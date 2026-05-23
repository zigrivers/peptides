import {
  isR2Configured,
  r2DeleteObject,
  r2ListObjects,
  r2PresignGetUrl,
  r2PutObject,
  R2NotConfiguredError,
} from '@/lib/shared/r2';

const EXPORT_PREFIX = 'exports/';
const EXPORT_OBJECT_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Build the canonical R2 key for an export. The format embeds the
 * requesting userId so the cleanup cron can recover ownership from
 * the key alone, and the requestId is the unique component so re-
 * requests don't overwrite each other within the same calendar day.
 */
export function buildExportObjectKey(userId: string, requestId: string): string {
  return `${EXPORT_PREFIX}${userId}/${requestId}.json`;
}

/**
 * Try to parse an export object key back into its components. Returns
 * `null` for keys that don't match the canonical shape (defensive — the
 * bucket could host non-export objects in the future).
 */
export function parseExportObjectKey(
  key: string
): { userId: string; requestId: string } | null {
  if (!key.startsWith(EXPORT_PREFIX)) return null;
  const rest = key.slice(EXPORT_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  const userId = rest.slice(0, slash);
  const remainder = rest.slice(slash + 1);
  if (!remainder.endsWith('.json')) return null;
  const requestId = remainder.slice(0, -'.json'.length);
  if (!userId || !requestId) return null;
  return { userId, requestId };
}

export interface StoredExport {
  key: string;
  downloadUrl: string;
  expiresAt: Date;
}

export async function storeExportInR2(input: {
  userId: string;
  requestId: string;
  body: Buffer;
}): Promise<StoredExport> {
  const key = buildExportObjectKey(input.userId, input.requestId);
  await r2PutObject({ key, body: input.body, contentType: 'application/json' });
  const downloadUrl = await r2PresignGetUrl(key, EXPORT_OBJECT_TTL_SECONDS);
  const expiresAt = new Date(Date.now() + EXPORT_OBJECT_TTL_SECONDS * 1000);
  return { key, downloadUrl, expiresAt };
}

export async function deleteExportFromR2(key: string): Promise<void> {
  await r2DeleteObject(key);
}

export async function listExpiredExports(now: Date): Promise<{ key: string; userId: string | null }[]> {
  const cutoff = new Date(now.getTime() - EXPORT_OBJECT_TTL_SECONDS * 1000);
  const all = await r2ListObjects(EXPORT_PREFIX);
  return all
    .filter((o) => o.lastModified < cutoff)
    .map((o) => ({ key: o.key, userId: parseExportObjectKey(o.key)?.userId ?? null }));
}

export { isR2Configured, EXPORT_OBJECT_TTL_SECONDS, R2NotConfiguredError };
