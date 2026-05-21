import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import type { JsonValue } from '@/lib/audit/domain/AuditEvent';
import type { LogDoseInput, LogDoseResult, SafetyWarning, DoseLog, InjectionSite } from '../domain/types';
import {
  createDoseLog,
  updateDoseLog,
  findDoseLogByIdempotencyKey,
  findDoseLogForDate,
  countActiveVialsForCompound,
  validateVialOwnership,
} from '../infrastructure/DoseLogRepo';
import { findProtocolByIdForActor } from '../infrastructure/ProtocolRepo';
import { getManagedUserIds } from './ProtocolService';
import { getSitesForRoute, sitesEqual } from '../domain/SiteRotation';

function buildIdempotencyKey(userId: string, protocolId: string, scheduledDate: Date): string {
  const dateStr = scheduledDate.toISOString().slice(0, 10); // YYYY-MM-DD
  return `${userId}:${protocolId}:${dateStr}`;
}

function toUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isFutureCalendarDay(scheduledDate: Date): boolean {
  const now = new Date();
  const todayUTC = toUTCDay(now);
  const targetUTC = toUTCDay(scheduledDate);
  return targetUTC > todayUTC;
}

export async function getTodaysDoseLog(userId: string, protocolId: string): Promise<DoseLog | null> {
  const managedIds = await getManagedUserIds(userId);
  const protocol = await findProtocolByIdForActor(prisma, protocolId, userId, managedIds);
  if (!protocol) return null;
  const now = new Date();
  const todayUTC = toUTCDay(now);
  // Read the dose log using the protocol owner's userId (not necessarily the actor).
  return findDoseLogForDate(prisma, protocol.userId, protocolId, todayUTC);
}

export async function logDose(input: LogDoseInput): Promise<LogDoseResult> {
  if (isFutureCalendarDay(input.scheduledDate)) {
    throw new Error('dose_log_too_late: Cannot log a dose for a future date');
  }

  // Resolve protocol first to obtain the authoritative subject userId.
  const managedIds = await getManagedUserIds(input.actorUserId);
  const protocol = await findProtocolByIdForActor(prisma, input.protocolId, input.actorUserId, managedIds);
  if (!protocol) {
    throw new Error(`Protocol not found: ${input.protocolId}`);
  }
  if (protocol.status !== 'ACTIVE') {
    throw new Error(`Protocol is not active: ${input.protocolId}`);
  }

  // Dose log is stored under the protocol owner's userId.
  const subjectUserId = protocol.userId;

  // Validate injectionSite against the protocol's administration route.
  const validSitesForRoute = getSitesForRoute(protocol.administrationRoute);
  if (input.injectionSite) {
    if (validSitesForRoute.length === 0) {
      throw new Error(`invalid_injection_site: route ${protocol.administrationRoute} does not use injection sites`);
    }
    if (!validSitesForRoute.some((v) => sitesEqual(v, input.injectionSite!))) {
      throw new Error(
        `invalid_injection_site: ${input.injectionSite.side} ${input.injectionSite.bodyPart} is not valid for route ${protocol.administrationRoute}`
      );
    }
  }
  // Require a site for injectable routes when the caller opts in (individual logging flow only).
  // Batch logging does not call logDose and is unaffected.
  if (input.requireInjectionSite && input.status === 'LOGGED' && validSitesForRoute.length > 0 && !input.injectionSite) {
    throw new Error(`injection_site_required: injection site is required for route ${protocol.administrationRoute}`);
  }

  // Validate vialId ownership before any writes.
  if (input.vialId) {
    const valid = await validateVialOwnership(prisma, input.vialId, subjectUserId, protocol.compoundId);
    if (!valid) {
      throw new Error(`vial_not_found: vial ${input.vialId} does not belong to this user or compound`);
    }
  }

  // Build idempotency key; prefer a caller-supplied key (e.g., offline queue ID) for cross-session idempotency.
  const idempotencyKey = input.idempotencyKey ?? buildIdempotencyKey(subjectUserId, input.protocolId, input.scheduledDate);
  const existing = await findDoseLogByIdempotencyKey(prisma, idempotencyKey, subjectUserId);

  // Always check inventory; warnings apply to both new logs and same-day edits to LOGGED.
  const warnings: SafetyWarning[] = [];
  if (input.status === 'LOGGED') {
    const vialCount = await countActiveVialsForCompound(prisma, subjectUserId, protocol.compoundId);
    if (vialCount === 0) {
      warnings.push({ code: 'insufficient_inventory', message: 'No reconstituted vials available for this compound.' });
    }
  }

  if (existing) {
    // True idempotent: same status AND injection site unchanged → nothing to do.
    const injectionSiteChanged =
      input.status === 'LOGGED' &&
      input.injectionSite !== undefined &&
      (existing.injectionSite === null ||
        !sitesEqual(input.injectionSite, existing.injectionSite as InjectionSite));

    // Also update when a SKIPPED log somehow has a stale non-null site (defensive).
    const siteNeedsClearing = input.status === 'SKIPPED' && existing.injectionSite !== null;

    if (existing.status === input.status && !injectionSiteChanged && !siteNeedsClearing) {
      return { doseLog: existing, warnings };
    }
    // Same-calendar-day edit: update status and/or injection site.
    const updated = await prisma.$transaction(async (tx) => {
      const log = await updateDoseLog(tx, existing.id, subjectUserId, {
        status: input.status,
        // Explicitly null for SKIPPED; preserve or override for LOGGED.
        injectionSite: input.status === 'SKIPPED' ? null : (input.injectionSite ?? existing.injectionSite),
        note: input.note ?? existing.note,
        vialId: input.status === 'SKIPPED' ? null : (input.vialId ?? existing.vialId),
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: input.actorUserId,
          subjectUserId,
          category: 'Protocol',
          action: input.status === 'SKIPPED' ? 'DOSE_SKIPPED' : 'DOSE_LOGGED',
          resourceId: log.id,
          resourceType: 'DoseLog',
          oldValues: { status: existing.status, injectionSite: existing.injectionSite ?? null },
          newValues: { status: input.status, injectionSite: log.injectionSite ?? null },
        },
      });
      return log;
    });
    return { doseLog: updated, warnings };
  }

  // Use the protocol's scheduled dose amount as the authoritative amount.
  const amount = protocol.dose;

  try {
    const doseLog = await prisma.$transaction(async (tx) => {
      const log = await createDoseLog(tx, {
        protocolId: input.protocolId,
        userId: subjectUserId,
        idempotencyKey,
        scheduledDate: toUTCDay(input.scheduledDate),
        amount,
        status: input.status,
        injectionSite: input.status === 'LOGGED' ? input.injectionSite : undefined,
        note: input.note,
        vialId: input.vialId,
        loggedByUserId: input.actorUserId,
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: input.actorUserId,
          subjectUserId,
          category: 'Protocol',
          action: input.status === 'SKIPPED' ? 'DOSE_SKIPPED' : 'DOSE_LOGGED',
          resourceId: log.id,
          resourceType: 'DoseLog',
          newValues: {
            protocolId: input.protocolId,
            scheduledDate: log.scheduledDate.toISOString(),
            status: input.status,
            amount: amount as unknown as JsonValue,
          },
        },
      });

      return log;
    });

    return { doseLog, warnings };
  } catch (err) {
    // Concurrent create hit the @@unique([userId, protocolId, scheduledDate]) constraint.
    // Use findDoseLogForDate (not idempotencyKey) so we find the record regardless of who won.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await findDoseLogForDate(prisma, subjectUserId, input.protocolId, toUTCDay(input.scheduledDate));
      if (winner) return { doseLog: winner, warnings };
    }
    throw err;
  }
}
