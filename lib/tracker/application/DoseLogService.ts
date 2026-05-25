import { Prisma, PrismaClient } from '@prisma/client';
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
import { isScheduledOn } from '../domain/ScheduleGenerator';
import { parseSchedule, parseDoseAmount, parseInjectionSite } from '../domain/validation';
import type { DoseLogStatus } from '../domain/types';

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

async function runInTx<T>(
  client: Prisma.TransactionClient | { $transaction: (cb: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T> },
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if ('$transaction' in client && typeof client.$transaction === 'function') {
    return client.$transaction(fn);
  }
  return fn(client as Prisma.TransactionClient);
}

export async function logDose(
  input: LogDoseInput,
  tx: Prisma.TransactionClient | PrismaClient = prisma
): Promise<LogDoseResult> {
  if (isFutureCalendarDay(input.scheduledDate)) {
    throw new Error('dose_log_too_late: Cannot log a dose for a future date');
  }

  // Resolve protocol first to obtain the authoritative subject userId.
  const managedIds = await getManagedUserIds(input.actorUserId, tx);
  const protocol = await findProtocolByIdForActor(tx, input.protocolId, input.actorUserId, managedIds);
  if (!protocol) {
    throw new Error(`Protocol not found: ${input.protocolId}`);
  }
  if (protocol.status !== 'ACTIVE') {
    throw new Error(`Protocol is not active: ${input.protocolId}`);
  }

  // Dose log is stored under the protocol owner's userId.
  const subjectUserId = protocol.userId;

  // Always derive idempotency key from the authoritative (subjectUserId, protocolId, scheduledDate) triple.
  // This ensures one dose log per day per protocol regardless of which device or sync path calls logDose.
  const idempotencyKey = buildIdempotencyKey(subjectUserId, input.protocolId, input.scheduledDate);
  const existing = await findDoseLogByIdempotencyKey(tx, idempotencyKey, subjectUserId);

  // If there is an existing log (e.g. updating an entry), we bypass the schedule check.
  // Otherwise, we must validate that the date matches the protocol's schedule (unless it is an offline sync replay).
  if (!existing && !input.isOffline) {
    const schedule = parseSchedule(protocol.schedule);
    if (!isScheduledOn(schedule, protocol.startDate, protocol.endDate, input.scheduledDate)) {
      throw new Error('dose_log_off_schedule: Cannot log a dose for an off-schedule date');
    }
  }

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
    const valid = await validateVialOwnership(tx, input.vialId, subjectUserId, protocol.compoundId);
    if (!valid) {
      throw new Error(`vial_not_found: vial ${input.vialId} does not belong to this user or compound`);
    }
  }

  // Always check inventory; warnings apply to both new logs and same-day edits to LOGGED.
  const warnings: SafetyWarning[] = [];
  if (input.status === 'LOGGED') {
    const vialCount = await countActiveVialsForCompound(tx, subjectUserId, protocol.compoundId);
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
    const updated = await runInTx<DoseLog>(tx, async (innerTx) => {
      const log = await updateDoseLog(innerTx, existing.id, subjectUserId, {
        status: input.status,
        // Explicitly null for SKIPPED; preserve or override for LOGGED.
        injectionSite: input.status === 'SKIPPED' ? null : (input.injectionSite ?? existing.injectionSite),
        note: input.note ?? existing.note,
        vialId: input.status === 'SKIPPED' ? null : (input.vialId ?? existing.vialId),
        loggedByUserId: input.actorUserId,
        loggedAt: new Date(), // Update timestamp on actual logging action
      });
      await innerTx.auditEvent.create({
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
    const doseLog = await runInTx<DoseLog>(tx, async (innerTx) => {
      const log = await createDoseLog(innerTx, {
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

      await innerTx.auditEvent.create({
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
      const winner = await findDoseLogForDate(tx, subjectUserId, input.protocolId, toUTCDay(input.scheduledDate));
      if (winner) return { doseLog: winner, warnings };
    }
    throw err;
  }
}

export async function getRecentDoseLogsForUser(userId: string, limitDays = 60): Promise<DoseLog[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - limitDays);
  
  const rows = await prisma.doseLog.findMany({
    where: { userId, scheduledDate: { gte: since } },
    orderBy: { scheduledDate: 'desc' },
  });
  
  return rows.map((r) => ({
    id: r.id,
    protocolId: r.protocolId,
    userId: r.userId,
    vialId: r.vialId,
    idempotencyKey: r.idempotencyKey,
    loggedAt: r.loggedAt,
    scheduledDate: r.scheduledDate,
    amount: parseDoseAmount(r.amount),
    status: r.status as DoseLogStatus,
    injectionSite: parseInjectionSite(r.injectionSite),
    isBatchLog: r.isBatchLog,
    note: r.note,
    loggedByUserId: r.loggedByUserId,
  }));
}

export async function getDoseLogsRange(userId: string, since: Date): Promise<DoseLog[]> {
  const rows = await prisma.doseLog.findMany({
    where: { userId, scheduledDate: { gte: since } },
    orderBy: { scheduledDate: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id,
    protocolId: r.protocolId,
    userId: r.userId,
    vialId: r.vialId,
    idempotencyKey: r.idempotencyKey,
    loggedAt: r.loggedAt,
    scheduledDate: r.scheduledDate,
    amount: parseDoseAmount(r.amount),
    status: r.status as DoseLogStatus,
    injectionSite: parseInjectionSite(r.injectionSite),
    isBatchLog: r.isBatchLog,
    note: r.note,
    loggedByUserId: r.loggedByUserId,
  }));
}
