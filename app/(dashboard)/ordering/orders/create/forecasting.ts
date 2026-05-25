import Decimal from 'decimal.js';
import { prisma } from '@/lib/shared/prisma';
import type { DoseAmount, Schedule } from '@/lib/tracker/domain/types';

export function getProtocolFormCategory(administrationRoute: string): 'Injectable' | 'Non-Injectable' {
  const route = administrationRoute.toUpperCase();
  if (route === 'SUBCUTANEOUS' || route === 'INTRAMUSCULAR') {
    return 'Injectable';
  }
  return 'Non-Injectable';
}

export function getVialFormCategory(vial: {
  bacWaterMl: Decimal | null;
  orderItem?: { form: string | null } | null;
}): 'Injectable' | 'Non-Injectable' {
  if (vial.bacWaterMl && new Decimal(vial.bacWaterMl).gt(0)) {
    return 'Injectable';
  }
  if (vial.orderItem?.form === 'LYOPHILIZED_POWDER') {
    return 'Injectable';
  }
  if (vial.orderItem?.form === 'SOLUTION') {
    return 'Non-Injectable';
  }
  return 'Non-Injectable';
}

export async function getConcentrationForCompoundForm(
  userId: string,
  compoundId: string,
  formCategory: 'Injectable' | 'Non-Injectable'
): Promise<{ concentration: Decimal | null; isDefault: boolean }> {
  // 1. Find active/remaining vials first (status = RECONSTITUTED, remainingMg > 0)
  const activeVials = await prisma.vial.findMany({
    where: { userId, compoundId, status: 'RECONSTITUTED', remainingMg: { gt: 0 } },
    include: { orderItem: true },
    orderBy: [{ reconstitutedAt: 'desc' }, { expiresAt: 'desc' }],
  });

  const matchingActive = activeVials.filter((v) => getVialFormCategory(v) === formCategory);
  for (const v of matchingActive) {
    if (v.bacWaterMl && new Decimal(v.bacWaterMl).gt(0)) {
      return { concentration: new Decimal(v.totalMg).dividedBy(v.bacWaterMl), isDefault: false };
    }
  }

  // 2. Look up historical vials (any status, sorted by reconstitutedAt desc)
  const historicalVials = await prisma.vial.findMany({
    where: { userId, compoundId },
    include: { orderItem: true },
    orderBy: { reconstitutedAt: 'desc' },
  });
  const matchingHist = historicalVials.filter((v) => getVialFormCategory(v) === formCategory);
  for (const v of matchingHist) {
    if (v.bacWaterMl && new Decimal(v.bacWaterMl).gt(0)) {
      return { concentration: new Decimal(v.totalMg).dividedBy(v.bacWaterMl), isDefault: false };
    }
  }

  return { concentration: new Decimal('2.0'), isDefault: true };
}

export async function getProtocolDailyRateMg(
  userId: string,
  protocol: {
    compoundId: string;
    administrationRoute: string;
    dose: DoseAmount;
    schedule: Schedule;
  },
  syringeStandard: string
): Promise<{ rateMg: Decimal; isDefaultConcentration: boolean }> {
  const amt = new Decimal(protocol.dose.amount);
  const unit = protocol.dose.unit;
  let doseMg = new Decimal(0);
  let isDefaultConcentration = false;

  if (unit === 'mcg') {
    doseMg = amt.dividedBy(1000);
  } else if (unit === 'mg') {
    doseMg = amt;
  } else if (unit === 'mL' || unit === 'IU') {
    const formCategory = getProtocolFormCategory(protocol.administrationRoute);
    const { concentration, isDefault } = await getConcentrationForCompoundForm(
      userId,
      protocol.compoundId,
      formCategory
    );
    isDefaultConcentration = isDefault;

    if (concentration) {
      if (unit === 'mL') {
        doseMg = amt.times(concentration);
      } else {
        // 'IU'
        const multiplier = syringeStandard === 'U40' ? new Decimal('0.025') : new Decimal('0.01');
        doseMg = amt.times(multiplier).times(concentration);
      }
    }
  }

  const schedule = protocol.schedule;
  let dailyRate = new Decimal(0);
  const freq = schedule.frequency;

  if (freq === 'Daily') {
    dailyRate = doseMg;
  } else if (freq === 'EOD') {
    dailyRate = doseMg.dividedBy(2);
  } else if (freq === 'SpecificDaysOfWeek') {
    const daysCount = Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek.length : 0;
    dailyRate = doseMg.times(daysCount).dividedBy(7);
  } else if (freq === 'CustomInterval') {
    const intervalDays = typeof schedule.intervalDays === 'number' ? schedule.intervalDays : 0;
    if (intervalDays > 0) {
      dailyRate = doseMg.dividedBy(intervalDays);
    }
  }

  return { rateMg: dailyRate, isDefaultConcentration };
}
