import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import { getReconstitutedShelfLifeDays, getFreezerShelfLifeMonths } from '@/lib/reference/infrastructure/CompoundRepo';
import type { Protocol } from '@/lib/tracker/domain/types';

const DEFAULT_SHELF_LIFE_DAYS = 14;
const LOW_INVENTORY_PERCENT = new Decimal('0.20');
const EXPIRING_SOON_DAYS = 7;

export const VIAL_STATUS = {
  DRY: 'DRY',
  RECONSTITUTED: 'RECONSTITUTED',
  CONSUMED: 'CONSUMED',
  EXPIRED: 'EXPIRED',
  DELETED: 'DELETED',
} as const;

export type VialStatusType = typeof VIAL_STATUS[keyof typeof VIAL_STATUS];

export type VialBadge = 'LOW_INVENTORY' | 'EXPIRING_SOON' | 'EXPIRED';

export interface SaveVialInput {
  userId: string;
  compoundId: string;
  totalMg: Decimal;
  bacWaterMl: Decimal;
  orderItemId?: string;
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
      if (input.orderItemId) {
        const orderItem = await tx.orderItem.findFirst({
          where: { id: input.orderItemId, compoundId: input.compoundId, order: { userId: input.userId } },
          select: { id: true },
        });
        if (!orderItem) throw new Error('order_item_not_found_or_not_owned');
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
        const amt = new Decimal(p.dose.amount);
        if (p.dose.unit === 'mcg') {
          return amt.dividedBy(1000);
        }
        if (p.dose.unit === 'mg') {
          return amt;
        }
        if (v.bacWaterMl && v.bacWaterMl.gt(0)) {
          const concentration = v.totalMg.dividedBy(v.bacWaterMl);
          if (p.dose.unit === 'mL') {
            return amt.times(concentration);
          }
          if (p.dose.unit === 'IU') {
            // 100 IU = 1 mL => 1 IU = 0.01 mL for U-100 syringe preference
            // 40 IU = 1 mL => 1 IU = 0.025 mL for U-40 syringe preference
            const conversionFactor = syringeStandard === 'U40' ? '0.025' : '0.01';
            const doseMl = amt.times(conversionFactor);
            return doseMl.times(concentration);
          }
        }
        return amt;
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
        const amt = new Decimal(p.dose.amount);
        const mg = p.dose.unit === 'mcg' ? amt.dividedBy(1000) : amt;
        return mg.eq(maxDoseMg);
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
