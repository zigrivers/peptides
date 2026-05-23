import { prisma } from '@/lib/shared/prisma';

export const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_BATCH_SIZE = 1000;

export interface PurgeResult {
  deleted: number;
  cutoff: Date;
  batches: number;
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
 *
 * Chunked deletion: large deleteMany operations on a hot table can hold
 * row locks long enough to interfere with writes. We delete in batches
 * of `batchSize` (default 1000) by selecting a page of `id`s then
 * deleting that exact set. Each batch is its own statement, so write
 * traffic gets a fair share of the lock window between batches.
 */
export async function purgeOldAuditEvents(
  now: Date,
  retentionDays: number = DEFAULT_RETENTION_DAYS,
  batchSize: number = DEFAULT_BATCH_SIZE
): Promise<PurgeResult> {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new Error('invalid_retention_days');
  }
  if (!Number.isFinite(batchSize) || batchSize <= 0) {
    throw new Error('invalid_batch_size');
  }
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  let totalDeleted = 0;
  let batches = 0;
  // Safety: hard cap on batch iterations so a runaway loop can't tie up
  // the DB. At 1000/batch this allows up to 10M rows per cron tick —
  // well over v1's anticipated audit volume.
  const MAX_BATCHES = 10_000;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const batch = await prisma.auditEvent.findMany({
      where: { timestamp: { lt: cutoff } },
      take: batchSize,
      select: { id: true },
    });
    if (batch.length === 0) break;
    const { count } = await prisma.auditEvent.deleteMany({
      where: { id: { in: batch.map((b) => b.id) } },
    });
    totalDeleted += count;
    batches += 1;
    if (batch.length < batchSize) break;
  }
  return { deleted: totalDeleted, cutoff, batches };
}
