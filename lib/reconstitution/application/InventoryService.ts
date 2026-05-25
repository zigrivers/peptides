import Decimal from 'decimal.js';
import type { Prisma } from '@prisma/client';

export interface VialInfo {
  totalMg: Prisma.Decimal | Decimal;
  bacWaterMl: Prisma.Decimal | Decimal | null;
}

export function convertDoseToMg(
  amount: Decimal,
  unit: string,
  vial: VialInfo,
  syringeStandard?: string
): Decimal {
  if (unit === 'mcg') {
    return amount.dividedBy(1000);
  }
  if (unit === 'mg') {
    return amount;
  }

  if (!vial.bacWaterMl || new Decimal(vial.bacWaterMl.toString()).lte(0)) {
    throw new Error('vial_not_reconstituted');
  }
  if (new Decimal(vial.totalMg.toString()).lte(0)) {
    throw new Error('vial_has_no_mg');
  }

  const totalMg = new Decimal(vial.totalMg.toString());
  const bacWaterMl = new Decimal(vial.bacWaterMl.toString());
  const concentration = totalMg.dividedBy(bacWaterMl);

  if (unit === 'mL') {
    return amount.times(concentration);
  }
  if (unit === 'IU') {
    const conversionFactor = syringeStandard === 'U40' ? new Decimal('0.025') : new Decimal('0.01');
    const doseMl = amount.times(conversionFactor);
    return doseMl.times(concentration);
  }

  throw new Error(`unsupported_unit: ${unit}`);
}

export async function decrementVialInventory(
  tx: Prisma.TransactionClient,
  userId: string,
  vialId: string,
  amount: Decimal,
  unit: string,
  syringeStandard?: string
): Promise<void> {
  const vial = await tx.vial.findFirst({
    where: { id: vialId, userId },
  });
  if (!vial) {
    throw new Error('vial_not_found_or_not_owned');
  }

  const amountMg = convertDoseToMg(amount, unit, vial, syringeStandard);

  const updateResult = await tx.vial.updateMany({
    where: { id: vialId, userId, remainingMg: { gte: amountMg } },
    data: { remainingMg: { decrement: amountMg } },
  });
  if (updateResult.count === 0) {
    throw new Error('insufficient_inventory');
  }

  const updatedVial = await tx.vial.findUnique({
    where: { id: vialId },
    select: { remainingMg: true },
  });
  if (updatedVial && new Decimal(updatedVial.remainingMg.toString()).lte(0)) {
    await tx.vial.updateMany({
      where: { id: vialId, userId },
      data: { status: 'DEPLETED' },
    });
  }
}

export async function incrementVialInventory(
  tx: Prisma.TransactionClient,
  userId: string,
  vialId: string,
  amount: Decimal,
  unit: string,
  syringeStandard?: string
): Promise<void> {
  const vial = await tx.vial.findFirst({
    where: { id: vialId, userId },
  });
  if (!vial) {
    throw new Error('vial_not_found_or_not_owned');
  }

  const amountMg = convertDoseToMg(amount, unit, vial, syringeStandard);

  const updateResult = await tx.vial.updateMany({
    where: { id: vialId, userId },
    data: { remainingMg: { increment: amountMg } },
  });
  if (updateResult.count === 0) {
    throw new Error('vial_not_found_or_not_owned');
  }

  const updatedVial = await tx.vial.findUnique({
    where: { id: vialId },
    select: { remainingMg: true, status: true },
  });
  if (
    updatedVial &&
    new Decimal(updatedVial.remainingMg.toString()).gt(0) &&
    updatedVial.status === 'DEPLETED'
  ) {
    await tx.vial.updateMany({
      where: { id: vialId, userId, status: 'DEPLETED' },
      data: { status: 'RECONSTITUTED' },
    });
  }
}
