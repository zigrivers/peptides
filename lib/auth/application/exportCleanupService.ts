import { prisma } from '@/lib/shared/prisma';
import {
  deleteExportFromR2,
  isR2Configured,
  listExpiredExports,
  R2NotConfiguredError,
} from '@/lib/auth/infrastructure/exportStorage';

export interface CleanupSummary {
  deletedObjects: number;
  expiredRequestRows: number;
  errors: number;
  skipped: boolean;
}

/**
 * Daily 03:00 UTC cron (ADR-014). Walks every R2 export object older
 * than 7 days and deletes it, then nulls out the corresponding
 * DataExportRequest.downloadUrl rows so the UI stops showing dead links.
 *
 * Retry safety: only rows whose R2 object was *successfully* deleted in
 * this run get nulled out. A failed delete leaves the row's downloadUrl
 * intact AND leaves the R2 object in place, so the NEXT cron run will
 * re-list and retry it (R2 list is the source of truth for the retry
 * set). Without this, a transient R2 error would null the row and
 * orphan the object until the bucket's 14-day defense-in-depth
 * lifecycle policy fires.
 *
 * System-level cron — no per-user predicate on either side:
 *  - R2 list is the global `exports/` prefix (bucket has no per-user
 *    namespace).
 *  - DB `updateMany` filters by `downloadUrl contains <key>`. The key
 *    embeds userId, so each match is implicitly scoped to one user.
 *
 * No-ops cleanly when R2 isn't configured — returns `skipped: true`.
 * Idempotent.
 */
export async function cleanupExpiredExports(now: Date): Promise<CleanupSummary> {
  if (!isR2Configured()) {
    return { deletedObjects: 0, expiredRequestRows: 0, errors: 0, skipped: true };
  }

  let expired: { key: string; userId: string | null }[];
  try {
    expired = await listExpiredExports(now);
  } catch (err) {
    if (err instanceof R2NotConfiguredError) {
      return { deletedObjects: 0, expiredRequestRows: 0, errors: 0, skipped: true };
    }
    throw err;
  }

  let deletedObjects = 0;
  let expiredRequestRows = 0;
  let errors = 0;
  for (const obj of expired) {
    try {
      await deleteExportFromR2(obj.key);
      deletedObjects += 1;
      // Null only the row that referenced THIS object. `downloadUrl`
      // stores the full signed URL; the key appears as a substring of
      // the URL path. This naturally scopes the update to the one row
      // whose object we just removed.
      const { count } = await prisma.dataExportRequest.updateMany({
        where: { downloadUrl: { contains: obj.key } },
        data: { downloadUrl: null, expiresAt: null },
      });
      expiredRequestRows += count;
    } catch (err) {
      errors += 1;
      // eslint-disable-next-line no-console
      console.error('[export-cleanup] r2 delete failed', { key: obj.key, err: (err as Error).message });
    }
  }

  return { deletedObjects, expiredRequestRows, errors, skipped: false };
}
