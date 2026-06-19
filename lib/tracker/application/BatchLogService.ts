import { prisma } from '@/lib/shared/prisma';
import { toUTCDay } from '@/lib/shared/date';
import Decimal from 'decimal.js';
import { convertDoseToMg, decrementVialInventory } from '@/lib/reconstitution/application/InventoryService';
import { resolveActiveVial } from '@/lib/reconstitution/application/VialService';
import {
  buildDoseUnitsDisplay,
  type SyringeStandard,
  type SyringeSize,
} from '@/lib/reconstitution/domain/doseUnits';
import type {
  BatchDueItem,
  BatchLogInput,
  BatchLogItemResult,
  BatchLogResult,
  DoseLog,
  InjectionSite,
  SafetyWarning,
} from '../domain/types';
import { listProtocolsForUser, findProtocolByIdForActor } from '../infrastructure/ProtocolRepo';
import {
  findDoseLogByIdempotencyKey,
  findDoseLogForDate,
  findDoseLogsForDate,
  countActiveVialsForCompound,
  createDoseLog,
  updateDoseLog,
} from '../infrastructure/DoseLogRepo';
import { getManagedUserIds } from './ProtocolService';
import { isScheduledOn } from '../domain/ScheduleGenerator';
import { dosesPerDay, getDoseSlots } from '../domain/doseSlots';
import { getSitesForRoute, sitesEqualLegacy } from '../domain/SiteRotation';
import { Prisma } from '@prisma/client';
import type { JsonValue } from '@/lib/audit/domain/AuditEvent';



function buildIdempotencyKey(userId: string, protocolId: string, scheduledDate: Date, doseSlot: number): string {
  return `${userId}:${protocolId}:${scheduledDate.toISOString().slice(0, 10)}:${doseSlot}`;
}

function normalizeInjectionSite(site: InjectionSite | null | undefined): InjectionSite | undefined {
  if (!site) return undefined;
  return {
    ...site,
    bodyPart: site.bodyPart === 'abdomen' ? 'abdomen-lower' : site.bodyPart,
  };
}

function validateInjectionSiteForProtocol(protocol: ResolvedBatchProtocol, site: InjectionSite | undefined): void {
  if (!site) return;
  const validSites = getSitesForRoute(protocol.administrationRoute);
  if (validSites.length === 0) return;
  if (!validSites.some((validSite) => sitesEqualLegacy(validSite, site))) {
    throw new Error(`invalid_injection_site: ${site.side} ${site.bodyPart} is not valid for ${protocol.administrationRoute}`);
  }
}

/**
 * Resolve preferredTime per compound (catalogItemId) for the given compounds. Only used to choose
 * twice-daily slot labels (Morning/Evening vs 1st/2nd dose). Defaults to null (→ "1st/2nd dose")
 * when no profile exists. Guarded so once-daily-only batches never depend on profile tables.
 */
async function resolvePreferredTimeByCompound(compoundIds: string[]): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = Object.fromEntries(compoundIds.map((id) => [id, null]));
  if (compoundIds.length === 0) return result;
  const [compoundProfiles, supplementProfiles] = await Promise.all([
    prisma.compoundProfile?.findMany?.({
      where: { catalogItemId: { in: compoundIds } },
      select: { catalogItemId: true, preferredTime: true },
    }) ?? Promise.resolve([]),
    prisma.supplementProfile?.findMany?.({
      where: { catalogItemId: { in: compoundIds } },
      select: { catalogItemId: true, preferredTime: true },
    }) ?? Promise.resolve([]),
  ]);
  for (const p of compoundProfiles ?? []) result[p.catalogItemId] = p.preferredTime ?? null;
  for (const p of supplementProfiles ?? []) {
    if (result[p.catalogItemId] == null) result[p.catalogItemId] = p.preferredTime ?? null;
  }
  return result;
}

function calculateLoggedCost(
  vial: {
    cost: Prisma.Decimal | Decimal | number | string | null;
    currency: string;
    totalMg: Prisma.Decimal | Decimal | number | string;
    bacWaterMl: Prisma.Decimal | Decimal | number | string | null;
  },
  amount: { amount: string; unit: string },
  syringeStandard: string
): { loggedCost: Decimal | null; loggedCurrency: string | null } {
  if (!vial.cost) {
    return { loggedCost: null, loggedCurrency: vial.currency };
  }

  try {
    const doseMg = convertDoseToMg(
      amount.amount,
      amount.unit,
      { totalMg: new Decimal(vial.totalMg.toString()), bacWaterMl: vial.bacWaterMl ? new Decimal(vial.bacWaterMl.toString()) : null },
      syringeStandard
    );
    const costPerMg = new Decimal(vial.cost.toString()).dividedBy(new Decimal(vial.totalMg.toString()));
    return { loggedCost: doseMg.times(costPerMg), loggedCurrency: vial.currency };
  } catch {
    return { loggedCost: null, loggedCurrency: vial.currency };
  }
}

// Batch log is scoped to the actor's own protocols. Managed users' doses are logged
// individually via the per-protocol log action — the batch flow is a personal daily ritual.
export async function getDueTodayForBatch(actorUserId: string): Promise<BatchDueItem[]> {
  const now = new Date();
  const todayUTC = toUTCDay(now);

  const allProtocols = await listProtocolsForUser(prisma, actorUserId);
  // Explicit ownership filter in addition to listProtocolsForUser's WHERE clause.
  const dueProtocols = allProtocols.filter(
    (p) =>
      p.userId === actorUserId &&
      p.status === 'ACTIVE' &&
      isScheduledOn(p.schedule, p.startDate, p.endDate, todayUTC)
  );

  // Bulk dose log lookup — 1 query instead of N
  const protocolIds = dueProtocols.map((p) => p.id);
  const logsByProtocol = await findDoseLogsForDate(prisma, actorUserId, protocolIds, todayUTC);

  // Vial counts — 1 query per unique compound instead of 1 per protocol
  const uniqueCompoundIds = [...new Set(dueProtocols.map((p) => p.compoundId))];
  const vialCountByCompound: Record<string, number> = {};
  // Active vial per compound — drives the "units to draw" display (resolveActiveVial = the same
  // vial the batch log path deducts, so display matches deduction).
  const activeVialByCompound: Record<string, { totalMg: string; bacWaterMl: string | null } | null> = {};
  await Promise.all(
    uniqueCompoundIds.map(async (compoundId) => {
      vialCountByCompound[compoundId] = await countActiveVialsForCompound(prisma, actorUserId, compoundId);
      const vial = await resolveActiveVial(actorUserId, compoundId);
      activeVialByCompound[compoundId] = vial
        ? { totalMg: vial.totalMg.toString(), bacWaterMl: vial.bacWaterMl?.toString() ?? null }
        : null;
    })
  );

  const user = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { syringeStandard: true, syringeSize: true },
  });
  const syringeStandard = (user?.syringeStandard ?? 'U100') as SyringeStandard;
  const syringeSize = (user?.syringeSize ?? '1.0') as SyringeSize;

  // Only resolve preferredTime for compounds that have a twice-daily protocol — once-daily
  // slots carry an empty label and never depend on it.
  const twiceDailyCompoundIds = [
    ...new Set(dueProtocols.filter((p) => dosesPerDay(p.schedule) > 1).map((p) => p.compoundId)),
  ];
  const preferredTimeByCompound = await resolvePreferredTimeByCompound(twiceDailyCompoundIds);

  // One BatchDueItem per (protocol, slot): twice-daily protocols emit two items (slots 0 and 1),
  // each with its own existing-log status looked up per (protocolId, doseSlot).
  return dueProtocols.flatMap((protocol) => {
    const availableVials = vialCountByCompound[protocol.compoundId] ?? 0;
    const doseUnits = buildDoseUnitsDisplay(
      protocol.dose,
      activeVialByCompound[protocol.compoundId] ?? null,
      syringeStandard,
      syringeSize
    );
    const slots = getDoseSlots(protocol.schedule, preferredTimeByCompound[protocol.compoundId] ?? null);
    return slots.map((slot) => ({
      protocol,
      doseSlot: slot.slot,
      slotLabel: slot.label,
      existingLog: logsByProtocol[`${protocol.id}:${slot.slot}`] ?? null,
      availableVials,
      isAvailable: availableVials > 0,
      doseUnits,
    }));
  });
}

type ResolvedBatchProtocol = NonNullable<Awaited<ReturnType<typeof findProtocolByIdForActor>>>;

/**
 * Fetch + validate a protocol once for the batch flow. Re-used across all of the protocol's
 * dose slots so a twice-daily protocol incurs a single ownership/schedule check (one findFirst).
 */
async function resolveBatchProtocol(
  actorUserId: string,
  managedIds: string[],
  protocolId: string,
  scheduledDate: Date
): Promise<ResolvedBatchProtocol> {
  const protocol = await findProtocolByIdForActor(prisma, protocolId, actorUserId, managedIds);
  if (!protocol) throw new Error(`Protocol not found: ${protocolId}`);
  // Batch flow is scoped to the actor's own protocols — reject managed-user protocols.
  if (protocol.userId !== actorUserId) {
    throw new Error(`batch_scope_violation: Protocol ${protocolId} is not owned by the actor`);
  }
  if (protocol.status !== 'ACTIVE') throw new Error(`Protocol is not active: ${protocolId}`);
  if (!isScheduledOn(protocol.schedule, protocol.startDate, protocol.endDate, scheduledDate)) {
    throw new Error(`no_dose_scheduled: No dose scheduled for this protocol on ${scheduledDate.toISOString().slice(0, 10)}`);
  }
  return protocol;
}

async function logOneSlotInBatch(
  actorUserId: string,
  protocol: ResolvedBatchProtocol,
  scheduledDate: Date,
  doseSlot: number,
  vialCountCache: Record<string, number>,
  injectionSite?: InjectionSite | null
): Promise<{ doseLog: DoseLog; warnings: SafetyWarning[] }> {
  const protocolId = protocol.id;
  const subjectUserId = protocol.userId; // always === actorUserId in batch flow
  const normalizedInjectionSite = normalizeInjectionSite(injectionSite);
  validateInjectionSiteForProtocol(protocol, normalizedInjectionSite);
  const idempotencyKey = buildIdempotencyKey(subjectUserId, protocolId, scheduledDate, doseSlot);
  const existing = await findDoseLogByIdempotencyKey(prisma, idempotencyKey, subjectUserId);

  // Already LOGGED → idempotent early return; no vial check needed.
  if (existing?.status === 'LOGGED') {
    return { doseLog: existing, warnings: [] };
  }

  // Block batch log when no vials available — do not create a LOGGED dose without inventory.
  // Use compound-level cache to avoid repeated queries when multiple protocols share a compound.
  if (!(protocol.compoundId in vialCountCache)) {
    vialCountCache[protocol.compoundId] = await countActiveVialsForCompound(prisma, subjectUserId, protocol.compoundId);
  }
  const vialCount = vialCountCache[protocol.compoundId];
  if (vialCount === 0) {
    throw new Error('insufficient_inventory: No reconstituted vials available for this compound');
  }

  const warnings: SafetyWarning[] = [];
  const amount = protocol.dose;

  // SKIPPED → LOGGED same-day edit via updateDoseLog
  if (existing?.status === 'SKIPPED') {
    const updated = await prisma.$transaction(async (tx) => {
      const activeVial = await resolveActiveVial(subjectUserId, protocol.compoundId, tx);
      if (!activeVial) {
        throw new Error('insufficient_inventory: No reconstituted vials available for this compound');
      }

      const user = await tx.user.findUnique({
        where: { id: subjectUserId },
        select: { syringeStandard: true },
      });
      const syringeStandard = user?.syringeStandard ?? 'U100';

      const doseAmountVal = amount.amount;
      const doseUnit = amount.unit;
      const { loggedCost, loggedCurrency } = calculateLoggedCost(activeVial, amount, syringeStandard);

      await decrementVialInventory(tx, subjectUserId, activeVial.id, doseAmountVal, doseUnit, syringeStandard);

      const updates: Parameters<typeof updateDoseLog>[3] = {
        status: 'LOGGED',
        isBatchLog: true,
        vialId: activeVial.id,
        loggedByUserId: actorUserId,
        loggedCost,
        loggedCurrency,
      };
      if (normalizedInjectionSite !== undefined) updates.injectionSite = normalizedInjectionSite;

      const log = await updateDoseLog(tx, existing.id, subjectUserId, updates);
      await tx.auditEvent.create({
        data: {
          actorUserId,
          subjectUserId,
          category: 'Protocol',
          action: 'DOSE_LOGGED',
          resourceId: log.id,
          resourceType: 'DoseLog',
          oldValues: { status: 'SKIPPED' },
          newValues: {
            protocolId,
            scheduledDate: scheduledDate.toISOString(),
            status: 'LOGGED',
            isBatchLog: true,
            loggedByUserId: actorUserId,
            ...(normalizedInjectionSite ? { injectionSite: normalizedInjectionSite as unknown as JsonValue } : {}),
          },
        },
      });
      return log;
    });
    return { doseLog: updated, warnings };
  }

  try {
    const doseLog = await prisma.$transaction(async (tx) => {
      const activeVial = await resolveActiveVial(subjectUserId, protocol.compoundId, tx);
      if (!activeVial) {
        throw new Error('insufficient_inventory: No reconstituted vials available for this compound');
      }

      const user = await tx.user.findUnique({
        where: { id: subjectUserId },
        select: { syringeStandard: true },
      });
      const syringeStandard = user?.syringeStandard ?? 'U100';

      const doseAmountVal = amount.amount;
      const doseUnit = amount.unit;
      const { loggedCost, loggedCurrency } = calculateLoggedCost(activeVial, amount, syringeStandard);

      await decrementVialInventory(tx, subjectUserId, activeVial.id, doseAmountVal, doseUnit, syringeStandard);

      const log = await createDoseLog(tx, {
        protocolId,
        userId: subjectUserId,
        idempotencyKey,
        scheduledDate: toUTCDay(scheduledDate),
        doseSlot,
        amount,
        status: 'LOGGED',
        vialId: activeVial.id,
        isBatchLog: true,
        injectionSite: normalizedInjectionSite,
        loggedByUserId: actorUserId,
        loggedCost,
        loggedCurrency,
      });

      await tx.auditEvent.create({
        data: {
          actorUserId,
          subjectUserId,
          category: 'Protocol',
          action: 'DOSE_LOGGED',
          resourceId: log.id,
          resourceType: 'DoseLog',
          newValues: {
            protocolId,
            scheduledDate: log.scheduledDate.toISOString(),
            status: 'LOGGED',
            isBatchLog: true,
            amount: amount as unknown as JsonValue,
            ...(normalizedInjectionSite ? { injectionSite: normalizedInjectionSite as unknown as JsonValue } : {}),
          },
        },
      });

      return log;
    });

    return { doseLog, warnings };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await findDoseLogForDate(prisma, subjectUserId, protocolId, toUTCDay(scheduledDate), doseSlot);
      if (winner) {
        if (winner.status === 'LOGGED') return { doseLog: winner, warnings };
        // Race: concurrent request wrote a SKIPPED log — update it to LOGGED to match batch intent.
        const updated = await prisma.$transaction(async (tx) => {
          const activeVial = await tx.vial.findFirst({
            where: { userId: subjectUserId, compoundId: protocol.compoundId, status: 'RECONSTITUTED' },
            orderBy: [{ shelfOrder: 'asc' }, { expiresAt: 'asc' }],
          });
          if (!activeVial) {
            throw new Error('insufficient_inventory: No reconstituted vials available for this compound');
          }

          const user = await tx.user.findUnique({
            where: { id: subjectUserId },
            select: { syringeStandard: true },
          });
          const syringeStandard = user?.syringeStandard ?? 'U100';

          const doseAmountVal = amount.amount;
          const doseUnit = amount.unit;
          const { loggedCost, loggedCurrency } = calculateLoggedCost(activeVial, amount, syringeStandard);

          await decrementVialInventory(tx, subjectUserId, activeVial.id, doseAmountVal, doseUnit, syringeStandard);

          const updates: Parameters<typeof updateDoseLog>[3] = {
            status: 'LOGGED',
            isBatchLog: true,
            vialId: activeVial.id,
            loggedByUserId: actorUserId,
            loggedCost,
            loggedCurrency,
          };
          if (normalizedInjectionSite !== undefined) updates.injectionSite = normalizedInjectionSite;

          const log = await updateDoseLog(tx, winner.id, subjectUserId, updates);
          await tx.auditEvent.create({
            data: {
              actorUserId,
              subjectUserId,
              category: 'Protocol',
              action: 'DOSE_LOGGED',
              resourceId: log.id,
              resourceType: 'DoseLog',
              oldValues: { status: 'SKIPPED' },
              newValues: {
                protocolId,
                scheduledDate: scheduledDate.toISOString(),
                status: 'LOGGED',
                isBatchLog: true,
                ...(normalizedInjectionSite ? { injectionSite: normalizedInjectionSite as unknown as JsonValue } : {}),
              },
            },
          });
          return log;
        });
        return { doseLog: updated, warnings };
      }
    }
    throw err;
  }
}

export async function batchLogDoses(input: BatchLogInput): Promise<BatchLogResult> {
  const managedIds = await getManagedUserIds(input.actorUserId);
  const scheduledDate = toUTCDay(input.scheduledDate);
  const vialCountCache: Record<string, number> = {};

  const results: BatchLogItemResult[] = [];
  const requestedByProtocol = new Map<string, Array<{ doseSlot: number; injectionSite?: InjectionSite | null }> | null>();

  if (input.selections && input.selections.length > 0) {
    for (const selection of input.selections) {
      const doseSlot = selection.doseSlot ?? 0;
      const selectionsForProtocol = requestedByProtocol.get(selection.protocolId) ?? [];
      if (selectionsForProtocol !== null) {
        const existingIndex = selectionsForProtocol.findIndex((entry) => entry.doseSlot === doseSlot);
        const nextSelection = { doseSlot, injectionSite: selection.injectionSite };
        if (existingIndex >= 0) {
          selectionsForProtocol[existingIndex] = nextSelection;
        } else {
          selectionsForProtocol.push(nextSelection);
        }
        requestedByProtocol.set(selection.protocolId, selectionsForProtocol);
      }
    }
  } else {
    for (const protocolId of input.selectedProtocolIds ?? []) {
      requestedByProtocol.set(protocolId, null);
    }
  }

  for (const [protocolId, requestedSelections] of requestedByProtocol.entries()) {
    let protocol: ResolvedBatchProtocol;
    try {
      protocol = await resolveBatchProtocol(input.actorUserId, managedIds, protocolId, scheduledDate);
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      const failedSlots = requestedSelections ?? [{ doseSlot: 0 }];
      for (const slot of failedSlots) {
        results.push({ ok: false, protocolId, doseSlot: slot.doseSlot, error });
      }
      continue;
    }

    const scheduleSlots = getDoseSlots(protocol.schedule);
    const validSlotNumbers = new Set(scheduleSlots.map((slot) => slot.slot));
    const slots: Array<{ doseSlot: number; injectionSite?: InjectionSite | null }> =
      requestedSelections ?? scheduleSlots.map((slot) => ({ doseSlot: slot.slot }));
    for (const slot of slots) {
      if (!validSlotNumbers.has(slot.doseSlot)) {
        results.push({
          ok: false,
          protocolId,
          doseSlot: slot.doseSlot,
          error: `invalid_dose_slot: Slot ${slot.doseSlot} is not scheduled for this protocol`,
        });
        continue;
      }

      try {
        const { doseLog, warnings } = await logOneSlotInBatch(
          input.actorUserId,
          protocol,
          scheduledDate,
          slot.doseSlot,
          vialCountCache,
          slot.injectionSite
        );
        results.push({ ok: true, protocolId, doseSlot: slot.doseSlot, doseLog, warnings });
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        results.push({ ok: false, protocolId, doseSlot: slot.doseSlot, error });
      }
    }
  }

  return { results };
}
