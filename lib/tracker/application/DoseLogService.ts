import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import { toUTCDay } from '@/lib/shared/date';
import Decimal from 'decimal.js';
import { decrementVialInventory, incrementVialInventory, convertDoseToMg } from '@/lib/reconstitution/application/InventoryService';
import { resolveActiveVial } from '@/lib/reconstitution/application/VialService';
import type { JsonValue } from '@/lib/audit/domain/AuditEvent';
import type { LogDoseInput, LogDoseResult, SafetyWarning, DoseLog, InjectionSite } from '../domain/types';
import {
  createDoseLog,
  updateDoseLog,
  findDoseLogByIdempotencyKey,
  findDoseLogById,
  findDoseLogForDate,
  countActiveVialsForCompound,
  validateVialOwnership,
} from '../infrastructure/DoseLogRepo';
import { findProtocolByIdForActor } from '../infrastructure/ProtocolRepo';
import { getManagedUserIds } from './ProtocolService';
import { getSitesForRoute, sitesEqual, sitesEqualLegacy } from '../domain/SiteRotation';
import { isScheduledOn } from '../domain/ScheduleGenerator';
import { dosesPerDay } from '@/lib/tracker/domain/doseSlots';
import { parseSchedule, parseDoseAmount, parseInjectionSite } from '../domain/validation';
import type { DoseLogStatus } from '../domain/types';

function buildIdempotencyKey(userId: string, protocolId: string, scheduledDate: Date, doseSlot: number): string {
  const dateStr = scheduledDate.toISOString().slice(0, 10); // YYYY-MM-DD
  return `${userId}:${protocolId}:${dateStr}:${doseSlot}`;
}

function parseDoseAmountSum(amountStr: string): Decimal {
  if (amountStr.includes('/')) {
    return amountStr.split('/').reduce((sum, part) => sum.plus(new Decimal(part.trim())), new Decimal(0));
  }
  return new Decimal(amountStr);
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

async function resolveDoseCost(
  tx: Prisma.TransactionClient,
  vialId: string | null,
  doseAmount: Decimal,
  doseUnit: string,
  syringeStandard: string,
  userId: string,
  compoundId: string
): Promise<{ cost: Decimal | null; currency: string | null }> {
  if (!vialId) {
    const activeVial = await tx.vial.findFirst({
      where: { userId, compoundId, status: 'RECONSTITUTED', isActiveForCompound: true },
    });
    if (activeVial && activeVial.cost) {
      try {
        const doseMg = convertDoseToMg(doseAmount, doseUnit, activeVial, syringeStandard);
        const cost = doseMg.times(new Decimal(activeVial.cost).dividedBy(new Decimal(activeVial.totalMg)));
        return { cost, currency: activeVial.currency };
      } catch {
        // unit conversion failed
      }
    }
    
    // Fallback: average cost per mg of historical vials (grouped by currency to prevent mixed-currency math)
    const historicalVials = await tx.vial.findMany({
      where: { userId, compoundId, cost: { not: null } },
      select: { cost: true, totalMg: true, currency: true, bacWaterMl: true },
    });
    if (historicalVials.length > 0) {
      try {
        // Find the most frequent currency
        const currencyCounts: Record<string, number> = {};
        for (const v of historicalVials) {
          currencyCounts[v.currency] = (currencyCounts[v.currency] || 0) + 1;
        }
        let dominantCurrency = 'USD';
        let maxCount = 0;
        for (const [curr, count] of Object.entries(currencyCounts)) {
          if (count > maxCount) {
            maxCount = count;
            dominantCurrency = curr;
          }
        }

        let totalCostVal = new Decimal(0);
        let totalMgVal = new Decimal(0);
        let totalBacWaterVal = new Decimal(0);
        let bacWaterCount = 0;
        let count = 0;
        for (const v of historicalVials) {
          if (v.cost && v.currency === dominantCurrency) {
            totalCostVal = totalCostVal.plus(new Decimal(v.cost.toString()));
            totalMgVal = totalMgVal.plus(new Decimal(v.totalMg.toString()));
            count++;
            if (v.bacWaterMl) {
              totalBacWaterVal = totalBacWaterVal.plus(new Decimal(v.bacWaterMl.toString()));
              bacWaterCount++;
            }
          }
        }
        if (totalMgVal.gt(0)) {
          const avgBacWaterMl = bacWaterCount > 0 ? totalBacWaterVal.dividedBy(bacWaterCount) : null;
          const avgTotalMg = count > 0 ? totalMgVal.dividedBy(count) : totalMgVal;
          
          // Ensure we have positive values to avoid convertDoseToMg throwing for volume/IU units
          const fallbackBacWaterMl = (avgBacWaterMl && avgBacWaterMl.gt(0)) ? avgBacWaterMl : new Decimal('2.0');
          const fallbackTotalMg = avgTotalMg.gt(0) ? avgTotalMg : new Decimal('10.0');
          
          const dummyVial = { totalMg: fallbackTotalMg, bacWaterMl: fallbackBacWaterMl };
          const doseMg = convertDoseToMg(doseAmount, doseUnit, dummyVial, syringeStandard);
          const cost = doseMg.times(totalCostVal.dividedBy(totalMgVal));
          return { cost, currency: dominantCurrency };
        }
      } catch {
        // fallback calculation failed, return nulls safely
      }
    }
    return { cost: null, currency: null };
  }

  const vial = await tx.vial.findFirst({
    where: { id: vialId, userId },
    select: { cost: true, totalMg: true, currency: true, bacWaterMl: true },
  });
  if (!vial || !vial.cost) {
    return { cost: null, currency: vial?.currency ?? null };
  }
  
  try {
    const doseMg = convertDoseToMg(doseAmount, doseUnit, { totalMg: vial.totalMg, bacWaterMl: vial.bacWaterMl }, syringeStandard);
    const cost = doseMg.times(new Decimal(vial.cost).dividedBy(new Decimal(vial.totalMg)));
    return { cost, currency: vial.currency };
  } catch {
    return { cost: null, currency: vial.currency };
  }
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

  // Resolve and validate the per-day dose slot (default 0). Twice-daily schedules permit slots 0 and 1.
  const doseSlot = input.doseSlot ?? 0;
  const schedule = parseSchedule(protocol.schedule);
  const slotsPerDay = dosesPerDay(schedule);
  if (doseSlot < 0 || doseSlot >= slotsPerDay) {
    throw new Error(
      `invalid_dose_slot: slot ${doseSlot} is out of range for this schedule (expected 0..${slotsPerDay - 1})`
    );
  }

  // Always derive idempotency key from the authoritative (subjectUserId, protocolId, scheduledDate, doseSlot) tuple.
  // This ensures one dose log per day per protocol per slot regardless of which device or sync path calls logDose.
  const idempotencyKey = buildIdempotencyKey(subjectUserId, input.protocolId, input.scheduledDate, doseSlot);
  let existing: DoseLog | null = null;
  if (input.id) {
    existing = await findDoseLogById(tx, input.id, subjectUserId);
    if (!existing) {
      throw new Error('dose_log_not_found: The specified dose log does not exist or is unauthorized');
    }
  } else {
    existing = await findDoseLogByIdempotencyKey(tx, idempotencyKey, subjectUserId);
  }

  if (existing && input.id) {
    if (
      existing.protocolId !== input.protocolId ||
      toUTCDay(existing.scheduledDate).getTime() !== toUTCDay(input.scheduledDate).getTime()
    ) {
      throw new Error('dose_log_mismatch: The specified dose log does not match the protocol or date');
    }
  }

  // If there is an existing log (e.g. updating an entry), we bypass the schedule check.
  // Otherwise, we must validate that the date matches the protocol's schedule (unless it is an offline sync replay).
  if (!existing && !input.isOffline) {
    if (!isScheduledOn(schedule, protocol.startDate, protocol.endDate, input.scheduledDate)) {
      throw new Error('dose_log_off_schedule: Cannot log a dose for an off-schedule date');
    }
  }

  // Validate injectionSite against the protocol's administration route.
  const validSitesForRoute = getSitesForRoute(protocol.administrationRoute);
  let injectionSite = input.injectionSite;
  if (injectionSite && injectionSite.bodyPart === 'abdomen') {
    injectionSite = { ...injectionSite, bodyPart: 'abdomen-lower' };
  }

  if (injectionSite) {
    if (validSitesForRoute.length === 0) {
      throw new Error(`invalid_injection_site: route ${protocol.administrationRoute} does not use injection sites`);
    }
    if (!validSitesForRoute.some((v) => sitesEqual(v, injectionSite!))) {
      throw new Error(
        `invalid_injection_site: ${injectionSite.side} ${injectionSite.bodyPart} is not valid for route ${protocol.administrationRoute}`
      );
    }
  }
  // Require a site for injectable routes when the caller opts in (individual logging flow only).
  // Batch logging does not call logDose and is unaffected.
  if (input.requireInjectionSite && input.status === 'LOGGED' && validSitesForRoute.length > 0 && !injectionSite) {
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
      warnings.push({
        code: 'insufficient_inventory',
        message: "Your active vial couldn't cover this dose — inventory may be inaccurate.",
      });
    }
  }

  if (existing) {
    // True idempotent: same status AND injection site AND note unchanged → nothing to do.
    const injectionSiteChanged =
      input.status === 'LOGGED' &&
      injectionSite !== undefined &&
      (existing.injectionSite === null ||
        !sitesEqualLegacy(injectionSite, existing.injectionSite as InjectionSite));

    // Also update when a SKIPPED log somehow has a stale non-null site (defensive).
    const siteNeedsClearing = input.status === 'SKIPPED' && existing.injectionSite !== null;

    const noteChanged =
      input.note !== undefined &&
      (existing.note ?? '') !== (input.note ?? '');

    const vialIdChanged =
      input.vialId !== undefined &&
      existing.vialId !== input.vialId;

    // A LOGGED dose with no backing vial can later acquire one when inventory is added.
    const canBindVial =
      existing.status === 'LOGGED' && input.status === 'LOGGED' && existing.vialId === null;

    if (
      existing.status === input.status &&
      !injectionSiteChanged &&
      !siteNeedsClearing &&
      !noteChanged &&
      !vialIdChanged &&
      !canBindVial
    ) {
      return { doseLog: existing, warnings };
    }
    // Same-calendar-day edit: update status, injection site and/or notes.
    const updated = await runInTx<DoseLog>(tx, async (innerTx) => {
      const user = await innerTx.user.findUnique({
        where: { id: subjectUserId },
        select: { syringeStandard: true },
      });
      const syringeStandard = user?.syringeStandard ?? 'U100';

      const oldStatus = existing.status;
      const newStatus = input.status;
      const oldVialId = existing.vialId;
      let newVialId = input.status === 'SKIPPED' ? null : (input.vialId ?? existing.vialId);

      const existingAmount = existing.amount as Record<string, unknown>;
      const doseAmountVal = parseDoseAmountSum(existingAmount.amount as string);
      const doseUnit = existingAmount.unit as string;

      if (oldStatus === 'LOGGED' && newStatus === 'SKIPPED') {
        if (oldVialId) {
          await incrementVialInventory(innerTx, subjectUserId, oldVialId, doseAmountVal, doseUnit, syringeStandard);
        }
      } else if (oldStatus === 'SKIPPED' && newStatus === 'LOGGED') {
        if (newVialId) {
          await decrementVialInventory(innerTx, subjectUserId, newVialId, doseAmountVal, doseUnit, syringeStandard);
        }
      } else if (oldStatus === 'LOGGED' && newStatus === 'LOGGED') {
        // Re-bind on retry: a LOGGED dose that was stored with no backing vial can acquire
        // one now that inventory exists. This only fires when existing.vialId === null
        // (guarded by canBindVial), so a second identical retry never decrements again.
        if (canBindVial && newVialId === null) {
          const activeVial = await resolveActiveVial(subjectUserId, protocol.compoundId, innerTx);
          if (activeVial) {
            try {
              await decrementVialInventory(innerTx, subjectUserId, activeVial.id, doseAmountVal, doseUnit, syringeStandard);
              newVialId = activeVial.id;
            } catch (e) {
              if (e instanceof Error && /^insufficient_inventory$/.test(e.message)) {
                // Still short: leave the dose unbacked and surface a warning, no throw.
                warnings.push({
                  code: 'insufficient_inventory',
                  message: "Your active vial couldn't cover this dose — inventory may be inaccurate.",
                });
              } else {
                throw e;
              }
            }
          }
        } else if (oldVialId !== newVialId) {
          if (oldVialId) {
            await incrementVialInventory(innerTx, subjectUserId, oldVialId, doseAmountVal, doseUnit, syringeStandard);
          }
          if (newVialId) {
            await decrementVialInventory(innerTx, subjectUserId, newVialId, doseAmountVal, doseUnit, syringeStandard);
          }
        }
      }

      let loggedCost: Decimal | null = null;
      let loggedCurrency: string | null = null;
      if (newStatus === 'LOGGED') {
        const costRes = await resolveDoseCost(
          innerTx,
          newVialId,
          doseAmountVal,
          doseUnit,
          syringeStandard,
          subjectUserId,
          protocol.compoundId
        );
        loggedCost = costRes.cost;
        loggedCurrency = costRes.currency;
      }

      const log = await updateDoseLog(innerTx, existing.id, subjectUserId, {
        status: input.status,
        // Explicitly null for SKIPPED; preserve, re-bind, or override for LOGGED.
        injectionSite: input.status === 'SKIPPED' ? null : (injectionSite ?? existing.injectionSite),
        note: input.note !== undefined ? (input.note || null) : existing.note,
        vialId: input.status === 'SKIPPED' ? null : newVialId,
        loggedByUserId: input.actorUserId,
        loggedAt: new Date(), // Update timestamp on actual logging action
        loggedCost,
        loggedCurrency,
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

  // Default to the protocol's planned dose, but honor a caller-supplied per-dose override.
  // Override is amount-only: the unit must match the planned unit; the regimen is unchanged.
  const plannedAmount = protocol.dose;
  let amount = plannedAmount;
  if (input.amount && input.amount.unit === plannedAmount.unit) {
    let parsed: Decimal;
    try {
      parsed = parseDoseAmountSum(input.amount.amount);
    } catch {
      throw new Error('invalid_input: dose amount must be a positive number');
    }
    if (parsed.isFinite() && parsed.gt(0)) {
      amount = input.amount;
    } else {
      throw new Error('invalid_input: dose amount must be a positive number');
    }
  } else if (input.amount && input.amount.unit !== plannedAmount.unit) {
    throw new Error('invalid_input: dose unit must match the protocol unit');
  }

  try {
    const doseLog = await runInTx<DoseLog>(tx, async (innerTx) => {
      const user = await innerTx.user.findUnique({
        where: { id: subjectUserId },
        select: { syringeStandard: true },
      });
      const syringeStandard = user?.syringeStandard ?? 'U100';

      // Resolve the effective vial server-side when the caller did not supply one and this is a
      // LOGGED dose: use the same active/FIFO vial the display surfaces show (resolveActiveVial)
      // so the deducted vial always matches the units shown. When the caller DID supply a vialId,
      // behavior is unchanged. No active vial → preserve current behavior (store null, no decrement).
      let effectiveVialId = input.vialId;
      if (input.status === 'LOGGED' && !effectiveVialId) {
        const activeVial = await resolveActiveVial(subjectUserId, protocol.compoundId, innerTx);
        if (activeVial) effectiveVialId = activeVial.id;
      }

      let inventoryShort = false;
      if (input.status === 'LOGGED' && effectiveVialId) {
        try {
          await decrementVialInventory(
            innerTx,
            subjectUserId,
            effectiveVialId,
            parseDoseAmountSum(amount.amount),
            amount.unit,
            syringeStandard
          );
        } catch (e) {
          if (e instanceof Error && /^insufficient_inventory$/.test(e.message)) {
            inventoryShort = true;
            effectiveVialId = undefined;
          } else {
            throw e;
          }
        }
      }

      let loggedCost: Decimal | null = null;
      let loggedCurrency: string | null = null;
      if (input.status === 'LOGGED') {
        const costRes = await resolveDoseCost(
          innerTx,
          effectiveVialId ?? null,
          parseDoseAmountSum(amount.amount),
          amount.unit,
          syringeStandard,
          subjectUserId,
          protocol.compoundId
        );
        loggedCost = costRes.cost;
        loggedCurrency = costRes.currency;
      }

      const log = await createDoseLog(innerTx, {
        protocolId: input.protocolId,
        userId: subjectUserId,
        idempotencyKey,
        scheduledDate: toUTCDay(input.scheduledDate),
        doseSlot,
        amount,
        status: input.status,
        injectionSite: input.status === 'LOGGED' ? injectionSite : undefined,
        note: input.note,
        vialId: effectiveVialId,
        loggedByUserId: input.actorUserId,
        loggedCost,
        loggedCurrency,
      });

      if (inventoryShort) {
        warnings.push({
          code: 'insufficient_inventory',
          message: "Your active vial couldn't cover this dose — inventory may be inaccurate.",
        });
      }

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
    // Concurrent create hit the @@unique([userId, protocolId, scheduledDate, doseSlot]) constraint.
    // Use findDoseLogForDate (not idempotencyKey) so we find the record regardless of who won.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await findDoseLogForDate(tx, subjectUserId, input.protocolId, toUTCDay(input.scheduledDate), doseSlot);
      if (winner) return { doseLog: winner, warnings };
    }
    throw err;
  }
}

export async function getRecentDoseLogsForUser(userId: string, limitDays = 60): Promise<DoseLog[]> {
  const managedIds = await getManagedUserIds(userId);
  const allowedUserIds = [userId, ...managedIds];
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - limitDays);
  
  const rows = await prisma.doseLog.findMany({
    where: { userId: { in: allowedUserIds }, scheduledDate: { gte: since } },
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
    loggedCost: r.loggedCost ? new Decimal(r.loggedCost.toString()) : null,
    loggedCurrency: r.loggedCurrency,
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
    loggedCost: r.loggedCost ? new Decimal(r.loggedCost.toString()) : null,
    loggedCurrency: r.loggedCurrency,
  }));
}
