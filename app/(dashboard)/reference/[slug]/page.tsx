import React from 'react';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/shared/prisma';
import { getCompoundBySlug } from '@/lib/reference/application/CompoundService';
import type { Citation } from '@/lib/reference/domain/types';
import { getSerializedVialsForCompound } from '@/lib/reconstitution/application/VialService';
import { CompoundInventoryManager } from '../_components/CompoundInventoryManager';
import { DosingReconstitutionPlanner } from '../_components/DosingReconstitutionPlanner';

function CitationLink({ citation }: { citation: Citation }) {
  const href = citation.url
    ? citation.url
    : citation.pmid
    ? `https://pubmed.ncbi.nlm.nih.gov/${citation.pmid}/`
    : citation.doi
    ? `https://doi.org/${citation.doi}`
    : null;

  return (
    <li className="text-sm text-gray-600 dark:text-gray-300">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-primary"
        >
          {citation.title}
        </a>
      ) : (
        citation.title
      )}
      {citation.doi && <span className="ml-1 text-gray-400 dark:text-gray-500">DOI: {citation.doi}</span>}
      {citation.pmid && <span className="ml-1 text-gray-400 dark:text-gray-500">PMID: {citation.pmid}</span>}
    </li>
  );
}

function InfoTooltip({ content }: { content: string }) {
  return (
    <div className="relative group inline-block ml-1">
      <span
        className="inline-flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-primary dark:hover:text-primary transition-colors cursor-help p-0.5"
        aria-label="More information"
      >
        <Info className="h-3.5 w-3.5" />
      </span>
      
      {/* Tooltip Card */}
      <div className="absolute bottom-full right-[-8px] z-50 mb-2 w-64 scale-95 opacity-0 pointer-events-none group-hover:scale-100 group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200 ease-out origin-bottom-right">
        <div className="bg-gray-900/95 dark:bg-gray-800/95 text-white text-[11px] leading-relaxed p-2.5 rounded-lg shadow-xl border border-gray-700/50 dark:border-gray-600/50 backdrop-blur-sm normal-case font-normal text-left tracking-normal">
          {content}
          {/* Arrow */}
          <div className="absolute top-full right-[15px] h-1.5 w-1.5 -translate-y-0.5 rotate-45 bg-gray-900/95 dark:bg-gray-800/95 border-r border-b border-gray-700/50 dark:border-gray-600/50" />
        </div>
      </div>
    </div>
  );
}

function FormattedMechanismOfAction({ text }: { text: string }) {
  if (!text) return null;
  if (!text.includes('###')) {
    return <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{text}</p>;
  }

  const sections = text.split(/(?=^###\s)/m);
  return (
    <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
      {sections.map((section, idx) => {
        const trimmed = section.trim();
        if (!trimmed) return null;
        const lines = trimmed.split(/\r?\n/);
        const headingLine = lines[0];
        const bodyLines = lines.slice(1).join('\n');

        if (/^###(?!#)/.test(headingLine)) {
          const heading = headingLine.replace(/^###\s*/, '');
          return (
            <div key={idx} className="space-y-1.5">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-2">{heading}</h3>
              {bodyLines.trim() && (
                <p className="whitespace-pre-wrap leading-relaxed">{bodyLines}</p>
              )}
            </div>
          );
        }
        return <p key={idx} className="whitespace-pre-wrap leading-relaxed">{trimmed}</p>;
      })}
    </div>
  );
}
function formatFrequency(freq: string | null): string {
  if (!freq) return 'Not Specified';
  switch (freq) {
    case 'DAILY': return 'Daily';
    case 'EOD': return 'Every Other Day';
    case 'THRICE_WEEKLY': return 'Thrice Weekly';
    case 'WEEKLY': return 'Once Weekly';
    case 'TWICE_WEEKLY': return 'Twice Weekly';
    case 'EVERY_TWO_WEEKS': return 'Every Two Weeks';
    case 'EVERY_FOUR_WEEKS': return 'Every Four Weeks';
    case 'AS_NEEDED': return 'As Needed';
    case 'CUSTOM': return 'Custom Protocol';
    default: return freq;
  }
}

function formatPreferredTime(time: string | null): string {
  if (!time) return 'N/A';
  switch (time) {
    case 'MORNING': return 'Morning';
    case 'AFTERNOON': return 'Afternoon';
    case 'NIGHT': return 'Nighttime';
    case 'PRE_WORKOUT': return 'Pre-Workout';
    case 'POST_WORKOUT': return 'Post-Workout';
    case 'MORNING_AND_NIGHT': return 'Morning and Night';
    case 'MORNING_AFTERNOON_NIGHT': return 'Morning, Afternoon, and Night';
    case 'PRE_AND_POST_WORKOUT': return 'Pre and Post-Workout';
    case 'ANYTIME': return 'Anytime';
    case 'AS_NEEDED': return 'As Needed';
    default: return time;
  }
}

export default async function CompoundProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { slug } = await params;
  const compound = await getCompoundBySlug(slug);

  if (!compound) notFound();

  const isArchived = compound.status === 'ARCHIVED';

  const serializedVials = await getSerializedVialsForCompound(session.user.id, compound.id);

  // The catalog planner defaults to the user's saved syringe standard (U-100 by
  // default) so its unit math matches the standalone calculator and the rest of
  // the app. Users can still flip U-100/U-40 within the planner.
  const userSettings = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { syringeStandard: true },
  });
  const syringeStandard = (userSettings?.syringeStandard as 'U100' | 'U40') ?? 'U100';

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6 animate-page-enter">
      <nav className="mb-4">
        <Link href="/reference" className="text-sm text-primary hover:underline">
          ← Catalog
        </Link>
      </nav>

      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        {isArchived ? `${compound.name} (archived)` : compound.name}
      </h1>

      {compound.iupacName && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 font-mono break-all">{compound.iupacName}</p>
      )}

      {compound.synonyms.length > 0 && (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Also known as: {compound.synonyms.join(', ')}
        </p>
      )}

      {compound.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {compound.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs bg-primary/5 text-primary rounded-full px-2 py-0.5"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <CompoundInventoryManager
        compoundId={compound.id}
        compoundName={compound.name}
        vials={serializedVials}
        fridgeShelfLifeMonths={compound.profile?.fridgeShelfLifeMonths ?? 12}
        freezerShelfLifeMonths={compound.profile?.freezerShelfLifeMonths ?? 24}
        reconstitutedShelfLifeDays={compound.profile?.reconstitutedShelfLifeDays ?? 14}
      />

      {!compound.profile && (
        <div className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-950/30 dark:bg-yellow-950/20">
          <p className="text-sm text-yellow-800 dark:text-yellow-300 font-medium">Profile in progress</p>
          <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-400">
            Dosing and clinical information will be added soon.
          </p>
        </div>
      )}

      {compound.mechanismOfAction && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
            Mechanism of Action
          </h2>
          <FormattedMechanismOfAction text={compound.mechanismOfAction} />
        </section>
      )}

      {compound.profile?.benefitTimeline && compound.profile.benefitTimeline.length > 0 && (
        <section className="mt-8 border border-border bg-card text-card-foreground rounded-xl p-5 shadow-sm animate-[fadeIn_0.3s_ease-out]">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-6">
            <span>⏱️</span> Clinical Progression Timeline
          </h2>
          <div className="relative pl-6 border-l-2 border-primary/20 space-y-6">
            {compound.profile.benefitTimeline.map((item) => (
              <div key={item.week} className="relative group">
                {/* Pulsing Timeline Node Indicator */}
                <div className="absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-card border-2 border-primary group-hover:scale-125 transition-all duration-200 shadow-sm">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                    Week {item.week}
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md font-semibold tracking-wide">
                      {item.week === 1
                        ? 'Acute Onset'
                        : item.week === 2
                        ? 'Stabilization'
                        : item.week === 4
                        ? 'Therapeutic Phase'
                        : item.week === 8
                        ? 'Remodeling'
                        : 'Peak Efficacy'}
                    </span>
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {item.benefits.map((benefit, bIdx) => (
                      <li key={bIdx} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2 leading-relaxed">
                        <span className="text-primary mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {compound.profile && (
        <section className="mt-8 border border-border bg-card text-card-foreground rounded-xl p-5 shadow-sm animate-[fadeIn_0.3s_ease-out]">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-4" id="dosing-protocol-header">
            <span>⏱️</span> {"Protocol & Scheduling"}
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cycle Duration */}
            <div className="border border-border/50 bg-background/50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">🗓️ Cycle Duration</span>
                <InfoTooltip content="The active duration of continuous administration. Restricting use to a defined cycle length prevents receptor downregulation and lets your body recover." />
              </div>
              <div className="mt-1 text-base font-bold text-gray-900 dark:text-gray-100">
                {compound.profile.cycleLengthWeeks ? `${compound.profile.cycleLengthWeeks} Weeks` : 'Continuous'}
              </div>
            </div>

            {/* Weekly Schedule */}
            <div className="border border-border/50 bg-background/50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">🔄 Weekly Schedule</span>
                <InfoTooltip content="The weekly timing cadence. Some protocols include planned 'days off' per week to preserve receptor sensitivity and prevent habituation." />
              </div>
              <div className="mt-1 text-base font-bold text-gray-900 dark:text-gray-100">
                {compound.profile.dosingFrequency === 'CUSTOM' ? (
                  compound.profile.customFrequencyDescription || 'Custom Protocol'
                ) : compound.profile.dosingFrequency === 'DAILY' ? (
                  compound.profile.daysOn && compound.profile.daysOff ? (
                    `${compound.profile.dosesPerDay && compound.profile.dosesPerDay > 1 ? `${compound.profile.dosesPerDay}x Daily: ` : ''}${compound.profile.daysOn} Days On / ${compound.profile.daysOff} Off`
                  ) : (
                    `${compound.profile.dosesPerDay && compound.profile.dosesPerDay > 1 ? `${compound.profile.dosesPerDay}x ` : ''}Daily`
                  )
                ) : (
                  `${formatFrequency(compound.profile.dosingFrequency)}${
                    compound.profile.dosesPerDay && compound.profile.dosesPerDay > 1 
                      ? ` (${compound.profile.dosesPerDay}x per admin day)` 
                      : ''
                  }`
                )}
              </div>
            </div>

            {/* Rest Period */}
            <div className="border border-border/50 bg-background/50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">🛑 Rest Period</span>
                <InfoTooltip content="The recommended off-cycle washout period. Essential to clear active substances, restore baseline hormone production, and maintain long-term efficacy." />
              </div>
              <div className="mt-1 text-base font-bold text-gray-900 dark:text-gray-100">
                {compound.profile.restPeriodWeeks ? `${compound.profile.restPeriodWeeks} Weeks Washout` : 'N/A'}
              </div>
            </div>

            {/* Administration Time */}
            <div className="border border-border/50 bg-background/50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">⏰ Administration</span>
                <InfoTooltip content="The optimal time of day to administer the dose. Timing is aligned with natural circadian rhythms, sleep cycles, or fasted states for maximum uptake." />
              </div>
              <div className="mt-1 text-base font-bold text-gray-900 dark:text-gray-100">
                {formatPreferredTime(compound.profile.preferredTime)}
              </div>
            </div>
          </div>

          {/* Timing Protocol */}
          {compound.profile.timingNotes && compound.profile.timingNotes.trim().length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <span>💡</span> Timing Protocol
              </h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 italic">
                &quot;{compound.profile.timingNotes}&quot;
              </p>
            </div>
          )}

          {/* Safety Disclaimer */}
          {!compound.profile.isFdaApproved && (
            <div className="mt-4 border border-red-200 bg-red-50/50 p-4 rounded-lg dark:border-red-950/30 dark:bg-red-950/10">
              <div className="flex gap-2 text-red-800 dark:text-red-300">
                <span className="text-base shrink-0">⚠️</span>
                <div className="text-sm leading-relaxed" id="fda-disclaimer">
                  <strong className="font-semibold">DISCLAIMER:</strong> This compound is not FDA-approved for therapeutic human use. Protocols are for research-use only based on scientific literature, including preclinical studies and early clinical research.
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {compound.administrationRoutes.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
            Administration Routes
          </h2>
          <div className="flex flex-wrap gap-2">
            {compound.administrationRoutes.map((route) => (
              <span
                key={route}
                className="text-sm bg-gray-100 text-gray-700 rounded px-2 py-1 dark:bg-zinc-800 dark:text-gray-300"
              >
                {route}
              </span>
            ))}
          </div>
        </section>
      )}

      {compound.profile && (
        <>
          <section className="mt-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
              Dosing Reference
            </h2>
            <DosingReconstitutionPlanner
              dosingLow={compound.profile.dosingLow}
              dosingTypical={compound.profile.dosingTypical}
              dosingHigh={compound.profile.dosingHigh}
              isFdaApproved={compound.profile.isFdaApproved}
              initialSyringeStandard={syringeStandard}
            />
          </section>

          {compound.profile.sideEffects && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                Side Effects
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300">{compound.profile.sideEffects}</p>
            </section>
          )}

          {compound.profile.stackingNotes && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                Stacking Notes
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300">{compound.profile.stackingNotes}</p>
            </section>
          )}

          {compound.profile.citations.length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                Citations
              </h2>
              <ul className="space-y-1">
                {compound.profile.citations.map((cit) => (
                  <CitationLink key={cit.id} citation={cit} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
