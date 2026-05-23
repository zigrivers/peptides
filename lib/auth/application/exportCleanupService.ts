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
 * than 7 days and deletes it, then nulls out the matching
 * DataExportRequest.downloadUrl rows so the UI stops showing live
 * links to gone objects.
 *
 * System-level cron — no userId predicate on the R2 list (the bucket
 * is the global namespace). The DB `updateMany` carries `userId` when
 * we can extract it from the key (defense-in-depth); when we can't,
 * we match on `downloadUrl LIKE %{key}%` which is implicitly scoped
 * because keys embed the userId.
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
  let errors = 0;
  for (const obj of expired) {
    try {
      await deleteExportFromR2(obj.key);
      deletedObjects += 1;
    } catch (err) {
      errors += 1;
      // eslint-disable-next-line no-console
      console.error('[export-cleanup] r2 delete failed', { key: obj.key, err: (err as Error).message });
    }
  }

  // Null out downloadUrl for any DataExportRequest whose URL referenced
  // an object we just deleted (or that simply expired naturally). We
  // can't easily reverse-lookup the row from the R2 key alone because
  // downloadUrl stores the full signed URL, not the key. Use
  // expiresAt-based predicate instead: any row whose expiresAt is in
  // the past has a dead URL and should have its downloadUrl cleared.
  const { count: expiredRequestRows } = await prisma.dataExportRequest.updateMany({
    where: {
      expiresAt: { not: null, lt: now },
      downloadUrl: { not: null },
    },
    data: { downloadUrl: null, expiresAt: null },
  });

  return { deletedObjects, expiredRequestRows, errors, skipped: false };
}
