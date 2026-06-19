import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';
import type { Prisma, Vial } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import { getReconstitutedShelfLifeDays, getFreezerShelfLifeMonths } from '@/lib/reference/infrastructure/CompoundRepo';
import { convertDoseToMg } from './InventoryService';
import { doseToSyringeUnits } from '../domain/doseUnits';
import type { Protocol } from '@/lib/tracker/domain/types';

const DEFAULT_SHELF_LIFE_DAYS = 14;
const LOW_INVENTORY_PERCENT = new Decimal('0.20');
const EXPIRING_SOON_DAYS = 7;

export const VIAL_STATUS = {
  DRY: 'DRY',
  RECONSTITUTED: 'RECONSTITUTED',
  DEPLETED: 'DEPLETED',
  EXPIRED: 'EXPIRED',
  DELETED: 'DELETED',
} as const;

export type VialStatusType = typeof VIAL_STATUS[keyof typeof VIAL_STATUS];

function parseSingleDoseDecimal(amountStr: string): Decimal {
  const single = amountStr.includes('/') ? amountStr.split('/')[0].trim() : amountStr;
  return new Decimal(single);
}

export type VialBadge = 'LOW_INVENTORY' | 'EXPIRING_SOON' | 'EXPIRED';

export interface SaveVialInput {
  userId: string;
  compoundId: string;
  totalMg: Decimal;
  bacWaterMl: Decimal;
  orderItemId?: string;
  cost?: Decimal;
  currency?: string;
  /** Override the computed expiry (allows user editing before save). */
  expiresAt?: Date;
}

export interface VialWithBadges {
  id: string;
  userId: string;
  compoundId: string;
  compoundName: string;
  compoundSlug: string;
  totalMg: Decimal;
  bacWaterMl: Decimal | null;
  remainingMg: Decimal;
  status: string;
  reconstitutedAt: Date | null;
  expiresAt: Date | null;
  badges: VialBadge[];
  cost?: Decimal | null;
  currency?: string;
}

export async function saveVial(input: SaveVialInput): Promise<VialWithBadges> {
  const now = new Date();

  const shelfLifeDays =
    (await getReconstitutedShelfLifeDays(input.compoundId)) ?? DEFAULT_SHELF_LIFE_DAYS;
  // Normalize to UTC midnight so auto-computed dates are consistent with user-supplied dates (which are also UTC midnight).
  const expiresAt =
    input.expiresAt ??
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + shelfLifeDays));

  const vial = await withAudit(
    async (tx) => {
      let finalCost = input.cost;
      let finalCurrency = input.currency ?? 'USD';

      if (input.orderItemId) {
        const orderItem = await tx.orderItem.findFirst({
          where: { id: input.orderItemId, compoundId: input.compoundId, order: { userId: input.userId } },
          select: { id: true, unitPrice: true, unitCurrency: true },
        });
        if (!orderItem) throw new Error('order_item_not_found_or_not_owned');
        if (finalCost === undefined || finalCost === null) {
          finalCost = orderItem.unitPrice ?? undefined;
        }
        if (!input.currency && orderItem.unitCurrency) {
          finalCurrency = orderItem.unitCurrency;
        }
      }

      return tx.vial.create({
        data: {
          userId: input.userId,
          compoundId: input.compoundId,
          orderItemId: input.orderItemId,
          totalMg: input.totalMg,
          bacWaterMl: input.bacWaterMl,
          remainingMg: input.totalMg,
          status: VIAL_STATUS.RECONSTITUTED,
          reconstitutedAt: now,
          expiresAt,
          cost: finalCost,
          currency: finalCurrency,
        },
        include: { compound: { select: { name: true, slug: true } } },
      });
    },
    (vialRow) => ({
      actorUserId: input.userId,
      category: 'Reconstitution' as const,
      action: 'VIAL_RECONSTITUTED' as const,
      resourceId: vialRow.id,
      resourceType: 'Vial',
      newValues: {
        compoundId: input.compoundId,
        totalMg: input.totalMg.toFixed(3),
        bacWaterMl: input.bacWaterMl.toFixed(3),
        expiresAt: expiresAt.toISOString(),
        cost: vialRow.cost ? vialRow.cost.toString() : null,
        currency: vialRow.currency,
      },
    }),
  );

  return toVialWithBadges(vial);
}

export async function getVialsForUser(userId: string): Promise<VialWithBadges[]> {
  const vials = await prisma.vial.findMany({
    where: { userId, status: VIAL_STATUS.RECONSTITUTED },
    include: { compound: { select: { name: true, slug: true } } },
    orderBy: [{ shelfOrder: 'asc' }, { expiresAt: 'asc' }],
  });

  return vials.map(toVialWithBadges);
}

/**
 * The single "which reconstituted vial is the user drawing from" resolver — used by the
 * dose-units display surfaces AND the log paths so the displayed units always match the
 * vial that is actually deducted (tracker-dose-units-design.md §3.2).
 *
 * Phase 2: prefers the explicit `isActiveForCompound` pointer — returns the RECONSTITUTED vial
 * flagged active for (userId, compoundId) if one exists; otherwise falls back to FIFO — lowest
 * `shelfOrder`, then soonest `expiresAt`. When the active vial depletes its status leaves
 * RECONSTITUTED and the pointer no longer matches, so resolution falls back to FIFO automatically.
 *
 * Accepts an optional transaction client so callers inside `$transaction` resolve against the
 * same tx (no TOCTOU window); defaults to the base client for read-only display use.
 */
export async function resolveActiveVial(
  userId: string,
  compoundId: string,
  client: Prisma.TransactionClient = prisma
): Promise<Vial | null> {
  const pointer = await client.vial.findFirst({
    where: { userId, compoundId, status: VIAL_STATUS.RECONSTITUTED, isActiveForCompound: true },
  });
  if (pointer) {
    return pointer;
  }
  return client.vial.findFirst({
    where: { userId, compoundId, status: VIAL_STATUS.RECONSTITUTED },
    orderBy: [{ shelfOrder: 'asc' }, { expiresAt: 'asc' }],
  });
}

function toVialWithBadges(
  vial: {
    id: string;
    userId: string;
    compoundId: string;
    totalMg: Decimal;
    bacWaterMl: Decimal | null;
    remainingMg: Decimal;
    status: string;
    reconstitutedAt: Date | null;
    expiresAt: Date | null;
    compound: { name: string; slug: string };
    cost?: Decimal | null;
    currency?: string;
  }
): VialWithBadges {
  const badges: VialBadge[] = [];
  const now = new Date();

  if (vial.expiresAt && vial.expiresAt < now) {
    badges.push('EXPIRED');
  } else if (vial.expiresAt) {
    const daysUntilExpiry = (vial.expiresAt.getTime() - now.getTime()) / 86400_000;
    if (daysUntilExpiry <= EXPIRING_SOON_DAYS) {
      badges.push('EXPIRING_SOON');
    }
  }

  const totalMg = new Decimal(vial.totalMg);
  const remainingMg = new Decimal(vial.remainingMg);
  const bacWaterMl = vial.bacWaterMl ? new Decimal(vial.bacWaterMl) : null;
  if (vial.status !== VIAL_STATUS.DRY && totalMg.gt(0) && remainingMg.dividedBy(totalMg).lt(LOW_INVENTORY_PERCENT)) {
    badges.push('LOW_INVENTORY');
  }

  return {
    id: vial.id,
    userId: vial.userId,
    compoundId: vial.compoundId,
    compoundName: vial.compound.name,
    compoundSlug: vial.compound.slug,
    totalMg: new Decimal(vial.totalMg),
    bacWaterMl,
    remainingMg,
    status: vial.status,
    reconstitutedAt: vial.reconstitutedAt,
    expiresAt: vial.expiresAt,
    badges,
    cost: vial.cost ? new Decimal(vial.cost) : null,
    currency: vial.currency,
  };
}

export interface SerializedVialData {
  id: string;
  compoundId: string;
  compoundName: string;
  compoundSlug: string;
  totalMg: string;
  bacWaterMl: string | null;
  remainingMg: string;
  status: string;
  reconstitutedAt: string | null;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  badges: VialBadge[];
  cost?: string | null;
  currency?: string;
  
  potentialDrawWaste?: boolean;
  insufficientMedication?: boolean;
  maxDoseFormatted?: string | null;
}

export function serializeVial(
  v: VialWithBadges,
  nowUtcMidnight: Date,
  activeProtocols?: Protocol[],
  syringeStandard?: string
): SerializedVialData {
  let potentialDrawWaste = false;
  let insufficientMedication = false;
  let maxDoseFormatted: string | null = null;

  if (activeProtocols && activeProtocols.length > 0) {
    const compoundProtocols = activeProtocols.filter(
      (p) => p.compoundId === v.compoundId && p.status === 'ACTIVE'
    );
    if (compoundProtocols.length > 0) {
      const dosesMg = compoundProtocols.map((p) => {
        try {
          return convertDoseToMg(
            p.dose.amount,
            p.dose.unit,
            { totalMg: v.totalMg, bacWaterMl: v.bacWaterMl },
            syringeStandard
          );
        } catch {
          return parseSingleDoseDecimal(p.dose.amount);
        }
      });

      const maxDoseMg = Decimal.max(...dosesMg);
      const minDoseMg = Decimal.min(...dosesMg);
      const remainingMg = v.remainingMg;

      // Insufficient Medication takes precedence over Potential Draw Waste (MMR F-002)
      if (remainingMg.lt(minDoseMg)) {
        insufficientMedication = true;
      } else if (remainingMg.lt(maxDoseMg)) {
        potentialDrawWaste = true;
      }

      const maxProto = compoundProtocols.find((p) => {
        try {
          const mg = convertDoseToMg(
            p.dose.amount,
            p.dose.unit,
            { totalMg: v.totalMg, bacWaterMl: v.bacWaterMl },
            syringeStandard
          );
          return mg.eq(maxDoseMg);
        } catch {
          return false;
        }
      });
      if (maxProto) {
        maxDoseFormatted = `${maxProto.dose.amount} ${maxProto.dose.unit}`;
      }
    }
  }

  return {
    id: v.id,
    compoundId: v.compoundId,
    compoundName: v.compoundName,
    compoundSlug: v.compoundSlug,
    totalMg: v.totalMg.toFixed(3),
    bacWaterMl: v.bacWaterMl ? v.bacWaterMl.toFixed(3) : null,
    remainingMg: v.remainingMg.toFixed(3),
    status: v.status,
    reconstitutedAt: v.reconstitutedAt ? v.reconstitutedAt.toISOString() : null,
    expiresAt: v.expiresAt ? v.expiresAt.toISOString() : null,
    daysUntilExpiry: v.expiresAt ? Math.ceil((v.expiresAt.getTime() - nowUtcMidnight.getTime()) / 86400_000) : null,
    badges: v.badges,
    cost: v.cost ? v.cost.toString() : null,
    currency: v.currency ?? 'USD',
    potentialDrawWaste,
    insufficientMedication,
    maxDoseFormatted,
  };
}

export async function getDryVialsForUser(userId: string): Promise<VialWithBadges[]> {
  const vials = await prisma.vial.findMany({
    where: { userId, status: VIAL_STATUS.DRY },
    include: { compound: { select: { name: true, slug: true } } },
    orderBy: [{ expiresAt: 'asc' }],
  });

  return vials.map(toVialWithBadges);
}

export interface SaveDryVialsInput {
  userId: string;
  compoundId: string;
  totalMg: Decimal;
  quantity: number;
  cost?: Decimal;
  currency?: string;
  expiresAt?: Date;
}

export async function saveDryVials(input: SaveDryVialsInput): Promise<VialWithBadges[]> {
  if (input.quantity <= 0 || input.quantity > 100) {
    throw new Error('Quantity must be between 1 and 100');
  }
  const now = new Date();
  const freezerShelfLifeMonths = (await getFreezerShelfLifeMonths(input.compoundId)) ?? 24;

  const expiresAt =
    input.expiresAt ??
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + freezerShelfLifeMonths, now.getUTCDate()));

  const createdVials = await withAudit(
    async (tx) => {
      const data = Array.from({ length: input.quantity }, () => ({
        id: randomUUID(),
        userId: input.userId,
        compoundId: input.compoundId,
        totalMg: input.totalMg,
        remainingMg: input.totalMg,
        status: VIAL_STATUS.DRY,
        bacWaterMl: null,
        reconstitutedAt: null,
        expiresAt,
        cost: input.cost ?? null,
        currency: input.currency ?? 'USD',
      }));
      await tx.vial.createMany({ data });
      const ids = data.map((d) => d.id);
      return tx.vial.findMany({
        where: { id: { in: ids }, userId: input.userId },
        include: { compound: { select: { name: true, slug: true } } },
      });
    },
    (vialRows) => ({
      actorUserId: input.userId,
      category: 'Reconstitution' as const,
      action: 'DRY_VIALS_ADDED' as const,
      resourceId: vialRows[0]?.id ?? 'bulk',
      resourceType: 'Vial',
      newValues: {
        compoundId: input.compoundId,
        totalMg: input.totalMg.toFixed(3),
        quantity: input.quantity,
        expiresAt: expiresAt.toISOString(),
        cost: input.cost ? input.cost.toString() : null,
        currency: input.currency ?? 'USD',
      },
    })
  );

  return createdVials.map(toVialWithBadges);
}

export interface ReconstituteVialInput {
  userId: string;
  vialId: string;
  bacWaterMl: Decimal;
  expiresAt?: Date;
}

export async function reconstituteVial(input: ReconstituteVialInput): Promise<VialWithBadges> {
  const now = new Date();

  const dryVial = await prisma.vial.findFirst({
    where: { id: input.vialId, userId: input.userId, status: VIAL_STATUS.DRY },
  });
  if (!dryVial) {
    throw new Error('vial_not_found_or_not_owned');
  }

  const shelfLifeDays =
    (await getReconstitutedShelfLifeDays(dryVial.compoundId)) ?? DEFAULT_SHELF_LIFE_DAYS;
  const expiresAt =
    input.expiresAt ??
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + shelfLifeDays));

  const updatedVial = await withAudit(
    async (tx) => {
      const vialToUpdate = await tx.vial.findFirst({
        where: { id: input.vialId, userId: input.userId, status: VIAL_STATUS.DRY },
      });
      if (!vialToUpdate) {
        throw new Error('vial_not_found_or_not_owned');
      }

      const updateResult = await tx.vial.updateMany({
        where: { id: input.vialId, userId: input.userId, status: VIAL_STATUS.DRY },
        data: {
          status: VIAL_STATUS.RECONSTITUTED,
          bacWaterMl: input.bacWaterMl,
          reconstitutedAt: now,
          expiresAt,
        },
      });

      if (updateResult.count === 0) {
        throw new Error('vial_not_found_or_not_owned');
      }

      const result = await tx.vial.findFirst({
        where: { id: input.vialId, userId: input.userId },
        include: { compound: { select: { name: true, slug: true } } },
      });
      if (!result) {
        throw new Error('vial_not_found_or_not_owned');
      }
      return result;
    },
    (vialRow) => ({
      actorUserId: input.userId,
      category: 'Reconstitution' as const,
      action: 'VIAL_RECONSTITUTED' as const,
      resourceId: vialRow.id,
      resourceType: 'Vial',
      newValues: {
        compoundId: vialRow.compoundId,
        totalMg: vialRow.totalMg.toFixed(3),
        bacWaterMl: input.bacWaterMl.toFixed(3),
        expiresAt: expiresAt.toISOString(),
      },
    })
  );

  return toVialWithBadges(updatedVial);
}

export async function deleteVial(userId: string, vialId: string): Promise<void> {
  const vial = await prisma.vial.findFirst({
    where: { id: vialId, userId },
  });
  if (!vial) {
    throw new Error('vial_not_found_or_not_owned');
  }

  await withAudit(
    async (tx) => {
      const deleteResult = await tx.vial.updateMany({
        where: { id: vialId, userId },
        data: { status: VIAL_STATUS.DELETED },
      });
      if (deleteResult.count === 0) {
        throw new Error('vial_not_found_or_not_owned');
      }
    },
    () => ({
      actorUserId: userId,
      category: 'Reconstitution' as const,
      action: 'VIAL_DELETED' as const,
      resourceId: vialId,
      resourceType: 'Vial',
      oldValues: {
        compoundId: vial.compoundId,
        status: vial.status,
        totalMg: vial.totalMg.toString(),
      },
    })
  );
}

export interface UpdateVialRemainingMgInput {
  userId: string;
  vialId: string;
  remainingMg: Decimal;
}

export async function updateVialRemainingMg(input: UpdateVialRemainingMgInput): Promise<VialWithBadges> {
  const existingVial = await prisma.vial.findFirst({
    where: { id: input.vialId, userId: input.userId },
  });
  if (!existingVial) {
    throw new Error('vial_not_found_or_not_owned');
  }

  if (existingVial.status === VIAL_STATUS.DRY) {
    throw new Error('cannot_adjust_dry_vial_mg');
  }

  const totalMg = new Decimal(existingVial.totalMg.toString());
  if (input.remainingMg.gt(totalMg)) {
    throw new Error('remaining_mg_cannot_exceed_total_mg');
  }
  if (input.remainingMg.lt(0)) {
    throw new Error('remaining_mg_cannot_be_negative');
  }

  const newStatus = input.remainingMg.lte(0) ? VIAL_STATUS.DEPLETED : VIAL_STATUS.RECONSTITUTED;

  const updatedVial = await withAudit(
    async (tx) => {
      const vialToUpdate = await tx.vial.findFirst({
        where: { id: input.vialId, userId: input.userId },
      });
      if (!vialToUpdate) {
        throw new Error('vial_not_found_or_not_owned');
      }

      const updateResult = await tx.vial.updateMany({
        where: { id: input.vialId, userId: input.userId },
        data: {
          remainingMg: input.remainingMg,
          status: newStatus,
        },
      });

      if (updateResult.count === 0) {
        throw new Error('vial_not_found_or_not_owned');
      }

      const result = await tx.vial.findFirst({
        where: { id: input.vialId, userId: input.userId },
        include: { compound: { select: { name: true, slug: true } } },
      });
      if (!result) {
        throw new Error('vial_not_found_or_not_owned');
      }
      return result;
    },
    (vialRow) => ({
      actorUserId: input.userId,
      category: 'Reconstitution' as const,
      action: 'VIAL_QUANTITY_UPDATED' as const,
      resourceId: vialRow.id,
      resourceType: 'Vial',
      oldValues: {
        remainingMg: existingVial.remainingMg.toString(),
        status: existingVial.status,
      },
      newValues: {
        remainingMg: input.remainingMg.toFixed(3),
        status: newStatus,
      },
    })
  );

  return toVialWithBadges(updatedVial);
}

export interface UpdateVialCostInput {
  userId: string;
  vialId: string;
  cost: Decimal | null;
  currency?: string;
}

export async function updateVialCost(input: UpdateVialCostInput): Promise<VialWithBadges> {
  const existingVial = await prisma.vial.findFirst({
    where: { id: input.vialId, userId: input.userId },
  });
  if (!existingVial) {
    throw new Error('vial_not_found_or_not_owned');
  }

  const nextCurrency = input.currency ?? existingVial.currency ?? 'USD';

  const updatedVial = await withAudit(
    async (tx) => {
      const vialToUpdate = await tx.vial.findFirst({
        where: { id: input.vialId, userId: input.userId },
      });
      if (!vialToUpdate) {
        throw new Error('vial_not_found_or_not_owned');
      }

      const updateResult = await tx.vial.updateMany({
        where: { id: input.vialId, userId: input.userId },
        data: {
          cost: input.cost,
          currency: nextCurrency,
        },
      });

      if (updateResult.count === 0) {
        throw new Error('vial_not_found_or_not_owned');
      }

      const result = await tx.vial.findFirst({
        where: { id: input.vialId, userId: input.userId },
        include: { compound: { select: { name: true, slug: true } } },
      });
      if (!result) {
        throw new Error('vial_not_found_or_not_owned');
      }
      return result;
    },
    (vialRow) => ({
      actorUserId: input.userId,
      category: 'Reconstitution' as const,
      action: 'VIAL_COST_UPDATED' as const,
      resourceId: vialRow.id,
      resourceType: 'Vial',
      oldValues: {
        cost: existingVial.cost ? existingVial.cost.toString() : null,
        currency: existingVial.currency,
      },
      newValues: {
        cost: input.cost ? input.cost.toString() : null,
        currency: nextCurrency,
      },
    })
  );

  return toVialWithBadges(updatedVial);
}

/**
 * Per-compound inventory summary for the "By compound" view (tracker-dose-units-design.md §10).
 * All Decimals serialized to strings — the client never receives a `Decimal`.
 */
export interface CompoundInventorySummary {
  compoundId: string;
  compoundName: string;
  compoundSlug: string;
  reconstitutedCount: number;
  dryCount: number;
  expiredCount: number;
  /** Sum of remainingMg across non-EXPIRED RECONSTITUTED vials (string). */
  totalReconstitutedRemainingMg: string;
  /** Sum of totalMg across non-EXPIRED DRY vials (string). */
  totalDryMg: string;
  /** EXPIRED > EXPIRING_SOON > LOW_INVENTORY, else null. */
  worstBadge: VialBadge | null;
  /** The active/FIFO reconstituted vial, serialized; null when none. */
  activeVial: SerializedVialData | null;
  dryVialRefs: Pick<SerializedVialData, 'id' | 'totalMg' | 'remainingMg' | 'expiresAt'>[];
  /** True when >1 RECONSTITUTED vial and their totalMg/bacWaterMl concentrations differ. */
  hasMixedConcentration: boolean;
  /** floor(reconstituted pool / representative doseMg); null when omitted (§10.4). */
  dosesLeft: number | null;
  /** Units to draw per dose as a string, or 'varies' (mixed concentration), or null. */
  unitsEach: string | 'varies' | null;
}

const INVENTORY_VIAL_CAP = 500;

const WORST_BADGE_ORDER: VialBadge[] = ['EXPIRED', 'EXPIRING_SOON', 'LOW_INVENTORY'];

/**
 * Aggregate the user's vials grouped by compound for the "By compound" inventory view.
 *
 * ONE `userId`-scoped query over DRY/RECONSTITUTED/EXPIRED vials, reduced in memory. EXPIRED
 * vials are INCLUDED for display (so a row doesn't vanish when the expiry cron flips status) but
 * EXCLUDED from doses-left + total math. DEPLETED/DELETED are excluded entirely.
 *
 * Needs `protocols` and `syringeStandard` because it calls `serializeVial` and computes the
 * doses-left line via the active protocol's representative dose (mirrors
 * `getSerializedVialsForCompound`). Both are passed in (no redundant query).
 */
export async function getInventorySummaryByCompound(
  userId: string,
  protocols: Protocol[],
  syringeStandard: string
): Promise<CompoundInventorySummary[]> {

  const now = new Date();
  const nowUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const vials = await prisma.vial.findMany({
    where: {
      userId,
      status: { in: [VIAL_STATUS.DRY, VIAL_STATUS.RECONSTITUTED, VIAL_STATUS.EXPIRED] },
    },
    include: { compound: { select: { name: true, slug: true } } },
    orderBy: [{ shelfOrder: 'asc' }, { expiresAt: 'asc' }],
    take: INVENTORY_VIAL_CAP,
  });

  if (vials.length >= INVENTORY_VIAL_CAP) {
    // Read-path safety cap: silently truncates (not the hard reject reorderVialsAction uses).
    console.warn(
      `getInventorySummaryByCompound: vial cap ${INVENTORY_VIAL_CAP} hit for user ${userId}; results truncated`
    );
  }

  // Group the raw rows by compound.
  const groups = new Map<string, typeof vials>();
  for (const v of vials) {
    const list = groups.get(v.compoundId);
    if (list) {
      list.push(v);
    } else {
      groups.set(v.compoundId, [v]);
    }
  }

  const activeProtocols = protocols.filter((p) => p.status === 'ACTIVE');

  const summaries: CompoundInventorySummary[] = [];

  for (const [compoundId, compoundVials] of groups) {
    const first = compoundVials[0];

    const reconVials = compoundVials.filter(
      (v) => v.status === VIAL_STATUS.RECONSTITUTED
    );
    const dryVials = compoundVials.filter((v) => v.status === VIAL_STATUS.DRY);
    const expiredVials = compoundVials.filter((v) => v.status === VIAL_STATUS.EXPIRED);

    const totalReconstitutedRemainingMg = reconVials.reduce(
      (acc, v) => acc.plus(new Decimal(v.remainingMg)),
      new Decimal(0)
    );
    const totalDryMg = dryVials.reduce(
      (acc, v) => acc.plus(new Decimal(v.totalMg)),
      new Decimal(0)
    );

    // worstBadge: status === EXPIRED is EXPIRED-level directly (badge alone is insufficient).
    const badgeSet = new Set<VialBadge>();
    for (const v of compoundVials) {
      if (v.status === VIAL_STATUS.EXPIRED) {
        badgeSet.add('EXPIRED');
      }
      for (const b of toVialWithBadges(v).badges) {
        badgeSet.add(b);
      }
    }
    const worstBadge = WORST_BADGE_ORDER.find((b) => badgeSet.has(b)) ?? null;

    // hasMixedConcentration: >1 recon vial with differing totalMg/bacWaterMl ratio.
    let hasMixedConcentration = false;
    if (reconVials.length > 1) {
      const concentrations = reconVials.map((v) => {
        const bac = v.bacWaterMl ? new Decimal(v.bacWaterMl) : null;
        if (!bac || bac.lte(0)) return null;
        return new Decimal(v.totalMg).dividedBy(bac).toString();
      });
      hasMixedConcentration = concentrations.some((c) => c !== concentrations[0]);
    }

    // Resolve the active vial (pointer-aware) and serialize it.
    const activeVialRaw = reconVials.length > 0 ? await resolveActiveVial(userId, compoundId) : null;
    const activeVial = activeVialRaw
      ? serializeVial(
          toVialWithBadges({ ...activeVialRaw, compound: { name: first.compound.name, slug: first.compound.slug } }),
          nowUtcMidnight,
          activeProtocols,
          syringeStandard
        )
      : null;

    // Doses-left + unitsEach (Phase 3b).
    let dosesLeft: number | null = null;
    let unitsEach: string | 'varies' | null = null;

    const compoundActiveProtocols = activeProtocols.filter((p) => p.compoundId === compoundId);
    const representative = compoundActiveProtocols.length === 1 ? compoundActiveProtocols[0] : null;
    const isMassUnit = representative
      ? representative.dose.unit === 'mcg' || representative.dose.unit === 'mg' || representative.dose.unit === 'mcg/mg'
      : false;

    if (representative && activeVial) {
      const dose = representative.dose;
      const bacWaterMl = activeVial.bacWaterMl ? new Decimal(activeVial.bacWaterMl) : null;
      const canConvert = isMassUnit || (bacWaterMl !== null && bacWaterMl.gt(0));

      if (canConvert) {
        const doseMg = convertDoseToMg(
          dose.amount,
          dose.unit,
          { totalMg: new Decimal(activeVial.totalMg), bacWaterMl },
          syringeStandard
        );

        // Mixed concentration: suppress unitsEach; omit dosesLeft for mL/IU (pool ÷ active doseMg wrong).
        if (hasMixedConcentration) {
          unitsEach = 'varies';
          if (isMassUnit && doseMg.gt(0)) {
            dosesLeft = totalReconstitutedRemainingMg.dividedBy(doseMg).floor().toNumber();
          }
        } else {
          if (doseMg.gt(0)) {
            dosesLeft = totalReconstitutedRemainingMg.dividedBy(doseMg).floor().toNumber();
          }
          const unitsResult = doseToSyringeUnits(
            dose,
            { totalMg: activeVial.totalMg, bacWaterMl: activeVial.bacWaterMl },
            syringeStandard === 'U40' ? 'U40' : 'U100'
          );
          unitsEach = unitsResult.computable ? unitsResult.units.toString() : null;
        }
      }
    }

    summaries.push({
      compoundId,
      compoundName: first.compound.name,
      compoundSlug: first.compound.slug,
      reconstitutedCount: reconVials.length,
      dryCount: dryVials.length,
      expiredCount: expiredVials.length,
      totalReconstitutedRemainingMg: totalReconstitutedRemainingMg.toFixed(3),
      totalDryMg: totalDryMg.toFixed(3),
      worstBadge,
      activeVial,
      dryVialRefs: dryVials.map((v) => ({
        id: v.id,
        totalMg: new Decimal(v.totalMg).toFixed(3),
        remainingMg: new Decimal(v.remainingMg).toFixed(3),
        expiresAt: v.expiresAt ? v.expiresAt.toISOString() : null,
      })),
      hasMixedConcentration,
      dosesLeft,
      unitsEach,
    });
  }

  return summaries;
}

export async function getSerializedVialsForCompound(
  userId: string,
  compoundId: string
): Promise<SerializedVialData[]> {
  const now = new Date();
  const nowUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const vials = await prisma.vial.findMany({
    where: {
      userId,
      compoundId,
      status: { in: [VIAL_STATUS.DRY, VIAL_STATUS.RECONSTITUTED] },
    },
    include: { compound: { select: { name: true, slug: true } } },
    orderBy: [{ shelfOrder: 'asc' }, { expiresAt: 'asc' }],
  });

  const activeProtocols = (await prisma.protocol.findMany({
    where: { userId, status: 'ACTIVE' },
  })) as unknown as Protocol[];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { syringeStandard: true },
  });
  const syringeStandard = user?.syringeStandard ?? 'U100';

  return vials.map((v) => {
    const vWithBadges = toVialWithBadges(v);
    return serializeVial(vWithBadges, nowUtcMidnight, activeProtocols, syringeStandard);
  });
}
