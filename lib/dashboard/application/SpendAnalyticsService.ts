import { prisma } from '@/lib/shared/prisma';
import Decimal from 'decimal.js';
import { convertDoseToMg } from '@/lib/reconstitution/application/InventoryService';

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

function convertToUSD(amount: Decimal, fromCurrency: string): Decimal {
  const rate = EXCHANGE_RATES[fromCurrency.toUpperCase()] ?? 1.0;
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
    let vialForConversion = activeVial;
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
          } as any;
        }
      }
    }

    if (!costPerMg) continue;

    // Determine doses per day from schedule
    const schedule = protocol.schedule as any;
    let dosesPerDay = new Decimal(0);

    if (schedule) {
      if (schedule.frequency === 'Daily') {
        dosesPerDay = new Decimal(1);
      } else if (schedule.frequency === 'EOD') {
        dosesPerDay = new Decimal(0.5);
      } else if (schedule.frequency === 'SpecificDaysOfWeek' && Array.isArray(schedule.daysOfWeek)) {
        dosesPerDay = new Decimal(schedule.daysOfWeek.length).dividedBy(7);
      } else if (schedule.frequency === 'CustomInterval' && typeof schedule.intervalDays === 'number' && schedule.intervalDays > 0) {
        dosesPerDay = new Decimal(1).dividedBy(schedule.intervalDays);
      }
    }

    // Convert dose to mg
    const doseObj = protocol.dose as any;
    if (doseObj && doseObj.amount && doseObj.unit) {
      try {
        const doseMg = convertDoseToMg(
          new Decimal(doseObj.amount),
          doseObj.unit,
          vialForConversion || { totalMg: new Decimal(10), bacWaterMl: new Decimal(2) },
          syringeStandard
        );
        const costPerDose = doseMg.times(costPerMg);
        const dailyProjected = costPerDose.times(dosesPerDay);
        const dailyProjectedUSD = convertToUSD(dailyProjected, currency);
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
