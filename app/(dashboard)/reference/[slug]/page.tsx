import React from 'react';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, BookOpen } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/shared/prisma';
import { getCompoundBySlug } from '@/lib/reference/application/CompoundService';
import type { Citation, BenefitTimelineItem, CompoundProfile } from '@/lib/reference/domain/types';
import {
  buildProtocolSnapshotLabels,
  formatPreferredTime,
  formatSupplementSchedule,
} from '@/lib/reference/domain/protocolLabels';
import { getSerializedVialsForCompound } from '@/lib/reconstitution/application/VialService';
import { CompoundInventoryManager } from '../_components/CompoundInventoryManager';
import { DosingReconstitutionPlanner } from '../_components/DosingReconstitutionPlanner';
import { DosingGuidanceRanges, ProtocolSummaryGrid } from '../_components/DosingGuidanceRanges';
import { CompoundPairingsSection } from '../_components/CompoundPairingsSection';
import { CompoundAdjunctsSection } from '../_components/CompoundAdjunctsSection';
import { CompoundStorageStabilityGuide } from '../_components/CompoundStorageStabilityGuide';
import { getCompoundCommonName } from '@/lib/reference/domain/commonName';
import { CompoundResearchPanel } from '../_components/CompoundResearchPanel';

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
function ProtocolNotes({ profile }: { profile: CompoundProfile }) {
  const bodyDurationText = profile.bodyDuration
    ? [
        profile.bodyDuration.frequencyImplication,
        profile.bodyDuration.certainty !== 'ESTABLISHED'
          ? `(Evidence: ${profile.bodyDuration.certainty.toLowerCase()})`
          : null,
      ]
        .filter(Boolean)
        .join(' ')
    : null;

  const notes = [
    profile.cycleRationale
      ? { label: 'Cycle Rationale', text: profile.cycleRationale }
      : null,
    profile.restPeriodRationale
      ? { label: 'Rest Rationale', text: profile.restPeriodRationale }
      : null,
    profile.timingNotes && profile.timingNotes.trim().length > 0
      ? { label: 'Timing Protocol', text: profile.timingNotes }
      : null,
    bodyDurationText
      ? { label: 'Body Duration & Frequency', text: bodyDurationText }
      : null,
  ].filter((note): note is { label: string; text: string } => Boolean(note));

  if (notes.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm" aria-labelledby="protocol-notes">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 id="protocol-notes" className="text-lg font-bold text-foreground text-pretty">
          Protocol Notes
        </h2>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {notes.map((note) => (
          <article key={note.label} className="rounded-lg border border-border bg-background p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{note.label}</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{note.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function NonFdaDisclaimer() {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 text-red-800 dark:border-red-950/30 dark:bg-red-950/10 dark:text-red-300">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="text-sm leading-relaxed" id="fda-disclaimer">
          <strong className="font-semibold">DISCLAIMER:</strong> This compound is not FDA-approved for the uses described here. The protocols and doses shown are reported from scientific literature and community sources for your information - not medical advice or a prescription. You are responsible for your own decisions. See{' '}
          <Link href="/about" className="underline hover:text-red-900 dark:hover:text-red-200">About</Link> for how this app frames regulatory status and what its labels mean.
        </div>
      </div>
    </div>
  );
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

  const serializedVials = compound.kind === 'PEPTIDE'
    ? await getSerializedVialsForCompound(session.user.id, compound.id)
    : [];

  // The catalog planner defaults to the user's saved syringe standard (U-100 by
  // default) so its unit math matches the standalone calculator and the rest of
  // the app. Users can still flip U-100/U-40 within the planner.
  const syringeStandard = compound.kind === 'PEPTIDE'
    ? await (async () => {
        const userSettings = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { syringeStandard: true },
        });
        return (userSettings?.syringeStandard as 'U100' | 'U40') ?? 'U100';
      })()
    : 'U100';

  const commonName = getCompoundCommonName(compound.name);
  const profile = compound.profile;
  const timeline = (profile?.benefitTimeline || compound.supplementProfile?.benefitTimeline) as BenefitTimelineItem[] | null;

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-6 animate-page-enter">
      <nav className="mb-4">
        <Link
          href="/reference"
          className="inline-flex min-h-9 items-center rounded-md px-1 text-sm text-primary hover:bg-primary/10"
        >
          ← Catalog
        </Link>
      </nav>

      <section className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 text-pretty dark:text-gray-100">
            {isArchived ? `${compound.name} (archived)` : compound.name}
          </h1>
          {commonName && !isArchived && (
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary ring-1 ring-inset ring-primary/20">
              {commonName}
            </span>
          )}
        </div>

        {compound.iupacName && (
          <p className="mt-3 break-all font-mono text-xs leading-relaxed text-gray-500 dark:text-gray-400">{compound.iupacName}</p>
        )}

        {compound.synonyms.length > 0 && (
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Also known as: {compound.synonyms.join(', ')}
          </p>
        )}

        {compound.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {compound.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/10"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </section>

      {profile && (
        <>
          <DosingGuidanceRanges
            ranges={{
              low: profile.dosingLow,
              typical: profile.dosingTypical,
              high: profile.dosingHigh,
            }}
          />
          <ProtocolSummaryGrid
            {...buildProtocolSnapshotLabels(profile)}
            routes={compound.administrationRoutes}
          />
          <ProtocolNotes profile={profile} />
          {!profile.isFdaApproved && <NonFdaDisclaimer />}
        </>
      )}

      {compound.kind === 'SUPPLEMENT' && compound.supplementProfile && (
        <>
          <DosingGuidanceRanges
            ranges={{
              low: compound.supplementProfile.dosingLow,
              typical: compound.supplementProfile.dosingTypical,
              high: compound.supplementProfile.dosingHigh,
            }}
          />
          <section className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
            <h2 className="text-lg font-bold text-foreground text-pretty">Supplement Profile</h2>
            <dl className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
              <div className="bg-background p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Form & Serving</dt>
                <dd className="mt-2 break-words text-sm font-bold text-foreground">
                  {compound.supplementProfile.servingSize?.toString() ?? ''} {compound.supplementProfile.servingUnit} ({compound.supplementProfile.form})
                </dd>
              </div>
              <div className="bg-background p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timing & Cadence</dt>
                <dd className="mt-2 break-words text-sm font-bold text-foreground">
                  {formatSupplementSchedule(compound.supplementProfile)}
                </dd>
              </div>
              <div className="bg-background p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preferred Time</dt>
                <dd className="mt-2 break-words text-sm font-bold text-foreground">
                  {formatPreferredTime(compound.supplementProfile.preferredTime)}
                </dd>
              </div>
            </dl>
            {compound.supplementProfile.timingNotes && (
              <div className="mt-4 rounded-lg border border-border bg-background p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timing Notes</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  {compound.supplementProfile.timingNotes}
                </p>
              </div>
            )}
          </section>
        </>
      )}

      {compound.kind === 'PEPTIDE' && (
        <div className="space-y-6">
          <CompoundInventoryManager
            compoundId={compound.id}
            compoundName={compound.name}
            vials={serializedVials}
            fridgeShelfLifeMonths={profile?.fridgeShelfLifeMonths}
            freezerShelfLifeMonths={profile?.freezerShelfLifeMonths}
            reconstitutedShelfLifeDays={profile?.reconstitutedShelfLifeDays}
          />
          {profile && (
            <CompoundStorageStabilityGuide
              compoundName={compound.name}
              fridgeShelfLifeMonths={profile.fridgeShelfLifeMonths}
              freezerShelfLifeMonths={profile.freezerShelfLifeMonths}
              reconstitutedShelfLifeDays={profile.reconstitutedShelfLifeDays}
            />
          )}
        </div>
      )}

      {!(compound.profile || compound.supplementProfile) && (
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

      {timeline && timeline.length > 0 && (
        <section className="mt-8 border border-border bg-card text-card-foreground rounded-xl p-5 shadow-sm animate-[fadeIn_0.3s_ease-out]">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-6">
            Clinical Progression Timeline
          </h2>
          <div className="relative pl-6 border-l-2 border-primary/20 space-y-6">
            {timeline.map((item) => (
              <div key={item.week} className="relative group">
                {/* Pulsing Timeline Node Indicator */}
                <div className="absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-card border-2 border-primary group-hover:scale-125 transition-transform duration-200 shadow-sm">
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

      {!profile && compound.administrationRoutes.length > 0 && (
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

      {profile && (
        <>
          <section className="mt-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
              Dosing Reference
            </h2>
            <DosingReconstitutionPlanner
              dosingLow={profile.dosingLow}
              dosingTypical={profile.dosingTypical}
              dosingHigh={profile.dosingHigh}
              isFdaApproved={profile.isFdaApproved}
              initialSyringeStandard={syringeStandard}
              fridgeShelfLifeMonths={profile.fridgeShelfLifeMonths}
              freezerShelfLifeMonths={profile.freezerShelfLifeMonths}
              reconstitutedShelfLifeDays={profile.reconstitutedShelfLifeDays}
              compoundName={compound.name}
            />
          </section>

          {profile.sideEffects && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                Side Effects
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300">{profile.sideEffects}</p>
            </section>
          )}

          <CompoundPairingsSection pairings={profile.pairings} />

          <CompoundAdjunctsSection adjuncts={profile.adjuncts} />

          {profile.stackingNotes && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                Stacking Notes
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300">{profile.stackingNotes}</p>
            </section>
          )}

        </>
      )}

      {compound.citations && compound.citations.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
            Citations
          </h2>
          <ul className="space-y-1">
            {compound.citations.map((cit) => (
              <CitationLink key={cit.id} citation={cit} />
            ))}
          </ul>
        </section>
      )}

      <CompoundResearchPanel catalogItemId={compound.id} compoundName={compound.name} />
    </main>
  );
}
