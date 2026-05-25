import { redirect } from 'next/navigation';
import Link from 'next/link';
import Decimal from 'decimal.js';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/shared/prisma';
import { assertOrderingEnabled } from '@/lib/shared/featureFlags';
import { listVendorsForUser } from '@/lib/ordering/application/VendorService';
import { getCompoundsMinimal } from '@/lib/reference/infrastructure/CompoundRepo';
import { OrderBuilderContainer } from './_components/OrderBuilderContainer';
import type { DoseAmount, Schedule } from '@/lib/tracker/domain/types';
import {
  getProtocolFormCategory,
  getVialFormCategory,
  getProtocolDailyRateMg,
} from './forecasting';

export default async function CreateOrderPage() {
  assertOrderingEnabled();
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;

  // 1. Fetch user syringe standard
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { syringeStandard: true },
  });
  const syringeStandard = user?.syringeStandard ?? 'U100';

  // 2. Fetch active vendors
  const allVendors = await listVendorsForUser(userId);
  const vendors = allVendors.filter((v) => v.status === 'ACTIVE');

  // 3. Fetch active/dry vials
  const allActiveVials = await prisma.vial.findMany({
    where: { userId, status: 'RECONSTITUTED' },
    include: { compound: true, orderItem: true },
  });

  // Group active inventory by compoundId:formCategory
  const inventoryMap = new Map<string, { totalRemainingMg: Decimal; compoundName: string }>();
  for (const v of allActiveVials) {
    const formCat = getVialFormCategory(v);
    const key = `${v.compoundId}:${formCat}`;
    const existing = inventoryMap.get(key);
    const rem = new Decimal(v.remainingMg);
    if (existing) {
      existing.totalRemainingMg = existing.totalRemainingMg.plus(rem);
    } else {
      inventoryMap.set(key, { totalRemainingMg: rem, compoundName: v.compound.name });
    }
  }

  // 4. Fetch active protocols (active within forecast window)
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const forecastLimit = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 14)
  );

  const activeProtocols = await prisma.protocol.findMany({
    where: {
      userId,
      status: 'ACTIVE',
      startDate: { lte: forecastLimit },
    },
    include: { compound: true },
  });

  const currentProtocols = activeProtocols.filter((p) => {
    const end = p.endDate ? new Date(p.endDate) : null;
    return end === null || end >= today;
  });

  // Group daily depletion rate by compoundId:formCategory
  const rateMap = new Map<
    string,
    { dailyRate: Decimal; isDefaultConcentration: boolean; compoundName: string }
  >();
  for (const p of currentProtocols) {
    const formCat = getProtocolFormCategory(p.administrationRoute);
    const key = `${p.compoundId}:${formCat}`;
    const { rateMg, isDefaultConcentration } = await getProtocolDailyRateMg(
      userId,
      {
        ...p,
        dose: p.dose as unknown as DoseAmount,
        schedule: p.schedule as unknown as Schedule,
      },
      syringeStandard
    );

    const existing = rateMap.get(key);
    if (existing) {
      existing.dailyRate = existing.dailyRate.plus(rateMg);
      if (isDefaultConcentration) existing.isDefaultConcentration = true;
    } else {
      rateMap.set(key, {
        dailyRate: rateMg,
        isDefaultConcentration,
        compoundName: p.compound.name,
      });
    }
  }

  // 5. Fetch active in-flight orders for exclusions (excluding STALE)
  const inFlightOrders = await prisma.order.findMany({
    where: {
      userId,
      status: { in: ['DRAFT', 'SENT', 'CONFIRMED', 'PAYMENT_SENT'] },
    },
    include: { items: true },
  });

  // Build exclusion keys
  const inFlightKeys = new Set<string>();
  for (const o of inFlightOrders) {
    for (const item of o.items) {
      const formCat = item.form === 'LYOPHILIZED_POWDER' ? 'Injectable' : 'Non-Injectable';
      inFlightKeys.add(`${item.compoundId}:${formCat}`);
    }
  }

  // 6. Build suggestions
  const suggestions: Array<{
    compoundId: string;
    compoundName: string;
    formCategory: 'Injectable' | 'Non-Injectable';
    dailyRateMg: string;
    totalRemainingMg: string;
    daysUntilDepletion: number;
    isDefaultConcentration: boolean;
  }> = [];

  for (const [key, rateInfo] of rateMap.entries()) {
    const [compoundId, formCat] = key.split(':') as [string, 'Injectable' | 'Non-Injectable'];

    if (inFlightKeys.has(key)) {
      continue;
    }

    const invInfo = inventoryMap.get(key);
    const totalRemainingMg = invInfo ? invInfo.totalRemainingMg : new Decimal(0);
    const dailyRate = rateInfo.dailyRate;

    if (dailyRate.gt(0)) {
      const daysUntilDepletion = totalRemainingMg.dividedBy(dailyRate);

      if (daysUntilDepletion.lt(14)) {
        suggestions.push({
          compoundId,
          compoundName: rateInfo.compoundName,
          formCategory: formCat,
          dailyRateMg: dailyRate.toFixed(3),
          totalRemainingMg: totalRemainingMg.toFixed(3),
          daysUntilDepletion: daysUntilDepletion.floor().toNumber(),
          isDefaultConcentration: rateInfo.isDefaultConcentration,
        });
      }
    }
  }

  const serializedVendors = vendors.map((v) => ({
    id: v.id,
    name: v.name,
    preferredCurrency: v.preferredCurrency,
    telegramUsername: v.telegramUsername,
  }));

  const compounds = await getCompoundsMinimal();

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 animate-page-enter">
      <div className="mb-6">
        <Link href="/ordering" className="text-sm text-primary hover:underline">
          ← Back to Vendors
        </Link>
        <h1 className="text-2xl font-semibold text-foreground mt-2">Create Order</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select a vendor and build your replenishment order using dynamic inventory depletion insights.
        </p>
      </div>

      <OrderBuilderContainer
        vendors={serializedVendors}
        suggestions={suggestions}
        compounds={compounds}
      />
    </main>
  );
}
