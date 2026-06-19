import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/shared/prisma';
import { buildRegimenDoseDisplay } from '@/lib/reconstitution/domain/doseUnits';
import { formatScheduleFrequency } from '@/lib/tracker/domain/schedule';
import type { DoseAmount, Schedule as DomainSchedule } from '@/lib/tracker/domain/types';
import { RegimenClient } from './_components/RegimenClient';

function isTwiceDaily(schedule: DomainSchedule): boolean {
  return schedule.frequency === 'TwiceDaily' || schedule.frequency === 'TwiceSpecificDaysOfWeek';
}

export const metadata = {
  title: 'My Regimen | Peptides',
  description: 'Manage your peptide regimens, view benefits, side effects, and check inventory runout forecasting.',
};

export default async function RegimenPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;

  // Resolve actor user and all of their managed active users
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, syringeStandard: true },
  });

  if (!currentUser) redirect('/login');

  const managedUsers = await prisma.user.findMany({
    where: { managedBy: userId, status: 'ACTIVE' },
    select: { id: true, name: true, syringeStandard: true },
  });

  const allUsers = [currentUser, ...managedUsers];
  const allUserIds = allUsers.map((u) => u.id);

  // Fetch all protocols for self and managed users, including profile and citations
  const rawProtocols = await prisma.protocol.findMany({
    where: { userId: { in: allUserIds } },
    include: {
      compound: {
        include: {
          profile: true,
          supplementProfile: true,
          citations: true,
        },
      },
    },
    orderBy: [
      { status: 'asc' }, // ACTIVE first, then PAUSED, etc.
      { startDate: 'desc' },
    ],
  });

  // Fetch all active and dry reserve vials for tracking runout estimates and refill alerts
  const rawVials = await prisma.vial.findMany({
    where: {
      userId: { in: allUserIds },
      status: { in: ['RECONSTITUTED', 'DRY'] },
    },
    select: {
      id: true,
      userId: true,
      compoundId: true,
      totalMg: true,
      bacWaterMl: true,
      remainingMg: true,
      status: true,
    },
  });

  // Map to matching client types to avoid serialization warnings
  const protocols = rawProtocols.map((p) => ({
    id: p.id,
    userId: p.userId,
    compoundId: p.compoundId,
    cycleId: p.cycleId,
    dose: {
      amount: p.dose && typeof p.dose === 'object' && 'amount' in p.dose ? (p.dose as Record<string, unknown>).amount as string : '0',
      unit: p.dose && typeof p.dose === 'object' && 'unit' in p.dose ? (p.dose as Record<string, unknown>).unit as string : 'mcg',
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schedule: p.schedule as any,
    administrationRoute: p.administrationRoute,
    status: p.status as 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'DEACTIVATED',
    startDate: p.startDate.toISOString(),
    endDate: p.endDate ? p.endDate.toISOString() : null,
    notes: p.notes,
    compound: {
      id: p.compound.id,
      name: p.compound.name,
      slug: p.compound.slug,
      mechanismOfAction: p.compound.mechanismOfAction,
      administrationRoutes: p.compound.administrationRoutes,
      tags: p.compound.tags,
      profile: p.compound.profile
        ? {
            id: p.compound.profile.id,
            dosingLow: p.compound.profile.dosingLow,
            dosingTypical: p.compound.profile.dosingTypical,
            dosingHigh: p.compound.profile.dosingHigh,
            sideEffects: p.compound.profile.sideEffects,
            stackingNotes: p.compound.profile.stackingNotes,
            reconstitutedShelfLifeDays: p.compound.profile.reconstitutedShelfLifeDays,
            cycleLengthWeeks: p.compound.profile.cycleLengthWeeks,
            restPeriodWeeks: p.compound.profile.restPeriodWeeks,
            citations: p.compound.citations.map((c) => ({
              id: c.id,
              title: c.title,
              url: c.url,
              doi: c.doi,
              pmid: c.pmid,
            })),
          }
        : p.compound.supplementProfile
        ? {
            id: p.compound.supplementProfile.id,
            dosingLow: p.compound.supplementProfile.dosingLow,
            dosingTypical: p.compound.supplementProfile.dosingTypical,
            dosingHigh: p.compound.supplementProfile.dosingHigh,
            sideEffects: null,
            stackingNotes: null,
            reconstitutedShelfLifeDays: null,
            cycleLengthWeeks: null,
            restPeriodWeeks: null,
            citations: p.compound.citations.map((c) => ({
              id: c.id,
              title: c.title,
              url: c.url,
              doi: c.doi,
              pmid: c.pmid,
            })),
          }
        : null,
    },
  }));

  const vials = rawVials.map((v) => ({
    id: v.id,
    userId: v.userId,
    compoundId: v.compoundId,
    totalMg: v.totalMg.toString(),
    bacWaterMl: v.bacWaterMl ? v.bacWaterMl.toString() : null,
    remainingMg: v.remainingMg.toString(),
    status: v.status,
  }));

  const users = allUsers.map((u) => ({
    id: u.id,
    name: u.name,
    syringeStandard: u.syringeStandard,
  }));

  // Fetch cycle records for protocols' cycleIds (cycle-DB-accurate progress).
  const cycleIds = [...new Set(rawProtocols.filter((p) => p.cycleId).map((p) => p.cycleId as string))];
  const rawCycles = cycleIds.length
    ? await prisma.cycle.findMany({
        where: { id: { in: cycleIds }, userId: { in: allUserIds } },
        select: { id: true, startDate: true, endDate: true },
      })
    : [];
  const cycles: Record<string, { startDate: string; endDate: string | null }> = {};
  for (const c of rawCycles) {
    cycles[c.id] = {
      startDate: c.startDate.toISOString(),
      endDate: c.endDate ? c.endDate.toISOString() : null,
    };
  }

  // Build the per-protocol dose display (mg-normalized dose + syringe units + frequency).
  const doseDisplayByProtocolId: Record<
    string,
    { doseText: string; unitsText: string | null; frequencyText: string; perDayNote: string | null }
  > = {};
  for (const p of rawProtocols) {
    const doseAmountStr =
      p.dose && typeof p.dose === 'object' && 'amount' in p.dose
        ? ((p.dose as Record<string, unknown>).amount as string)
        : '0';
    const doseUnitStr =
      p.dose && typeof p.dose === 'object' && 'unit' in p.dose
        ? ((p.dose as Record<string, unknown>).unit as string)
        : 'mcg';

    const vial = rawVials.find(
      (v) => v.compoundId === p.compoundId && v.userId === p.userId && v.status === 'RECONSTITUTED'
    );
    const vialConcentration = vial
      ? { totalMg: vial.totalMg.toString(), bacWaterMl: vial.bacWaterMl ? vial.bacWaterMl.toString() : null }
      : null;
    const owner = allUsers.find((u) => u.id === p.userId);
    const syringeStandard = (owner?.syringeStandard ?? 'U100') as 'U100' | 'U40';

    const dd = buildRegimenDoseDisplay(
      { amount: doseAmountStr, unit: doseUnitStr as DoseAmount['unit'] },
      vialConcentration,
      syringeStandard
    );
    const schedule = p.schedule as DomainSchedule;
    doseDisplayByProtocolId[p.id] = {
      doseText: dd.doseText,
      unitsText: dd.unitsText,
      frequencyText: formatScheduleFrequency(schedule),
      perDayNote: isTwiceDaily(schedule) ? '×2/day' : null,
    };
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <RegimenClient
        initialProtocols={protocols}
        vials={vials}
        users={users}
        actorUserId={userId}
        cycles={cycles}
        doseDisplayByProtocolId={doseDisplayByProtocolId}
      />
    </main>
  );
}
