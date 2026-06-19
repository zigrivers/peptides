import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/shared/prisma';
import { getProtocolsForUser } from '@/lib/tracker/application/ProtocolService';
import { getDueTodayForBatch } from '@/lib/tracker/application/BatchLogService';
import { findCompoundsByIds, listCompounds } from '@/lib/reference/infrastructure/CompoundRepo';
import { getRecentDoseLogsForUser, getDoseLogsRange } from '@/lib/tracker/application/DoseLogService';
import { resolveActiveVial, getDryVialsForUser, serializeVial } from '@/lib/reconstitution/application/VialService';
import { utcMidnightToday } from '@/lib/shared/date';
import {
  buildLoggedDoseDisplay,
  buildDoseUnitsDisplay,
  type DoseUnitsDisplay,
  type SyringeStandard,
  type SyringeSize,
} from '@/lib/reconstitution/domain/doseUnits';
import { BatchLogReview } from './_components/BatchLogReview';
import { TrackerCalendar } from './_components/TrackerCalendar';
import { BenefitsTimeline } from './_components/BenefitsTimeline';
import { getSiteSuggestion } from '@/lib/tracker/application/SiteRotationService';
import { computeAdheredDates } from '@/lib/tracker/domain/adherence';
import type { SiteSuggestion } from '@/lib/tracker/domain/SiteRotation';
import type { DoseAmount } from '@/lib/tracker/domain/types';
import type { CompoundProfile } from '@/lib/reference/domain/types';

export default async function TrackerPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const streakLimitDays = 365;
  const streakSince = new Date();
  streakSince.setUTCDate(streakSince.getUTCDate() - streakLimitDays);

  const [protocols, dueToday, doseLogs, compoundsList, allDoseLogsForStreak, dryVialsRaw] =
    await Promise.all([
      getProtocolsForUser(userId),
      getDueTodayForBatch(userId),
      getRecentDoseLogsForUser(userId),
      listCompounds({ includeArchived: true }),
      getDoseLogsRange(userId, streakSince),
      getDryVialsForUser(userId),
    ]);

  const compoundsMap = Object.fromEntries(
    compoundsList.map((c) => [
      c.id,
      {
        ...c,
        lastReviewedAt: c.lastReviewedAt ? c.lastReviewedAt.toISOString() : null,
        archivedAt: c.archivedAt ? c.archivedAt.toISOString() : null,
        profile: c.profile
          ? c.profile
          : c.supplementProfile
          ? {
              id: c.supplementProfile.id,
              catalogItemId: c.supplementProfile.catalogItemId,
              benefitTimeline: c.supplementProfile.benefitTimeline,
              dosingLow: c.supplementProfile.dosingLow,
              dosingTypical: c.supplementProfile.dosingTypical,
              dosingHigh: c.supplementProfile.dosingHigh,
              dosingFrequency: c.supplementProfile.dosingFrequency,
              preferredTime: c.supplementProfile.preferredTime,
              sideEffects: null,
              stackingNotes: null,
              reconstitutedShelfLifeDays: null,
              fridgeShelfLifeMonths: null,
              freezerShelfLifeMonths: null,
              cycleLengthWeeks: null,
              cycleRationale: null,
              restPeriodWeeks: null,
              restPeriodRationale: null,
              dosesPerDay: c.supplementProfile.dosesPerDay,
              customFrequencyDescription: null,
              daysOn: null,
              daysOff: null,
              timingNotes: c.supplementProfile.timingNotes,
              isFdaApproved: false,
              expectedBenefitsSummary: c.supplementProfile.expectedBenefitsSummary,
            }
          : null,
      },
    ])
  );

  const serializedProtocols = protocols.map((p) => ({
    ...p,
    startDate: p.startDate.toISOString(),
    endDate: p.endDate ? p.endDate.toISOString() : null,
    observedBenefits: p.observedBenefits
      ? JSON.parse(JSON.stringify(p.observedBenefits))
      : null,
  }));

  // Resolve compound names for batch review display — single bulk query
  const compoundIds = [...new Set(dueToday.map((i) => i.protocol.compoundId))];
  const compoundNamesRaw = await findCompoundsByIds(compoundIds);
  // Fall back to the compound ID string if not found (e.g., seed data gap)
  const compoundNames: Record<string, string> = Object.fromEntries(
    compoundIds.map((id) => [id, compoundNamesRaw[id] ?? id])
  );

  // Bulk fetch site suggestions for all active protocols
  const siteSuggestions: Record<string, SiteSuggestion> = {};
  await Promise.all(
    protocols
      .filter((p) => p.status === 'ACTIVE')
      .map(async (p) => {
        try {
          const suggestion = await getSiteSuggestion(userId, p.id);
          siteSuggestions[p.id] = suggestion;
        } catch (e) {
          console.error(`Failed to fetch site suggestion for protocol ${p.id}:`, e);
        }
      })
  );

  const serializeSiteSuggestion = (suggestion: SiteSuggestion | undefined) =>
    suggestion
      ? {
          suggestion: suggestion.suggestion,
          validSites: suggestion.validSites,
          siteMeta: suggestion.siteMeta.map((meta) => ({
            ...meta,
            lastUsed: meta.lastUsed ? meta.lastUsed.toISOString() : null,
          })),
          recentSites: suggestion.recentSites,
        }
      : null;

  const serializedDueToday = dueToday.map((item) => ({
    ...item,
    protocol: {
      ...item.protocol,
      startDate: item.protocol.startDate.toISOString(),
      endDate: item.protocol.endDate ? item.protocol.endDate.toISOString() : null,
    },
    existingLog: item.existingLog
      ? {
          ...item.existingLog,
          loggedAt: item.existingLog.loggedAt.toISOString(),
          scheduledDate: item.existingLog.scheduledDate.toISOString(),
          loggedCost: item.existingLog.loggedCost ? item.existingLog.loggedCost.toString() : null,
        }
      : null,
    safetyWarnings: item.safetyWarnings || [],
    siteSuggestion: serializeSiteSuggestion(siteSuggestions[item.protocol.id]),
  }));

  // Prepare active protocols with compound profiles for the Expected Benefits Timeline
  const serializedActiveProtocolsWithTimeline = serializedProtocols
    .filter((p) => p.status === 'ACTIVE')
    .map((p) => {
      const comp = compoundsMap[p.compoundId];
      return {
        ...p,
        compound: {
          name: comp?.name ?? 'Unknown',
          slug: comp?.slug ?? 'unknown',
          profile: (comp?.profile as CompoundProfile | null) ?? null,
        },
      };
    });

  // Build the "units to draw" display per compound for SCHEDULED doses, computed server-side
  // (client never receives Decimals). Uses resolveActiveVial — the same vial the log path
  // deducts — so the displayed units match what is actually drawn/deducted.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { syringeStandard: true, syringeSize: true },
  });
  const syringeStandard = (user?.syringeStandard ?? 'U100') as SyringeStandard;
  const syringeSize = (user?.syringeSize ?? '1.0') as SyringeSize;

  // Dry (un-reconstituted) vials + compound options for the inline "Add inventory" modal.
  // Serialized exactly as the reconstitution page does (mirrors its serializeVial call shape).
  const dryVials = dryVialsRaw.map((v) =>
    serializeVial(v, utcMidnightToday(), protocols, syringeStandard)
  );
  const compoundOptions = compoundsList.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    profile: c.profile,
  }));

  const loggedVialIds = [
    ...new Set(doseLogs.filter((log) => log.status === 'LOGGED' && log.vialId).map((log) => log.vialId as string)),
  ];
  const loggedSubjectUserIds = [...new Set(doseLogs.map((log) => log.userId))];
  const loggedVials = loggedVialIds.length > 0
    ? await prisma.vial.findMany({
        where: {
          id: { in: loggedVialIds },
          userId: { in: loggedSubjectUserIds },
        },
        select: { id: true, totalMg: true, bacWaterMl: true },
      })
    : [];
  const loggedVialConcentrationById = new Map(
    loggedVials.map((vial) => [
      vial.id,
      {
        totalMg: vial.totalMg.toString(),
        bacWaterMl: vial.bacWaterMl ? vial.bacWaterMl.toString() : null,
      },
    ])
  );

  const serializedDoseLogs = doseLogs.map((log) => ({
    ...log,
    loggedAt: log.loggedAt.toISOString(),
    scheduledDate: log.scheduledDate.toISOString(),
    doseSlot: log.doseSlot,
    amount: log.amount,
    injectionSite: log.injectionSite,
    status: log.status,
    loggedCost: log.loggedCost ? log.loggedCost.toString() : null,
    loggedDoseDisplay:
      log.status === 'LOGGED'
        ? buildLoggedDoseDisplay(
            log.amount,
            log.vialId ? (loggedVialConcentrationById.get(log.vialId) ?? null) : null,
            syringeStandard
          )
        : null,
  }));

  // One representative dose per compound (active protocols + due-today). Keyed by compoundId
  // to match how the calendar renders units next to a SCHEDULED event.
  const doseByCompound = new Map<string, DoseAmount>();
  for (const p of protocols) {
    if (p.status === 'ACTIVE') doseByCompound.set(p.compoundId, p.dose);
  }
  for (const item of dueToday) {
    doseByCompound.set(item.protocol.compoundId, item.protocol.dose);
  }

  const doseUnitsByCompoundId: Record<string, DoseUnitsDisplay> = {};
  const vialConcentrationByCompoundId: Record<string, { totalMg: string; bacWaterMl: string | null }> = {};
  await Promise.all(
    [...doseByCompound.entries()].map(async ([compoundId, dose]) => {
      const vial = await resolveActiveVial(userId, compoundId);
      const vialConcentration = vial
        ? { totalMg: vial.totalMg.toString(), bacWaterMl: vial.bacWaterMl?.toString() ?? null }
        : null;
      if (vialConcentration) vialConcentrationByCompoundId[compoundId] = vialConcentration;
      doseUnitsByCompoundId[compoundId] = buildDoseUnitsDisplay(
        dose,
        vialConcentration,
        syringeStandard,
        syringeSize
      );
    })
  );

  // Slot labels for twice-daily protocols depend on the compound's preferred time
  // (MORNING_AND_NIGHT → "Morning"/"Evening"; otherwise generic "1st/2nd dose").
  const preferredTimeByCompoundId: Record<string, string | null> = Object.fromEntries(
    Object.entries(compoundsMap).map(([id, c]) => [id, c.profile?.preferredTime ?? null])
  );

  // A day counts toward the streak only when EVERY active protocol scheduled that day has
  // ALL of its dose slots LOGGED (twice-daily requires both slots). See computeAdheredDates.
  const loggedDates = computeAdheredDates(
    protocols
      .filter((p) => p.status === 'ACTIVE')
      .map((p) => ({
        id: p.id,
        schedule: p.schedule,
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
      })),
    allDoseLogsForStreak.map((log) => ({
      protocolId: log.protocolId,
      scheduledDate: log.scheduledDate,
      status: log.status,
      doseSlot: log.doseSlot ?? 0,
    }))
  );

  // Fetch cycles for the user's protocols
  const cycleIds = [...new Set(protocols.map((p) => p.cycleId).filter(Boolean))] as string[];
  const subjectUserIds = [...new Set(protocols.map((p) => p.userId))];
  const cycles = await prisma.cycle.findMany({
    where: { id: { in: cycleIds }, userId: { in: subjectUserIds } },
    select: { id: true, startDate: true, endDate: true },
  });
  const cyclesMap = Object.fromEntries(
    cycles.map((c) => [
      c.id,
      {
        startDate: c.startDate.toISOString(),
        endDate: c.endDate ? c.endDate.toISOString() : null,
      },
    ])
  );
  return (
    <main className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-6 animate-page-enter">
      {/* Page Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Tracker</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Log today&apos;s regimen doses first, then use the calendar to review schedule, sites, and history.
          </p>
        </div>
        <Link
          href="/tracker/protocols/new"
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-input bg-background px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Add Regimen
        </Link>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Primary workspace: Calendar navigation and selected-day action panel */}
        <div className="lg:col-span-8 space-y-6">
          <section>
            <TrackerCalendar
              protocols={serializedProtocols}
              doseLogs={serializedDoseLogs}
              compounds={compoundsMap}
              siteSuggestions={siteSuggestions}
              initialDateISO={todayUTC.toISOString()}
              followClientToday
              loggedDates={loggedDates}
              doseUnitsByCompoundId={doseUnitsByCompoundId}
              vialConcentrationByCompoundId={vialConcentrationByCompoundId}
              syringeStandard={syringeStandard}
              cycles={cyclesMap}
              dryVials={dryVials}
              compoundOptions={compoundOptions}
              preferredTimeByCompoundId={preferredTimeByCompoundId}
            />
          </section>
        </div>

        {/* Right rail: compact daily batch logging and secondary preview */}
        <aside className="space-y-4 lg:col-span-4" aria-label="Daily tracking tools">
          <BatchLogReview
            variant="sidebar"
            items={serializedDueToday}
            compoundNames={compoundNames}
          />
          <BenefitsTimeline
            activeProtocols={serializedActiveProtocolsWithTimeline}
            currentDateISO={todayUTC.toISOString()}
          />
        </aside>
      </div>
    </main>
  );
}
