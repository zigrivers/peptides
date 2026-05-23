import { prisma } from '@/lib/shared/prisma';
import { PrismaAuditRepo } from '@/lib/audit/infrastructure/PrismaAuditRepo';

export interface MarkVialsExpiredResult {
  expired: number;
}

/**
 * Vial expiry cron (Task 6.4, ADR-012). Daily run via Railway Cron.
 *
 * Transitions vials whose `expiresAt` has passed from
 * `status: 'RECONSTITUTED'` to `status: 'EXPIRED'` and emits one
 * `VIAL_EXPIRED` audit event per transition with `actorUserId: 'SYSTEM'`.
 * The audit allows the user to see when a vial flipped to expired in
 * their history.
 *
 * System-level cron — the initial `findMany` is intentionally global
 * (scans every user's RECONSTITUTED vials). Approved exception in
 * CLAUDE.md and AGENTS.md alongside markOrdersStale and
 * processPendingDeletions. The per-vial `updateMany` carries both
 * `id` and `userId` predicates for defense-in-depth, and audit events
 * are only written for rows where `count === 1` so a TOCTOU race
 * doesn't produce spurious audits.
 *
 * Idempotent: a second run finds no rows past cutoff and returns
 * `{ expired: 0 }`.
 */
export async function markVialsExpired(now: Date): Promise<MarkVialsExpiredResult> {
  const dueVials = await prisma.vial.findMany({
    where: {
      status: 'RECONSTITUTED',
      expiresAt: { not: null, lt: now },
    },
    select: { id: true, userId: true, expiresAt: true },
  });
  if (dueVials.length === 0) return { expired: 0 };

  const actuallyExpired = await prisma.$transaction(async (tx) => {
    let count = 0;
    for (const vial of dueVials) {
      // Defense-in-depth: re-verify the expiry predicate inside the
      // transaction, so a vial whose expiresAt was extended by a
      // concurrent user action between the findMany and this updateMany
      // is NOT incorrectly flipped to EXPIRED.
      const { count: rows } = await tx.vial.updateMany({
        where: {
          id: vial.id,
          userId: vial.userId,
          status: 'RECONSTITUTED',
          expiresAt: { not: null, lt: now },
        },
        data: { status: 'EXPIRED' },
      });
      if (rows === 1) {
        count += 1;
        await PrismaAuditRepo.create(tx, {
          actorUserId: 'SYSTEM',
          subjectUserId: vial.userId,
          category: 'Reconstitution',
          action: 'VIAL_EXPIRED',
          resourceId: vial.id,
          resourceType: 'Vial',
          oldValues: { status: 'RECONSTITUTED' },
          newValues: { status: 'EXPIRED' },
          metadata: { expiresAt: vial.expiresAt?.toISOString() ?? null },
        });
      }
    }
    return count;
  });
  return { expired: actuallyExpired };
}
