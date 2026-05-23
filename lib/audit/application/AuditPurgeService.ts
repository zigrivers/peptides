import { prisma } from '@/lib/shared/prisma';

export const DEFAULT_RETENTION_DAYS = 90;

export interface PurgeResult {
  deleted: number;
  cutoff: Date;
}

/**
 * Deletes audit events older than `retentionDays` (default 90 per ADR-009).
 *
 * System-level cron operation — the `deleteMany` is intentionally global
 * because audit events have no `userId` predicate; their `actorUserId` /
 * `subjectUserId` are historical references (not FKs) by design. Endpoint
 * is secured with `CRON_SECRET`. Approved exception in CLAUDE.md /
 * AGENTS.md alongside markOrdersStale and processPendingDeletions.
 *
 * Idempotent: safe to manually re-run. Each invocation removes whatever
 * is currently past the cutoff and returns the count. Re-running
 * immediately after a successful purge returns `deleted: 0`.
 */
export async function purgeOldAuditEvents(
  now: Date,
  retentionDays: number = DEFAULT_RETENTION_DAYS
): Promise<PurgeResult> {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new Error('invalid_retention_days');
  }
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const { count } = await prisma.auditEvent.deleteMany({
    where: { timestamp: { lt: cutoff } },
  });
  return { deleted: count, cutoff };
}
