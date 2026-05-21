import Decimal from 'decimal.js';
import { prisma } from '@/lib/shared/prisma';

const DEFAULT_SHELF_LIFE_DAYS = 14;
const LOW_INVENTORY_DOSE_THRESHOLD = 5;
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

  const profile = await prisma.compoundProfile.findFirst({
    where: { compoundId: input.compoundId },
    select: { reconstitutedShelfLifeDays: true },
  });

  const shelfLifeDays = profile?.reconstitutedShelfLifeDays ?? DEFAULT_SHELF_LIFE_DAYS;
  const expiresAt = input.expiresAt ?? new Date(now.getTime() + shelfLifeDays * 24 * 60 * 60 * 1000);

  const vial = await prisma.vial.create({
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

  return toVialWithBadges(vial);
}

export async function getVialsForUser(userId: string): Promise<VialWithBadges[]> {
  const vials = await prisma.vial.findMany({
    where: { userId, status: 'RECONSTITUTED' },
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
  if (bacWaterMl && totalMg.gt(0)) {
    const concentrationMgPerMl = totalMg.dividedBy(bacWaterMl);
    const doseVolumeEstimate = concentrationMgPerMl.gt(0)
      ? remainingMg.dividedBy(concentrationMgPerMl)
      : new Decimal(0);
    const dosesRemaining = doseVolumeEstimate.times(10);
    if (dosesRemaining.lt(LOW_INVENTORY_DOSE_THRESHOLD)) {
      badges.push('LOW_INVENTORY');
    }
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
