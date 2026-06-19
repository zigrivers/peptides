import { prisma } from '@/lib/shared/prisma';
import Decimal from 'decimal.js';
import { convertDoseToMg, type VialInfo } from '@/lib/reconstitution/application/InventoryService';

export interface SpendAnalytics {
  loggedSpendYtd: string;
  loggedSpendMonthly: string;
  projectedSpend: {
    daily: string;
    weekly: string;
    monthly: string;
  };
  spendByCompound: Array<{
    compoundId: string;
    compoundName: string;
    amount: string;
    percentage: number;
  }>;
}

const EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0,
  USDT: 1.0,
  EUR: 1.08,
  GBP: 1.27,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getDosesPerDay(scheduleValue: unknown): Decimal {
  if (!isRecord(scheduleValue)) return new Decimal(0);

  if (scheduleValue.frequency === 'Daily') {
    return new Decimal(1);
  }
  // Twice-daily: two doses on every calendar day.
  if (scheduleValue.frequency === 'TwiceDaily') {
    return new Decimal(2);
  }
  if (scheduleValue.frequency === 'EOD') {
    return new Decimal(0.5);
  }
  if (scheduleValue.frequency === 'SpecificDaysOfWeek' && Array.isArray(scheduleValue.daysOfWeek)) {
    return new Decimal(scheduleValue.daysOfWeek.length).dividedBy(7);
  }
  // Twice-daily on specific weekdays: two doses per scheduled day.
  if (scheduleValue.frequency === 'TwiceSpecificDaysOfWeek' && Array.isArray(scheduleValue.daysOfWeek)) {
    return new Decimal(2).times(scheduleValue.daysOfWeek.length).dividedBy(7);
  }
  if (
    scheduleValue.frequency === 'CustomInterval' &&
    typeof scheduleValue.intervalDays === 'number' &&
    scheduleValue.intervalDays > 0
  ) {
    return new Decimal(1).dividedBy(scheduleValue.intervalDays);
  }

  return new Decimal(0);
}

function parseDoseAmount(value: unknown): { amount: string; unit: string } | null {
  if (!isRecord(value)) return null;
  if (typeof value.amount !== 'string' || typeof value.unit !== 'string') return null;
  return { amount: value.amount, unit: value.unit };
}

function convertToUSD(amount: Decimal, fromCurrency: string): Decimal | null {
  const rate = EXCHANGE_RATES[fromCurrency.toUpperCase()];
  if (rate === undefined) return null;
  return amount.times(new Decimal(rate));
}

export async function getSpendAnalytics(userId: string): Promise<SpendAnalytics> {
  const now = new Date();
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // 1. Logged Spend - YTD
  const loggedLogsYtd = await prisma.doseLog.findMany({
    where: {
      userId,
      status: 'LOGGED',
      scheduledDate: { gte: startOfYear },
      loggedCost: { not: null },
    },
    select: {
      loggedCost: true,
      loggedCurrency: true,
      protocol: {
        select: {
          compoundId: true,
          compound: { select: { name: true } },
        },
      },
    },
  });

  let totalLoggedYtd = new Decimal(0);
  const compoundSpendMap = new Map<string, { name: string; amount: Decimal }>();

  for (const log of loggedLogsYtd) {
    if (log.loggedCost) {
      const cost = new Decimal(log.loggedCost);
      const currency = log.loggedCurrency || 'USD';
      const costInUSD = convertToUSD(cost, currency);
      if (!costInUSD) continue;
      
      totalLoggedYtd = totalLoggedYtd.plus(costInUSD);

      const compId = log.protocol.compoundId;
      const compName = log.protocol.compound.name;
      const current = compoundSpendMap.get(compId) || { name: compName, amount: new Decimal(0) };
      current.amount = current.amount.plus(costInUSD);
      compoundSpendMap.set(compId, current);
    }
  }

  // 2. Logged Spend - Monthly
  const loggedLogsMonthly = await prisma.doseLog.findMany({
    where: {
      userId,
      status: 'LOGGED',
      scheduledDate: { gte: startOfMonth },
      loggedCost: { not: null },
    },
    select: { loggedCost: true, loggedCurrency: true },
  });

  let totalLoggedMonthly = new Decimal(0);
  for (const log of loggedLogsMonthly) {
    if (log.loggedCost) {
      const cost = new Decimal(log.loggedCost);
      const currency = log.loggedCurrency || 'USD';
      const costInUSD = convertToUSD(cost, currency);
      if (!costInUSD) continue;
      totalLoggedMonthly = totalLoggedMonthly.plus(costInUSD);
    }
  }

  // 3. Projected Spend based on Active Protocols
  const activeProtocols = await prisma.protocol.findMany({
    where: {
      userId,
      status: 'ACTIVE',
    },
    include: {
      compound: { select: { name: true } },
    },
  });

  // Fetch syringe preference
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { syringeStandard: true },
  });
  const syringeStandard = user?.syringeStandard ?? 'U100';

  const activeCompoundIds = activeProtocols.map((p) => p.compoundId);

  // Batch query all active vials for these compounds
  const activeVials = await prisma.vial.findMany({
    where: {
      userId,
      compoundId: { in: activeCompoundIds },
      status: 'RECONSTITUTED',
      isActiveForCompound: true,
    },
  });

  // Batch query all historical vials with cost for these compounds
  const historicalVialsAll = await prisma.vial.findMany({
    where: {
      userId,
      compoundId: { in: activeCompoundIds },
      cost: { not: null },
    },
    select: {
      compoundId: true,
      cost: true,
      totalMg: true,
      currency: true,
      bacWaterMl: true,
    },
  });

  let totalProjectedDaily = new Decimal(0);

  for (const protocol of activeProtocols) {
    const activeVial = activeVials.find((v) => v.compoundId === protocol.compoundId) || null;

    let costPerMg: Decimal | null = null;
    let vialForConversion: VialInfo | null = activeVial;
    let currency = 'USD';

    if (activeVial && activeVial.cost) {
      costPerMg = new Decimal(activeVial.cost).dividedBy(new Decimal(activeVial.totalMg));
      currency = activeVial.currency;
    } else {
      // Fallback: average cost per mg of historical vials
      const historicalVials = historicalVialsAll.filter((v) => v.compoundId === protocol.compoundId);
      if (historicalVials.length > 0) {
        let totalCostVal = new Decimal(0);
        let totalMgVal = new Decimal(0);
        for (const v of historicalVials) {
          if (v.cost) {
            const costInUSD = convertToUSD(new Decimal(v.cost.toString()), v.currency);
            if (!costInUSD) continue;
            totalCostVal = totalCostVal.plus(costInUSD);
            totalMgVal = totalMgVal.plus(new Decimal(v.totalMg.toString()));
          }
        }
        if (totalMgVal.gt(0)) {
          costPerMg = totalCostVal.dividedBy(totalMgVal);
          currency = 'USD';

          // Select a representative vial from historical data
          const repVial =
            historicalVials.find((v) => v.bacWaterMl !== null) ||
            historicalVials[0];

          const repBacWater = repVial.bacWaterMl ? new Decimal(repVial.bacWaterMl.toString()) : null;
          const fallbackBacWaterMl = (repBacWater && repBacWater.gt(0)) ? repBacWater : new Decimal('2.0');
          const fallbackTotalMg = new Decimal(repVial.totalMg.toString()).gt(0) ? new Decimal(repVial.totalMg.toString()) : new Decimal('10.0');

          vialForConversion = {
            totalMg: fallbackTotalMg,
            bacWaterMl: fallbackBacWaterMl,
          };
        }
      }
    }

    if (!costPerMg) continue;

    const dosesPerDay = getDosesPerDay(protocol.schedule);
    const doseObj = parseDoseAmount(protocol.dose);
    if (doseObj) {
      try {
        const doseMg = convertDoseToMg(
          doseObj.amount,
          doseObj.unit,
          vialForConversion || { totalMg: new Decimal(10), bacWaterMl: new Decimal(2) },
          syringeStandard
        );
        const costPerDose = doseMg.times(costPerMg);
        const dailyProjected = costPerDose.times(dosesPerDay);
        const dailyProjectedUSD = convertToUSD(dailyProjected, currency);
        if (!dailyProjectedUSD) continue;
        totalProjectedDaily = totalProjectedDaily.plus(dailyProjectedUSD);
      } catch {
        // conversion error
      }
    }
  }

  const spendByCompound = Array.from(compoundSpendMap.entries()).map(([compoundId, data]) => {
    return {
      compoundId,
      compoundName: data.name,
      amount: data.amount.toFixed(2),
      percentage: totalLoggedYtd.gt(0)
        ? Math.round(data.amount.dividedBy(totalLoggedYtd).times(100).toNumber())
        : 0,
    };
  });

  return {
    loggedSpendYtd: totalLoggedYtd.toFixed(2),
    loggedSpendMonthly: totalLoggedMonthly.toFixed(2),
    projectedSpend: {
      daily: totalProjectedDaily.toFixed(2),
      weekly: totalProjectedDaily.times(7).toFixed(2),
      monthly: totalProjectedDaily.times(30).toFixed(2),
    },
    spendByCompound: spendByCompound.sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount)),
  };
}
