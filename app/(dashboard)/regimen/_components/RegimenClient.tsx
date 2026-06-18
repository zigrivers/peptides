'use client';

import React, { useState, useTransition, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { utcMidnightOf, utcMidnightToday } from '@/lib/shared/date';
import Decimal from 'decimal.js';
import {
  pauseProtocolAction,
  resumeProtocolAction,
  deactivateProtocolAction,
} from '@/app/actions/tracker/protocol-lifecycle';
import { convertDoseToMg } from '@/lib/reconstitution/application/InventoryService';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Edit3,
  LayoutGrid,
  List,
  Package,
  Pause,
  PauseCircle,
  Play,
  Plus,
  Snowflake,
} from 'lucide-react';
import { getCapColor } from '@/lib/reconstitution/domain/syringe';
import { isScheduledOn } from '@/lib/tracker/domain/ScheduleGenerator';
import { dosesPerDay } from '@/lib/tracker/domain/doseSlots';
import { formatScheduleFrequency } from '@/lib/tracker/domain/schedule';
import type { Schedule as DomainSchedule } from '@/lib/tracker/domain/types';
import { getWeekInfo } from '@/lib/tracker/domain/cycleProgress';
import { getCompoundWhyStatement } from '@/lib/reference/domain/whyStatements';
import { CATALOG_TAGS } from '@/lib/reference/domain/tags';

interface Citation {
  id: string;
  title: string;
  url: string | null;
  doi: string | null;
  pmid: string | null;
}

interface CompoundProfile {
  id: string;
  dosingLow: unknown;
  dosingTypical: unknown;
  dosingHigh: unknown;
  sideEffects: string | null;
  stackingNotes: string | null;
  reconstitutedShelfLifeDays: number | null;
  cycleLengthWeeks?: number | null;
  restPeriodWeeks?: number | null;
  citations: Citation[];
}

interface Compound {
  id: string;
  name: string;
  slug: string;
  mechanismOfAction: string | null;
  administrationRoutes: string[];
  tags: string[];
  profile: CompoundProfile | null;
}

interface Schedule {
  frequency: 'Daily' | 'TwiceDaily' | 'EOD' | 'SpecificDaysOfWeek' | 'TwiceSpecificDaysOfWeek' | 'CustomInterval';
  daysOfWeek?: string[];
  intervalDays?: number;
}

interface Protocol {
  id: string;
  userId: string;
  compoundId: string;
  cycleId: string | null;
  dose: {
    amount: string;
    unit: string;
  };
  schedule: Schedule;
  administrationRoute: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'DEACTIVATED';
  startDate: Date;
  endDate: Date | null;
  notes: string | null;
  compound: Compound;
}

interface User {
  id: string;
  name: string | null;
  syringeStandard: string;
}

interface Vial {
  id: string;
  userId: string;
  compoundId: string;
  totalMg: string;
  bacWaterMl: string | null;
  remainingMg: string;
  status: string;
}

interface SerializedProtocol extends Omit<Protocol, 'startDate' | 'endDate'> {
  startDate: string | Date;
  endDate: string | Date | null;
}

type DoseDisplay = {
  doseText: string;
  unitsText: string | null;
  frequencyText: string;
  perDayNote: string | null;
};

interface RegimenClientProps {
  initialProtocols: SerializedProtocol[];
  vials: Vial[];
  users: User[];
  actorUserId: string;
  cycles?: Record<string, { startDate: string; endDate: string | null }>;
  doseDisplayByProtocolId?: Record<string, DoseDisplay>;
}

const EMPTY_CYCLES: Record<string, { startDate: string; endDate: string | null }> = {};
const EMPTY_DOSE_DISPLAY: Record<string, DoseDisplay> = {};

const CATALOG_TAG_LABELS: ReadonlyMap<string, string> = new Map(
  CATALOG_TAGS.map(({ value, label }) => [value, label])
);

function formatScheduleText(schedule: Schedule): string {
  return formatScheduleFrequency(schedule as unknown as DomainSchedule);
}

function formatUTCDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatUTCDateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatCategoryLabel(tag: string): string {
  return CATALOG_TAG_LABELS.get(tag) ?? tag;
}

function formatRouteLabel(route: string): string {
  const normalized = route.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (normalized === 'subq' || normalized === 'subcutaneous') return 'Subcutaneous';
  if (normalized === 'im' || normalized === 'intramuscular') return 'Intramuscular';
  if (normalized === 'iv' || normalized === 'intravenous') return 'IV';
  return route
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function getSummaryTimingLabel(protocol: Protocol, todayUTC: Date): string | null {
  const startDate = utcMidnightOf(protocol.startDate);
  if (startDate > todayUTC) return `Starts ${formatUTCDate(protocol.startDate)}`;
  return null;
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function isEndedProtocol(protocol: Protocol, todayUTC: Date): boolean {
  const endDate = protocol.endDate ? utcMidnightOf(protocol.endDate) : null;
  return Boolean(endDate && endDate < todayUTC);
}

function isUpcomingProtocol(protocol: Protocol, todayUTC: Date): boolean {
  return utcMidnightOf(protocol.startDate) > todayUTC;
}

function isDueToday(protocol: Protocol, todayUTC: Date): boolean {
  if (protocol.status !== 'ACTIVE') return false;
  if (isUpcomingProtocol(protocol, todayUTC) || isEndedProtocol(protocol, todayUTC)) return false;
  return isScheduledOn(
    protocol.schedule as unknown as Parameters<typeof isScheduledOn>[0],
    protocol.startDate,
    protocol.endDate,
    todayUTC
  );
}

function isWorkspaceProtocol(protocol: Protocol, todayUTC: Date): boolean {
  if (protocol.status === 'DEACTIVATED' || protocol.status === 'COMPLETED') return false;
  if (isEndedProtocol(protocol, todayUTC)) return false;
  return protocol.status === 'ACTIVE' || protocol.status === 'PAUSED';
}

function getProtocolStatusLabel(protocol: Protocol, todayUTC: Date): string {
  if (protocol.status === 'PAUSED') return 'Paused';
  if (protocol.status === 'COMPLETED') return 'Completed';
  if (protocol.status === 'DEACTIVATED') return 'Inactive';
  if (isUpcomingProtocol(protocol, todayUTC)) return 'Upcoming';
  return 'Taking now';
}

function getStatusBadgeStyle(label: string): string {
  if (label === 'Taking now') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300';
  }
  if (label === 'Paused') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300';
  }
  if (label === 'Upcoming') {
    return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-300';
  }
  return 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-300';
}

function getRunoutPriority(runout: { status: 'ok' | 'warning' | 'empty'; daysLeft: number | null }): number {
  if (runout.status === 'empty') return 0;
  if (runout.status === 'warning') return 1;
  return 2;
}

function compareSummaryProtocols(
  a: Protocol,
  b: Protocol,
  runoutByProtocolId: Record<string, { status: 'ok' | 'warning' | 'empty'; daysLeft: number | null }>,
  todayUTC: Date
): number {
  const dueDiff = Number(isDueToday(b, todayUTC)) - Number(isDueToday(a, todayUTC));
  if (dueDiff !== 0) return dueDiff;

  const runoutA = runoutByProtocolId[a.id];
  const runoutB = runoutByProtocolId[b.id];
  const priorityDiff = getRunoutPriority(runoutA) - getRunoutPriority(runoutB);
  if (priorityDiff !== 0) return priorityDiff;

  const statusOrder: Record<string, number> = {
    'Taking now': 0,
    Paused: 1,
    Upcoming: 2,
    Completed: 3,
    Inactive: 4,
  };
  const statusDiff =
    statusOrder[getProtocolStatusLabel(a, todayUTC)] - statusOrder[getProtocolStatusLabel(b, todayUTC)];
  if (statusDiff !== 0) return statusDiff;

  const daysA = runoutA.daysLeft ?? Infinity;
  const daysB = runoutB.daysLeft ?? Infinity;
  if (daysA !== daysB) return daysA - daysB;

  return a.compound.name.localeCompare(b.compound.name);
}

const parseDoseAmountSum = (amountStr: string): Decimal => {
  if (amountStr.includes('/')) {
    return amountStr.split('/').reduce((sum, part) => sum.plus(new Decimal(part.trim())), new Decimal(0));
  }
  return new Decimal(amountStr);
};

function calculateDailyEquivalentMg(
  protocol: Protocol,
  referenceVial: Vial,
  syringeStandard: string
): Decimal {
  if (protocol.status !== 'ACTIVE') return new Decimal(0);
  
  let doseMg: Decimal;
  try {
    doseMg = convertDoseToMg(
      parseDoseAmountSum(protocol.dose.amount),
      protocol.dose.unit,
      {
        totalMg: new Decimal(referenceVial.totalMg),
        bacWaterMl: referenceVial.bacWaterMl ? new Decimal(referenceVial.bacWaterMl) : null,
      },
      syringeStandard
    );
  } catch {
    return new Decimal(0);
  }

  if (doseMg.lte(0)) return new Decimal(0);

  // Doses administered per scheduled day (2 for twice-daily schedules).
  const perDay = dosesPerDay(protocol.schedule as unknown as DomainSchedule);

  if (protocol.schedule.frequency === 'Daily' || protocol.schedule.frequency === 'TwiceDaily') {
    return doseMg.times(perDay);
  }
  if (protocol.schedule.frequency === 'EOD') {
    return doseMg.times(perDay).dividedBy(2);
  }
  if (protocol.schedule.frequency === 'CustomInterval') {
    const interval = protocol.schedule.intervalDays || 1;
    if (interval <= 0) return new Decimal(0);
    return doseMg.times(perDay).dividedBy(interval);
  }
  if (protocol.schedule.frequency === 'SpecificDaysOfWeek' || protocol.schedule.frequency === 'TwiceSpecificDaysOfWeek') {
    const days = protocol.schedule.daysOfWeek?.length || 0;
    return doseMg.times(perDay).times(days).dividedBy(7);
  }
  return new Decimal(0);
}

function calculateCompoundRunout(
  compoundId: string,
  userId: string,
  allProtocols: Protocol[],
  vials: Vial[],
  syringeStandard: string
): { display: string; status: 'ok' | 'warning' | 'empty'; daysLeft: number | null } {
  // Filter active vials
  const compoundVials = vials.filter(
    (v) => v.compoundId === compoundId && v.userId === userId && v.status === 'RECONSTITUTED'
  );
  if (compoundVials.length === 0) {
    return { display: 'No active vials (un-stocked)', status: 'empty', daysLeft: null };
  }

  const totalRemainingMg = compoundVials.reduce(
    (acc, v) => acc.plus(new Decimal(v.remainingMg)),
    new Decimal(0)
  );

  if (totalRemainingMg.lte(0)) {
    return { display: 'Run out (0 mg remaining)', status: 'empty', daysLeft: 0 };
  }

  const referenceVial = compoundVials[0];

  // Find all active protocols for this compound and user
  const activeProtocols = allProtocols.filter(
    (p) => p.compoundId === compoundId && p.userId === userId && p.status === 'ACTIVE'
  );

  if (activeProtocols.length === 0) {
    return { display: 'No active protocols', status: 'ok', daysLeft: null };
  }

  let totalDailyMg = new Decimal(0);
  for (const p of activeProtocols) {
    totalDailyMg = totalDailyMg.plus(calculateDailyEquivalentMg(p, referenceVial, syringeStandard));
  }

  // F-001: Guard clause to return null when totalDailyMg is zero to prevent NaN or division-by-zero errors.
  if (totalDailyMg.lte(0)) {
    return { display: 'Continuous (0 daily equivalent)', status: 'ok', daysLeft: null };
  }

  const today = utcMidnightToday();

  // Copy the vials so we can mutate their remainingMg during the simulation
  const simulatedVials = compoundVials.map((v) => ({
    id: v.id,
    remainingMg: new Decimal(v.remainingMg),
    totalMg: new Decimal(v.totalMg),
    bacWaterMl: v.bacWaterMl ? new Decimal(v.bacWaterMl) : null,
  }));

  // Iterative helper to deduct dose from simulated vials sequentially
  const deductDose = (initialDoseAmount: Decimal, doseUnit: string): boolean => {
    let remainingDoseAmount = initialDoseAmount;
    for (const v of simulatedVials) {
      if (v.remainingMg.lte(0)) continue;

      let doseMg: Decimal;
      try {
        doseMg = convertDoseToMg(
          remainingDoseAmount,
          doseUnit,
          {
            totalMg: v.totalMg,
            bacWaterMl: v.bacWaterMl,
          },
          syringeStandard
        );
      } catch {
        doseMg = new Decimal(0);
      }

      if (doseMg.lte(0)) return true;

      if (v.remainingMg.gte(doseMg)) {
        v.remainingMg = v.remainingMg.minus(doseMg);
        return true;
      } else {
        const fractionLeft = new Decimal(1).minus(v.remainingMg.div(doseMg));
        v.remainingMg = new Decimal(0);
        remainingDoseAmount = remainingDoseAmount.mul(fractionLeft);
      }
    }
    return false;
  };

  let daysLeft = 0;
  const maxDays = 365;
  let ranOut = false;

  while (daysLeft < maxDays) {
    const checkDate = new Date(today);
    checkDate.setUTCDate(today.getUTCDate() + daysLeft);

    const dayDoses: { protocol: Protocol; amount: Decimal; unit: string }[] = [];
    for (const p of activeProtocols) {
      const protocolStartDate = new Date(p.startDate);
      const protocolEndDate = p.endDate ? new Date(p.endDate) : null;

      if (isScheduledOn(p.schedule as unknown as Parameters<typeof isScheduledOn>[0], protocolStartDate, protocolEndDate, checkDate)) {
        // Twice-daily schedules consume two doses on each scheduled day.
        const perDay = dosesPerDay(p.schedule as unknown as DomainSchedule);
        for (let i = 0; i < perDay; i++) {
          dayDoses.push({
            protocol: p,
            amount: parseDoseAmountSum(p.dose.amount),
            unit: p.dose.unit,
          });
        }
      }
    }

    if (dayDoses.length > 0) {
      for (const d of dayDoses) {
        const success = deductDose(d.amount, d.unit);
        if (!success) {
          ranOut = true;
          break;
        }
      }
    }

    if (ranOut) {
      break;
    }
    daysLeft++;
  }

  if (daysLeft === maxDays && !ranOut) {
    return { display: 'Stable (365+ days)', status: 'ok', daysLeft: 365 };
  }

  if (daysLeft <= 0) {
    return { display: 'Run out', status: 'empty', daysLeft: 0 };
  }

  const runoutDate = new Date(today);
  runoutDate.setUTCDate(today.getUTCDate() + daysLeft);

  const displayDate = runoutDate.toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    display: `${displayDate} (${daysLeft} days remaining)`,
    status: daysLeft < 7 ? 'warning' : 'ok',
    daysLeft,
  };
}

type RunoutInfo = ReturnType<typeof calculateCompoundRunout>;

function getRunoutBadgeStyle(runout: RunoutInfo): string {
  if (runout.status === 'empty') {
    return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300';
  }
  if (runout.status === 'warning') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300';
  }
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300';
}

function getRunoutBadgeLabel(runout: RunoutInfo): string {
  if (runout.status === 'empty') return 'Needs inventory';
  if (runout.status === 'warning') return 'Low';
  return 'OK';
}

function RegimenAttentionSummary({
  protocols,
  runoutByProtocolId,
}: {
  protocols: Protocol[];
  runoutByProtocolId: Record<string, RunoutInfo>;
}) {
  const todayUTC = utcMidnightToday();
  const dueDoseCount = protocols.reduce((total, protocol) => {
    if (!isDueToday(protocol, todayUTC)) return total;
    return total + dosesPerDay(protocol.schedule as unknown as DomainSchedule);
  }, 0);
  const inventoryIssueCount = protocols.filter((protocol) => {
    if (protocol.status !== 'ACTIVE' || isUpcomingProtocol(protocol, todayUTC)) return false;
    const runout = runoutByProtocolId[protocol.id];
    return runout?.status === 'empty' || runout?.status === 'warning';
  }).length;
  const pausedCount = protocols.filter((protocol) => protocol.status === 'PAUSED').length;
  const activeCount = protocols.filter(
    (protocol) =>
      protocol.status === 'ACTIVE' &&
      !isUpcomingProtocol(protocol, todayUTC) &&
      !isEndedProtocol(protocol, todayUTC)
  ).length;

  const metrics = [
    {
      label: 'Scheduled today',
      value: formatCount(dueDoseCount, 'dose'),
      note: dueDoseCount > 0 ? 'Log from the daily tracker' : 'No scheduled doses today',
      icon: Activity,
      className: 'border-sky-200 bg-sky-50/70 text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-300',
    },
    {
      label: 'Inventory attention',
      value: formatCount(inventoryIssueCount, 'issue'),
      note: inventoryIssueCount > 0 ? 'Low or missing active vial' : 'No active inventory gaps',
      icon: Package,
      className:
        inventoryIssueCount > 0
          ? 'border-amber-200 bg-amber-50/80 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300'
          : 'border-emerald-200 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300',
    },
    {
      label: 'Paused',
      value: formatCount(pausedCount, 'paused', 'paused'),
      note: pausedCount > 0 ? 'Review before resuming' : 'No paused regimens',
      icon: PauseCircle,
      className: 'border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300',
    },
    {
      label: 'Taking now',
      value: formatCount(activeCount, 'active', 'active'),
      note: activeCount > 0 ? 'Current active regimens' : 'No active regimens',
      icon: CheckCircle2,
      className: 'border-emerald-200 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300',
    },
  ];

  return (
    <section aria-label="Regimen attention summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, note, icon: Icon, className }) => (
        <div key={label} className={`rounded-lg border px-4 py-3 ${className}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-75">{label}</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-gray-950 dark:text-gray-100">{value}</p>
            </div>
            <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
          </div>
          <p className="mt-1 truncate text-xs opacity-75">{note}</p>
        </div>
      ))}
    </section>
  );
}

function RegimenSummaryView({
  protocols,
  runoutByProtocolId,
  cycles,
  doseDisplayByProtocolId,
  isPending,
  onPause,
  onResume,
}: {
  protocols: Protocol[];
  runoutByProtocolId: Record<string, RunoutInfo>;
  cycles: Record<string, { startDate: string; endDate: string | null }>;
  doseDisplayByProtocolId: Record<string, DoseDisplay>;
  isPending: boolean;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}) {
  const todayUTC = utcMidnightToday();
  const todayISO = formatUTCDateISO(todayUTC);

  if (protocols.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-white py-12 text-center dark:border-gray-800 dark:bg-gray-950">
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">No active regimens for this subject.</p>
        <Link
          href="/tracker/protocols/new"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Create Protocol
        </Link>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <table aria-label="Regimen workspace" className="w-full border-separate border-spacing-0 text-sm md:table-fixed">
        <thead className="hidden md:table-header-group bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">
          <tr>
            <th scope="col" className="w-[30%] px-4 py-3 text-left font-semibold">Compound</th>
            <th scope="col" className="w-[9%] px-4 py-3 text-left font-semibold">Status</th>
            <th scope="col" className="w-[10%] px-4 py-3 text-left font-semibold">Dose</th>
            <th scope="col" className="w-[10%] px-4 py-3 text-left font-semibold">Schedule</th>
            <th scope="col" className="w-[18%] px-4 py-3 text-left font-semibold">Cycle</th>
            <th scope="col" className="w-[13%] px-4 py-3 text-left font-semibold">Inventory</th>
            <th scope="col" className="w-[10%] px-4 py-3 text-left font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="block md:table-row-group p-3 md:p-0">
          {protocols.map((p) => {
            const runout = runoutByProtocolId[p.id];
            const timingLabel = getSummaryTimingLabel(p, todayUTC);
            const dd = doseDisplayByProtocolId[p.id];
            const whyStatement = getCompoundWhyStatement(p.compound.name);
            const doseText = dd?.doseText ?? `${p.dose.amount} ${p.dose.unit}`;
            const unitsText = dd?.unitsText ?? '—';
            const isReconstitutePrompt = unitsText.startsWith('·');
            const frequencyText = dd?.frequencyText ?? formatScheduleText(p.schedule);
            const statusLabel = getProtocolStatusLabel(p, todayUTC);
            const dueToday = isDueToday(p, todayUTC);

            const wi = getWeekInfo(
              { startDate: p.startDate, endDate: p.endDate, cycleId: p.cycleId },
              {
                cycleLengthWeeks: p.compound.profile?.cycleLengthWeeks ?? null,
                restPeriodWeeks: p.compound.profile?.restPeriodWeeks ?? null,
              },
              todayISO,
              cycles
            );
            const showCycle = wi !== null && !wi.isContinuous;

            return (
              <tr
                key={p.id}
                className="mb-3 block rounded-lg border border-gray-100 bg-white last:mb-0 dark:border-gray-800 dark:bg-gray-950 md:mb-0 md:table-row md:rounded-none md:border-0"
              >
                <td className="block md:table-cell px-4 py-3 align-top">
                  <span className="block md:hidden text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Compound</span>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Link
                      href={`/tracker/protocols/${p.id}/edit`}
                      className="font-semibold text-gray-950 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:text-gray-100"
                    >
                      {p.compound.name}
                    </Link>
                    <span className="rounded-md bg-primary/10 dark:bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {formatRouteLabel(p.administrationRoute)}
                    </span>
                    {dueToday && (
                      <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-300">
                        Today
                      </span>
                    )}
                    {timingLabel && (
                      <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-300">
                        {timingLabel}
                      </span>
                    )}
                  </div>
                  {whyStatement && (
                    <p
                      title={whyStatement}
                      className="mt-1 max-w-[20rem] truncate text-xs text-gray-500 dark:text-gray-400"
                    >
                      {whyStatement}
                    </p>
                  )}
                  {p.compound.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.compound.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-primary/5 text-primary px-2 py-0.5 text-[10px] font-semibold"
                        >
                          {formatCategoryLabel(tag)}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="block px-4 py-3 align-top md:table-cell">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400 md:hidden">Status</span>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusBadgeStyle(statusLabel)}`}>
                    {statusLabel}
                  </span>
                </td>
                <td className="block md:table-cell px-4 py-3 align-top text-gray-700 dark:text-gray-300">
                  <span className="block md:hidden text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Dose</span>
                  <span className="font-medium tabular-nums text-gray-900 dark:text-gray-100">{doseText}</span>
                  {dd?.perDayNote && (
                    <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">{dd.perDayNote}</span>
                  )}
                  <span
                    className={`mt-1 block text-xs ${
                      isReconstitutePrompt
                        ? 'font-medium text-amber-600 dark:text-amber-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {unitsText}
                  </span>
                </td>
                <td className="block md:table-cell px-4 py-3 align-top text-gray-700 dark:text-gray-300">
                  <span className="block md:hidden text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Schedule</span>
                  <span>{frequencyText}</span>
                </td>
                <td className="block md:table-cell px-4 py-3 align-top text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  <span className="block md:hidden text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Cycle</span>
                  {showCycle && wi ? (
                    <span>
                      Week {wi.weekNumber} of {wi.totalWeeks}
                      {wi.restStartDate && (
                        <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">
                          · rest ~{formatUTCDate(wi.restStartDate)}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span>Continuous</span>
                  )}
                  <span className="block text-xs text-gray-400 dark:text-gray-500">
                    Started {formatUTCDate(p.startDate)}
                  </span>
                </td>
                <td className="block md:table-cell px-4 py-3 align-top">
                  <span className="block md:hidden text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Inventory</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${getRunoutBadgeStyle(runout)}`}>
                      {getRunoutBadgeLabel(runout)}
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        runout.status === 'empty'
                          ? 'text-red-600 dark:text-red-400'
                          : runout.status === 'warning'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {runout.display}
                    </span>
                  </div>
                </td>
                <td className="block px-4 py-3 align-top md:table-cell">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400 md:hidden">Actions</span>
                  <div className="flex flex-wrap gap-2 md:flex-col">
                    <Link
                      href="/tracker"
                      aria-label={`Log dose for ${p.compound.name}`}
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:w-full"
                    >
                      <ClipboardList aria-hidden="true" className="h-3.5 w-3.5" />
                      Log dose
                    </Link>
                    <Link
                      href={`/tracker/protocols/${p.id}/edit`}
                      aria-label={`Edit ${p.compound.name}`}
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900 md:w-full"
                    >
                      <Edit3 aria-hidden="true" className="h-3.5 w-3.5" />
                      Edit
                    </Link>
                    {p.status === 'ACTIVE' && (
                      <button
                        type="button"
                        aria-label={`Pause ${p.compound.name}`}
                        onClick={() => onPause(p.id)}
                        disabled={isPending}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300 dark:hover:bg-amber-950/50 md:w-full"
                      >
                        <Pause aria-hidden="true" className="h-3.5 w-3.5" />
                        Pause
                      </button>
                    )}
                    {p.status === 'PAUSED' && (
                      <button
                        type="button"
                        aria-label={`Resume ${p.compound.name}`}
                        onClick={() => onResume(p.id)}
                        disabled={isPending}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300 dark:hover:bg-emerald-950/50 md:w-full"
                      >
                        <Play aria-hidden="true" className="h-3.5 w-3.5" />
                        Resume
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}


export function RegimenClient({
  initialProtocols,
  vials,
  users,
  actorUserId,
  cycles = EMPTY_CYCLES,
  doseDisplayByProtocolId = EMPTY_DOSE_DISPLAY,
}: RegimenClientProps) {
  const parsedProtocols = React.useMemo(() => {
    return initialProtocols.map((p) => ({
      ...p,
      startDate: p.startDate instanceof Date ? p.startDate : new Date(p.startDate),
      endDate: p.endDate ? (p.endDate instanceof Date ? p.endDate : new Date(p.endDate)) : null,
    })) as Protocol[];
  }, [initialProtocols]);

  const [selectedUserId, setSelectedUserId] = useState<string>(actorUserId);
  const [showDeactivated, setShowDeactivated] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'summary' | 'cards'>('summary');
  const [protocols, setProtocols] = useState<Protocol[]>(parsedProtocols);

  useEffect(() => {
    setProtocols(parsedProtocols);
  }, [parsedProtocols]);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeUser = users.find((u) => u.id === selectedUserId);
  const syringeStandard = activeUser?.syringeStandard ?? 'U100';

  const filteredProtocols = protocols.filter((p) => {
    const matchesUser = p.userId === selectedUserId;
    const matchesStatus = showDeactivated ? p.status === 'DEACTIVATED' : p.status !== 'DEACTIVATED';
    return matchesUser && matchesStatus;
  });

  const refillProjections = useMemo(() => {
    const activeProtos = filteredProtocols.filter(p => p.status === 'ACTIVE');
    const activeCompoundIds = Array.from(new Set(activeProtos.map(p => p.compoundId)));
    
    return activeCompoundIds.map(compId => {
      const firstProto = activeProtos.find(p => p.compoundId === compId)!;
      const runout = calculateCompoundRunout(compId, selectedUserId, protocols, vials, syringeStandard);
      const hasDryVials = vials.some(v => v.compoundId === compId && v.status === 'DRY' && v.userId === selectedUserId);
      return { compound: firstProto.compound, runout, hasDryVials };
    }).filter(item => item.runout.daysLeft !== null || item.runout.status === 'empty');
  }, [filteredProtocols, selectedUserId, protocols, vials, syringeStandard]);

  const runoutByProtocolId = useMemo(() => {
    const map: Record<string, ReturnType<typeof calculateCompoundRunout>> = {};
    const cache: Record<string, ReturnType<typeof calculateCompoundRunout>> = {};
    protocols.forEach((p) => {
      const cacheKey = `${p.compoundId}:${p.userId}`;
      if (!cache[cacheKey]) {
        cache[cacheKey] = calculateCompoundRunout(p.compoundId, p.userId, protocols, vials, syringeStandard);
      }
      map[p.id] = cache[cacheKey];
    });
    return map;
  }, [protocols, vials, syringeStandard]);

  const summaryProtocols = useMemo(() => {
    const todayUTC = utcMidnightToday();
    return protocols
      .filter((p) => p.userId === selectedUserId && isWorkspaceProtocol(p, todayUTC))
      .sort((a, b) => compareSummaryProtocols(a, b, runoutByProtocolId, todayUTC));
  }, [protocols, selectedUserId, runoutByProtocolId]);

  const handlePause = async (id: string) => {
    startTransition(async () => {
      setErrorMsg(null);
      const res = await pauseProtocolAction({ protocolId: id });
      if (res.ok) {
        setProtocols((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: 'PAUSED' } : p))
        );
      } else {
        setErrorMsg(res.message || 'Failed to pause protocol');
      }
    });
  };

  const handleResume = async (id: string) => {
    startTransition(async () => {
      setErrorMsg(null);
      const res = await resumeProtocolAction({ protocolId: id });
      if (res.ok) {
        setProtocols((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: 'ACTIVE' } : p))
        );
      } else {
        setErrorMsg(res.message || 'Failed to resume protocol');
      }
    });
  };

  const handleDeactivate = async (id: string) => {
    if (!window.confirm('Are you sure you want to deactivate this protocol? All future pending dose logs will be deleted.')) {
      return;
    }
    startTransition(async () => {
      setErrorMsg(null);
      const res = await deactivateProtocolAction({ protocolId: id });
      if (res.ok) {
        setProtocols((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: 'DEACTIVATED' } : p))
        );
      } else {
        setErrorMsg(res.message || 'Failed to deactivate protocol');
      }
    });
  };

  return (
    <div className="space-y-6 animate-page-enter">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 text-pretty dark:text-gray-100">Regimen</h1>
          <p className="mt-1 text-sm text-gray-500">Track current schedules, inventory gaps, and maintenance actions.</p>
        </div>
        <Link
          href="/tracker/protocols/new"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          New Protocol
        </Link>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        >
          {errorMsg}
        </div>
      )}

      <RegimenAttentionSummary protocols={summaryProtocols} runoutByProtocolId={runoutByProtocolId} />

      {/* Filters Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800/80 dark:bg-gray-900/40 sm:flex-row sm:items-center">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <label htmlFor="user-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Subject:
            </label>
            <select
              id="user-select"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="min-h-10 rounded-md border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-primary focus:ring-primary dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === actorUserId ? `${u.name || 'Me'} (Self)` : u.name || 'Managed User'}
                </option>
              ))}
            </select>
          </div>

          <div className="inline-flex self-start rounded-md border border-gray-200 bg-white p-0.5 text-xs font-semibold dark:border-gray-800 dark:bg-gray-950 sm:self-auto">
            <button
              type="button"
              aria-pressed={viewMode === 'summary'}
              onClick={() => setViewMode('summary')}
              className={`flex min-h-10 items-center gap-1.5 rounded px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                viewMode === 'summary'
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
              }`}
            >
              <List aria-hidden="true" className="h-3.5 w-3.5" />
              Summary
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'cards'}
              onClick={() => setViewMode('cards')}
              className={`flex min-h-10 items-center gap-1.5 rounded px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                viewMode === 'cards'
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
              }`}
            >
              <LayoutGrid aria-hidden="true" className="h-3.5 w-3.5" />
              Cards
            </button>
          </div>
        </div>

        {viewMode === 'cards' && (
          <label htmlFor="show-deactivated" className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-1 text-sm text-gray-700 dark:text-gray-300">
            <input
              id="show-deactivated"
              type="checkbox"
              checked={showDeactivated}
              onChange={(e) => setShowDeactivated(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary dark:border-gray-800"
            />
              Show deactivated protocols
          </label>
        )}
      </div>

      {/* Refill Planner & Timeline Widget */}
      {viewMode === 'cards' && refillProjections.length > 0 && (
        <div className="rounded-2xl border border-sky-100/25 bg-sky-500/[0.03] dark:bg-sky-950/10 p-5 backdrop-blur-md space-y-4">
          <div className="flex items-center gap-2">
            <Calendar aria-hidden="true" className="h-5 w-5 text-sky-400" />
            <div>
              <h2 className="text-sm font-bold text-foreground">Regimen Refill Planner</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Visual timeline of when active vials will deplete based on current protocol frequency.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {refillProjections.map(({ compound, runout, hasDryVials }) => {
              const days = runout.daysLeft ?? 0;
              const percent = Math.min(100, (days / 30) * 100);
              const isCriticallyLow = days < 7;
              
              let trackColor = 'bg-emerald-500';
              let alertStyle = '';
              if (days === 0) {
                trackColor = 'bg-red-500';
              } else if (isCriticallyLow) {
                trackColor = 'bg-amber-500 animate-pulse';
                alertStyle = 'border-amber-200 dark:border-amber-900/40 bg-amber-500/5';
              }

              return (
                <div
                  key={compound.id}
                  className={`p-4 rounded-xl border border-border bg-white/5 dark:bg-black/15 flex flex-col justify-between space-y-3 ${alertStyle}`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-foreground truncate max-w-[150px]">
                        {compound.name}
                      </span>
                      <span className={`text-[10px] font-bold ${days === 0 ? 'text-red-500' : isCriticallyLow ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {runout.daysLeft === null ? 'No Active Vial' : runout.daysLeft >= 730 ? '730+ days left' : days === 0 ? 'Depleted' : `${days} day${days > 1 ? 's' : ''} left`}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      Runout: {runout.display.split(' (')[0]}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    {/* Timeline bar */}
                    <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${trackColor} transition-[width] duration-500`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[8px] text-muted-foreground font-semibold uppercase tracking-wider">
                      <span>Depleted</span>
                      <span>30+ Days Stable</span>
                    </div>
                  </div>

                  {isCriticallyLow && (
                    <div className="pt-2 border-t border-dashed border-border flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[9px] text-amber-600 dark:text-amber-400 font-medium">
                        <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        <span>Low Stock Alert</span>
                      </div>
                      {hasDryVials ? (
                        selectedUserId === actorUserId ? (
                          <Link
                            href={`/reconstitution?reconstitute=${compound.id}`}
                            className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold bg-sky-500 hover:bg-sky-600 text-white rounded transition-colors"
                          >
                            <Snowflake aria-hidden="true" className="h-2.5 w-2.5" />
                            Mix Reserve
                          </Link>
                        ) : (
                          <span className="text-[8px] text-muted-foreground italic">Mix Reserve (self-only)</span>
                        )
                      ) : (
                        <span className="text-[8px] text-muted-foreground italic">No dry vials in freezer</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Protocols Grid / Summary */}
      {viewMode === 'summary' ? (
        <RegimenSummaryView
          protocols={summaryProtocols}
          runoutByProtocolId={runoutByProtocolId}
          cycles={cycles}
          doseDisplayByProtocolId={doseDisplayByProtocolId}
          isPending={isPending}
          onPause={handlePause}
          onResume={handleResume}
        />
      ) : filteredProtocols.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-gray-950 border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
          <p className="text-gray-400 text-sm mb-4">No protocols configured for this selection.</p>
          {!showDeactivated && (
            <Link
              href="/tracker/protocols/new"
              className="text-primary text-sm font-semibold hover:underline"
            >
              Add a new protocol now →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredProtocols.map((p) => {
            const runout = runoutByProtocolId[p.id];
            const lowDoseParsed = p.compound.profile?.dosingLow ? (typeof p.compound.profile.dosingLow === 'string' ? JSON.parse(p.compound.profile.dosingLow) : p.compound.profile.dosingLow) : null;
            const typicalDoseParsed = p.compound.profile?.dosingTypical ? (typeof p.compound.profile.dosingTypical === 'string' ? JSON.parse(p.compound.profile.dosingTypical) : p.compound.profile.dosingTypical) : null;
            const highDoseParsed = p.compound.profile?.dosingHigh ? (typeof p.compound.profile.dosingHigh === 'string' ? JSON.parse(p.compound.profile.dosingHigh) : p.compound.profile.dosingHigh) : null;

            // Extract expected benefits dynamically from dosing details
            const benefitsList = [
              lowDoseParsed?.researchBenefits,
              typicalDoseParsed?.researchBenefits,
              highDoseParsed?.researchBenefits
            ].filter(Boolean);

            const capColor = getCapColor(p.compound.slug, p.compound.id);

            return (
              <div
                key={p.id}
                style={{
                  borderColor: p.status === 'ACTIVE' ? `${capColor}25` : undefined,
                  boxShadow: p.status === 'ACTIVE' ? `0 4px 20px -6px ${capColor}15` : undefined,
                }}
                className={`relative flex flex-col justify-between overflow-hidden rounded-lg border shadow-sm transition-shadow duration-200 hover:shadow-md ${
                  p.status === 'PAUSED'
                    ? 'border-yellow-200 dark:border-yellow-900 bg-yellow-50/20 dark:bg-yellow-950/5'
                    : p.status === 'DEACTIVATED'
                    ? 'border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/20 opacity-75'
                    : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950'
                }`}
              >
                {/* Protocol Card Top */}
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="inline-flex items-center rounded-md bg-primary/10 dark:bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary mb-2">
                        {formatRouteLabel(p.administrationRoute)}
                      </span>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                        {p.compound.name}
                      </h3>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-1">
                        <span className="font-mono">{p.dose.amount}</span> {p.dose.unit} · {formatScheduleText(p.schedule)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          p.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300'
                            : p.status === 'PAUSED'
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
                        }`}
                      >
                        {getProtocolStatusLabel(p, utcMidnightToday())}
                      </span>
                    </div>
                  </div>

                  {/* Dates & Inventory projection */}
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-900 grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <p className="text-gray-400 font-medium uppercase tracking-wide">Start Date</p>
                      <p className="font-medium text-gray-900 dark:text-gray-100 mt-0.5">
                        {new Date(p.startDate).toLocaleDateString(undefined, {
                          timeZone: 'UTC',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400 font-medium uppercase tracking-wide">Inventory Runout</p>
                      <p
                        className={`font-semibold mt-0.5 ${
                          runout.status === 'empty'
                            ? 'text-red-600 dark:text-red-400'
                            : runout.status === 'warning'
                            ? 'text-yellow-600 dark:text-yellow-400'
                            : 'text-green-600 dark:text-green-400'
                        }`}
                      >
                        {runout.display}
                      </p>
                    </div>
                  </div>

                  {/* Expected Benefits & Warnings */}
                  <div className="mt-6 space-y-4">
                    {/* Benefits */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Research Benefits</h4>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 leading-relaxed">
                        {benefitsList.length > 0
                          ? benefitsList.join(' · ')
                          : p.compound.mechanismOfAction || 'Stimulates local cellular regeneration and healing.'}
                      </p>
                    </div>

                    {/* Side Effects */}
                    {p.compound.profile?.sideEffects && (
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Side Effects to Watch Out For</h4>
                        <p className="text-sm text-yellow-800 dark:text-yellow-300 mt-1 leading-relaxed">
                          {p.compound.profile?.sideEffects}
                        </p>
                      </div>
                    )}

                    {/* Citations */}
                    {p.compound.profile?.citations && p.compound.profile?.citations.length > 0 && (
                      <div className="pt-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Citations</h4>
                        <ul className="mt-1 space-y-1">
                          {p.compound.profile?.citations?.map((c) => (
                            <li key={c.id} className="text-xs">
                              {c.url ? (
                                <a
                                  href={c.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline font-medium"
                                >
                                  {c.title}
                                </a>
                              ) : (
                                <span className="text-gray-600 dark:text-gray-400">{c.title}</span>
                              )}
                              {c.pmid && <span className="text-gray-400 ml-1">(PMID: {c.pmid})</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* Protocol Card Bottom Actions */}
                <div className="bg-gray-50 dark:bg-gray-900/60 px-6 py-4 flex flex-col gap-3 border-t border-gray-100 dark:border-gray-900 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="flex flex-wrap gap-2">
                    {p.status === 'ACTIVE' && (
                      <button
                        onClick={() => handlePause(p.id)}
                        disabled={isPending}
                        className="min-h-9 rounded-lg border border-yellow-200 dark:border-yellow-900/40 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-800 dark:text-yellow-400 px-3 py-2 text-xs font-semibold hover:bg-yellow-100 dark:hover:bg-yellow-950/50 disabled:opacity-50 transition-colors"
                      >
                        Pause
                      </button>
                    )}
                    {p.status === 'PAUSED' && (
                      <button
                        onClick={() => handleResume(p.id)}
                        disabled={isPending}
                        className="min-h-9 rounded-lg border border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-950/20 text-green-800 dark:text-green-400 px-3 py-2 text-xs font-semibold hover:bg-green-100 dark:hover:bg-green-950/50 disabled:opacity-50 transition-colors"
                      >
                        Resume
                      </button>
                    )}
                    {p.status !== 'DEACTIVATED' && (
                      <>
                        <Link
                          href={`/tracker/protocols/${p.id}/edit`}
                          className="min-h-9 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-700 dark:text-gray-300 px-3 py-2 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors flex items-center"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => handleDeactivate(p.id)}
                          disabled={isPending}
                          className="min-h-9 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-400 px-3 py-2 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-950/50 disabled:opacity-50 transition-colors"
                        >
                          Deactivate
                        </button>
                      </>
                    )}
                  </div>

                  <Link
                    href={`/tracker/protocols/new?cloneFrom=${p.id}`}
                    className="inline-flex min-h-9 items-center self-start rounded-md px-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 hover:text-primary/95 sm:self-auto"
                  >
                    Clone Protocol
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
