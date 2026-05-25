import Decimal from 'decimal.js';
import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import { getReconstitutedShelfLifeDays } from '@/lib/reference/infrastructure/CompoundRepo';
import type { Protocol } from '@/lib/tracker/domain/types';

const DEFAULT_SHELF_LIFE_DAYS = 14;
const LOW_INVENTORY_PERCENT = new Decimal('0.20');
const EXPIRING_SOON_DAYS = 7;

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
          status: 'RECONSTITUTED',
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
    where: { userId, status: 'RECONSTITUTED' },
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
  if (totalMg.gt(0) && remainingMg.dividedBy(totalMg).lt(LOW_INVENTORY_PERCENT)) {
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
