import Decimal from 'decimal.js';
import { prisma } from '@/lib/shared/prisma';
import { withAudit } from '@/lib/audit/application/withAudit';
import { getReconstitutedShelfLifeDays } from '@/lib/reference/infrastructure/CompoundRepo';

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
        include: { compound: { select: { name: true } } },
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
    where: { userId, status: { in: ['DRY', 'RECONSTITUTED'] } },
    include: { compound: { select: { name: true } } },
    orderBy: { expiresAt: 'asc' },
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
    compound: { name: string };
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
  compoundName: string;
  totalMg: string;
  bacWaterMl: string | null;
  remainingMg: string;
  status: string;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  badges: VialBadge[];
}

export function serializeVial(v: VialWithBadges, nowUtcMidnight: Date): SerializedVialData {
  return {
    id: v.id,
    compoundName: v.compoundName,
    totalMg: v.totalMg.toFixed(3),
    bacWaterMl: v.bacWaterMl ? v.bacWaterMl.toFixed(3) : null,
    remainingMg: v.remainingMg.toFixed(3),
    status: v.status,
    expiresAt: v.expiresAt ? v.expiresAt.toISOString() : null,
    daysUntilExpiry: v.expiresAt ? Math.ceil((v.expiresAt.getTime() - nowUtcMidnight.getTime()) / 86400_000) : null,
    badges: v.badges,
  };
}
