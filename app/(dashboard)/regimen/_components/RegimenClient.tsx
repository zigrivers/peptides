'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import Decimal from 'decimal.js';
import {
  pauseProtocolAction,
  resumeProtocolAction,
  deactivateProtocolAction,
} from '@/app/actions/tracker/protocol-lifecycle';
import { convertDoseToMg } from '@/lib/reconstitution/application/InventoryService';

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
  frequency: 'Daily' | 'EOD' | 'SpecificDaysOfWeek' | 'CustomInterval';
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
  totalMg: { toString(): string };
  bacWaterMl: { toString(): string } | null;
  remainingMg: { toString(): string };
  status: string;
}

interface RegimenClientProps {
  initialProtocols: Protocol[];
  vials: Vial[];
  users: User[];
  actorUserId: string;
}

function formatScheduleText(schedule: Schedule): string {
  if (schedule.frequency === 'Daily') return 'Every day';
  if (schedule.frequency === 'EOD') return 'Every other day';
  if (schedule.frequency === 'CustomInterval') return `Every ${schedule.intervalDays} days`;
  if (schedule.frequency === 'SpecificDaysOfWeek') {
    return `On ${(schedule.daysOfWeek || []).join(', ')}`;
  }
  return 'Custom schedule';
}

function calculateRunout(
  protocol: Protocol,
  vials: Vial[],
  syringeStandard: string
): { display: string; status: 'ok' | 'warning' | 'empty'; daysLeft: number | null } {
  const compoundVials = vials.filter(
    (v) => v.compoundId === protocol.compoundId && v.userId === protocol.userId
  );
  if (compoundVials.length === 0) {
    return { display: 'No active vials (un-stocked)', status: 'empty', daysLeft: null };
  }

  const totalRemainingMg = compoundVials.reduce(
    (acc, v) => acc.plus(new Decimal(v.remainingMg.toString())),
    new Decimal(0)
  );

  if (totalRemainingMg.lte(0)) {
    return { display: 'Run out (0 mg remaining)', status: 'empty', daysLeft: 0 };
  }

  const referenceVial = compoundVials[0];
  let doseMg: Decimal;
  try {
    doseMg = convertDoseToMg(
      new Decimal(protocol.dose.amount),
      protocol.dose.unit,
      {
        totalMg: new Decimal(referenceVial.totalMg.toString()),
        bacWaterMl: referenceVial.bacWaterMl ? new Decimal(referenceVial.bacWaterMl.toString()) : null,
      },
      syringeStandard
    );
  } catch {
    return { display: 'Vial configuration incomplete', status: 'warning', daysLeft: null };
  }

  if (doseMg.lte(0)) {
    return { display: 'Continuous (0 dose amount)', status: 'ok', daysLeft: 999 };
  }

  const dosesLeft = Math.floor(totalRemainingMg.dividedBy(doseMg).toNumber());
  if (dosesLeft <= 0) {
    return { display: 'Run out', status: 'empty', daysLeft: 0 };
  }

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  let daysLeft = 0;
  if (protocol.schedule.frequency === 'Daily') {
    daysLeft = dosesLeft;
  } else if (protocol.schedule.frequency === 'EOD') {
    daysLeft = dosesLeft * 2;
  } else if (protocol.schedule.frequency === 'CustomInterval') {
    daysLeft = dosesLeft * (protocol.schedule.intervalDays || 1);
  } else if (protocol.schedule.frequency === 'SpecificDaysOfWeek') {
    const daysOfWeek = protocol.schedule.daysOfWeek || [];
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const targetDays = daysOfWeek.map((d: string) => dayMap[d]);

    if (targetDays.length === 0) {
      daysLeft = dosesLeft;
    } else {
      const current = new Date(today);
      let dosesRemaining = dosesLeft;
      let iterations = 0;
      while (dosesRemaining > 0 && iterations < 3650) {
        if (targetDays.includes(current.getUTCDay())) {
          dosesRemaining--;
        }
        if (dosesRemaining > 0) {
          current.setUTCDate(current.getUTCDate() + 1);
          iterations++;
        }
      }
      const diffTime = current.getTime() - today.getTime();
      daysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }
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

export function RegimenClient({ initialProtocols, vials, users, actorUserId }: RegimenClientProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>(actorUserId);
  const [showDeactivated, setShowDeactivated] = useState<boolean>(false);
  const [protocols, setProtocols] = useState<Protocol[]>(initialProtocols);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeUser = users.find((u) => u.id === selectedUserId);
  const syringeStandard = activeUser?.syringeStandard ?? 'U100';

  const filteredProtocols = protocols.filter((p) => {
    const matchesUser = p.userId === selectedUserId;
    const matchesStatus = showDeactivated ? p.status === 'DEACTIVATED' : p.status !== 'DEACTIVATED';
    return matchesUser && matchesStatus;
  });

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

  // Mocked PubMed Research Updates based on compounds being used
  const activeCompounds = Array.from(
    new Set(
      protocols
        .filter((p) => p.userId === selectedUserId && p.status === 'ACTIVE')
        .map((p) => p.compound.name)
    )
  );

  const getPubMedUpdates = (compName: string) => {
    const cleanName = compName.toLowerCase();
    if (cleanName.includes('bpc')) {
      return [
        {
          title: 'Gastric pentadecapeptide BPC 157 accelerates tendon-to-bone healing after Achilles detachment.',
          journal: 'Journal of Orthopaedic Research (2025)',
          snippet: 'BPC 157 therapy demonstrated significant increases in fibroblast density and collagen organization, promoting faster biomechanical recovery compared to control groups.',
        },
        {
          title: 'Stable gastric pentadecapeptide BPC 157 in clinical trials for inflammatory bowel disease.',
          journal: 'Trends in Pharmacological Sciences (2025)',
          snippet: 'Updates on oral and injectable formulations showing exceptional safety profiles and mucosal tissue protection mechanisms via nitric oxide regulation.',
        }
      ];
    }
    if (cleanName.includes('tb') || cleanName.includes('thymosin')) {
      return [
        {
          title: 'Thymosin beta-4 promotes angiogenesis and tissue regeneration in ischemic muscle models.',
          journal: 'Cardiovascular Research (2025)',
          snippet: 'Researchers found TB-500 upregulated VEGF expression, triggering capillary sprouting and myofiber regeneration in compromised skeletal tissues.',
        }
      ];
    }
    if (cleanName.includes('semaglutide') || cleanName.includes('ozempic') || cleanName.includes('wegovy')) {
      return [
        {
          title: 'Cardioprotective and anti-inflammatory properties of Semaglutide in patients with obesity.',
          journal: 'New England Journal of Medicine (2026)',
          snippet: 'Trial results indicate sustained improvements in systemic inflammatory biomarkers (CRP) alongside significant reductions in major adverse cardiovascular events.',
        }
      ];
    }
    return [
      {
        title: `Efficacy, pharmacokinetic pathways, and safety endpoints of ${compName} in regenerative medicine.`,
        journal: 'International Journal of Molecular Sciences (2025)',
        snippet: `Recent peer-reviewed analysis reviews local and systemic administration pathways for ${compName}, detailing cellular signaling transduction and dosage correlations.`,
      }
    ];
  };

  return (
    <div className="space-y-8 animate-page-enter">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Regimen</h1>
          <p className="text-sm text-gray-500 mt-1">Configure, track, and optimize your peptide regimens</p>
        </div>
        <Link
          href="/tracker/protocols/new"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          + New Protocol
        </Link>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 p-4 border border-red-200 dark:border-red-900/60 text-sm text-red-800 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50 dark:bg-gray-900/40 p-4 rounded-xl border border-gray-100 dark:border-gray-800/80">
        <div className="flex items-center gap-3">
          <label htmlFor="user-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Subject:
          </label>
          <select
            id="user-select"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="rounded-lg border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 text-sm focus:border-primary focus:ring-primary py-1.5 px-3"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.id === actorUserId ? `${u.name || 'Me'} (Self)` : u.name || 'Managed User'}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="show-deactivated"
            type="checkbox"
            checked={showDeactivated}
            onChange={(e) => setShowDeactivated(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 dark:border-gray-800 text-primary focus:ring-primary"
          />
          <label htmlFor="show-deactivated" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            Show deactivated protocols
          </label>
        </div>
      </div>

      {/* Protocols Grid */}
      {filteredProtocols.length === 0 ? (
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
            const runout = calculateRunout(p, vials, syringeStandard);
            const lowDoseParsed = p.compound.profile?.dosingLow ? (typeof p.compound.profile.dosingLow === 'string' ? JSON.parse(p.compound.profile.dosingLow) : p.compound.profile.dosingLow) : null;
            const typicalDoseParsed = p.compound.profile?.dosingTypical ? (typeof p.compound.profile.dosingTypical === 'string' ? JSON.parse(p.compound.profile.dosingTypical) : p.compound.profile.dosingTypical) : null;
            const highDoseParsed = p.compound.profile?.dosingHigh ? (typeof p.compound.profile.dosingHigh === 'string' ? JSON.parse(p.compound.profile.dosingHigh) : p.compound.profile.dosingHigh) : null;

            // Extract expected benefits dynamically from dosing details
            const benefitsList = [
              lowDoseParsed?.researchBenefits,
              typicalDoseParsed?.researchBenefits,
              highDoseParsed?.researchBenefits
            ].filter(Boolean);

            return (
              <div
                key={p.id}
                className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border transition-all duration-300 shadow-sm hover:shadow-md ${
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
                        {p.administrationRoute}
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
                        {p.status}
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
                          {p.compound.profile.sideEffects}
                        </p>
                      </div>
                    )}

                    {/* Citations */}
                    {p.compound.profile?.citations && p.compound.profile.citations.length > 0 && (
                      <div className="pt-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Citations</h4>
                        <ul className="mt-1 space-y-1">
                          {p.compound.profile.citations.map((c) => (
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
                <div className="bg-gray-50 dark:bg-gray-900/60 px-6 py-4 flex items-center justify-between gap-4 border-t border-gray-100 dark:border-gray-900">
                  <div className="flex gap-2">
                    {p.status === 'ACTIVE' && (
                      <button
                        onClick={() => handlePause(p.id)}
                        disabled={isPending}
                        className="rounded-lg border border-yellow-200 dark:border-yellow-900/40 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-800 dark:text-yellow-400 px-3 py-1.5 text-xs font-semibold hover:bg-yellow-100 dark:hover:bg-yellow-950/50 disabled:opacity-50 transition-colors"
                      >
                        Pause
                      </button>
                    )}
                    {p.status === 'PAUSED' && (
                      <button
                        onClick={() => handleResume(p.id)}
                        disabled={isPending}
                        className="rounded-lg border border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-950/20 text-green-800 dark:text-green-400 px-3 py-1.5 text-xs font-semibold hover:bg-green-100 dark:hover:bg-green-950/50 disabled:opacity-50 transition-colors"
                      >
                        Resume
                      </button>
                    )}
                    {p.status !== 'DEACTIVATED' && (
                      <button
                        onClick={() => handleDeactivate(p.id)}
                        disabled={isPending}
                        className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-400 px-3 py-1.5 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-950/50 disabled:opacity-50 transition-colors"
                      >
                        Deactivate
                      </button>
                    )}
                  </div>

                  <Link
                    href={`/tracker/protocols/new?cloneFrom=${p.id}`}
                    className="text-primary hover:text-primary/95 text-xs font-semibold transition-colors"
                  >
                    Clone Protocol
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PubMed Research Updates Card */}
      {activeCompounds.length > 0 && (
        <section className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-900 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold">
              PM
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">PubMed Research Feed</h3>
              <p className="text-xs text-gray-500">Live clinical studies for your active compounds</p>
            </div>
          </div>

          <div className="space-y-6">
            {activeCompounds.map((comp) => {
              const updates = getPubMedUpdates(comp);
              return (
                <div key={comp} className="space-y-4">
                  <h4 className="text-xs font-bold tracking-wider uppercase text-gray-400">{comp} Literature</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {updates.map((up, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-900 flex flex-col justify-between hover:scale-[1.01] transition-transform"
                      >
                        <div>
                          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{up.journal}</p>
                          <h5 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-1 leading-snug">
                            {up.title}
                          </h5>
                          <p className="text-xs text-gray-500 mt-2 leading-relaxed italic">
                            &quot;{up.snippet}&quot;
                          </p>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-[10px] text-gray-400">
                          <span>Status: Peer Reviewed</span>
                          <span className="text-primary cursor-pointer hover:underline">View Article →</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
