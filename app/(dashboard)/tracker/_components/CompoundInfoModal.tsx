'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X, Sparkles, ShieldAlert, Link2 } from 'lucide-react';
import type { CatalogItem, Citation, BenefitTimelineItem, CompoundProfile, SupplementProfile } from '@/lib/reference/domain/types';
import { CompoundResearchPanel } from '@/app/(dashboard)/reference/_components/CompoundResearchPanel';

interface CompoundInfoModalProps {
  compound: (Omit<Partial<CatalogItem>, 'lastReviewedAt' | 'archivedAt' | 'profile' | 'supplementProfile'> & {
    lastReviewedAt?: string | null;
    archivedAt?: string | null;
    profile?: Partial<CompoundProfile> | null;
    supplementProfile?: Partial<SupplementProfile> | null;
  }) | null;
  isOpen: boolean;
  onClose: () => void;
}

function CitationLink({ citation }: { citation: Citation }) {
  const href = citation.url
    ? citation.url
    : citation.pmid
    ? `https://pubmed.ncbi.nlm.nih.gov/${citation.pmid}/`
    : citation.doi
    ? `https://doi.org/${citation.doi}`
    : null;

  return (
    <li className="text-xs text-gray-600 dark:text-gray-300 flex items-start gap-1.5 leading-relaxed">
      <span className="text-primary mt-1">•</span>
      <div className="flex-1">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-primary transition-colors inline-flex items-center gap-0.5"
          >
            {citation.title}
            <Link2 className="h-3 w-3 inline shrink-0" />
          </a>
        ) : (
          citation.title
        )}
        {citation.doi && <span className="ml-1 text-gray-400 dark:text-gray-500 font-mono text-[10px]">DOI: {citation.doi}</span>}
        {citation.pmid && <span className="ml-1 text-gray-400 dark:text-gray-500 font-mono text-[10px]">PMID: {citation.pmid}</span>}
      </div>
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
            <div key={idx} className="space-y-1">
              <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-2">{heading}</h4>
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

export function CompoundInfoModal({ compound, isOpen, onClose }: CompoundInfoModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'dosing' | 'timeline' | 'synergies' | 'citations'>('overview');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    // Escape key listener
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !compound || !isMounted) return null;

  const profile = compound.profile;
  const supplementProfile = compound.supplementProfile;
  const timeline = (profile?.benefitTimeline || supplementProfile?.benefitTimeline) as BenefitTimelineItem[] | null;
  const pairings = profile?.pairings || [];
  const adjuncts = profile?.adjuncts || [];
  const citations = compound.citations || [];

  // Determine which tabs are relevant based on available data
  const hasTimeline = timeline && timeline.length > 0;
  const hasSynergies = pairings.length > 0 || adjuncts.length > 0 || profile?.stackingNotes || profile?.sideEffects;
  const hasCitations = citations.length > 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/40 dark:bg-slate-950/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative z-10 w-[92%] max-w-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {compound.name}
              </h3>
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">
                {compound.kind}
              </span>
            </div>
            {compound.iupacName && (
              <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono break-all max-w-md sm:max-w-xl">
                {compound.iupacName}
              </p>
            )}
            {compound.synonyms && compound.synonyms.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Synonyms: {compound.synonyms.join(', ')}
              </p>
            )}
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close details modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 px-4 overflow-x-auto no-scrollbar scroll-smooth bg-slate-50/50 dark:bg-slate-950/10">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'border-primary text-primary font-bold'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('dosing')}
            className={`px-3 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 ${
              activeTab === 'dosing'
                ? 'border-primary text-primary font-bold'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            Dosing & Schedule
          </button>
          {hasTimeline && (
            <button
              onClick={() => setActiveTab('timeline')}
              className={`px-3 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === 'timeline'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              Progression
            </button>
          )}
          {hasSynergies && (
            <button
              onClick={() => setActiveTab('synergies')}
              className={`px-3 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === 'synergies'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              Synergies & Side Effects
            </button>
          )}
          {hasCitations && (
            <button
              onClick={() => setActiveTab('citations')}
              className={`px-3 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === 'citations'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              References
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-5 animate-[fadeIn_0.2s_ease-out]">
              {/* Tags */}
              {compound.tags && compound.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {compound.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs bg-primary/5 dark:bg-primary/10 text-primary border border-primary/10 rounded-full px-2.5 py-0.5 font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Mechanism of Action */}
              {compound.mechanismOfAction ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Mechanism of Action
                  </h4>
                  <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl p-4 border border-slate-100 dark:border-slate-800/40">
                    <FormattedMechanismOfAction text={compound.mechanismOfAction} />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">No mechanism of action described for this compound.</p>
              )}

              {/* Administration Routes */}
              {compound.administrationRoutes && compound.administrationRoutes.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Administration Routes
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {compound.administrationRoutes.map((route) => (
                      <span
                        key={route}
                        className="text-xs bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-lg px-2.5 py-1 font-medium border border-slate-200/50 dark:border-slate-700/50"
                      >
                        {route}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DOSING & SCHEDULE TAB */}
          {activeTab === 'dosing' && (
            <div className="space-y-5 animate-[fadeIn_0.2s_ease-out]">
              {/* Peptide Dosing Schedule */}
              {compound.kind === 'PEPTIDE' && profile && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/35 rounded-xl p-4 space-y-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                        🗓️ Cycle Duration
                      </span>
                      <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {profile.cycleLengthWeeks ? `${profile.cycleLengthWeeks} Weeks` : 'Continuous'}
                      </div>
                      {profile.cycleRationale && (
                        <p className="text-xs text-gray-500 leading-normal">{profile.cycleRationale}</p>
                      )}
                    </div>

                    <div className="border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/35 rounded-xl p-4 space-y-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                        🔄 Weekly Schedule
                      </span>
                      <div className="text-sm font-bold text-gray-900 dark:text-gray-100 font-medium">
                        {profile.dosingFrequency === 'CUSTOM' ? (
                          profile.customFrequencyDescription || 'Custom Protocol'
                        ) : profile.dosingFrequency === 'DAILY' ? (
                          profile.daysOn && profile.daysOff ? (
                            `${profile.dosesPerDay && profile.dosesPerDay > 1 ? `${profile.dosesPerDay}x Daily: ` : ''}${profile.daysOn} Days On / ${profile.daysOff} Off`
                          ) : (
                            `${profile.dosesPerDay && profile.dosesPerDay > 1 ? `${profile.dosesPerDay}x ` : ''}Daily`
                          )
                        ) : (
                          `${formatFrequency(profile.dosingFrequency ?? null)}${
                            profile.dosesPerDay && profile.dosesPerDay > 1 
                              ? ` (${profile.dosesPerDay}x per admin day)` 
                              : ''
                          }`
                        )}
                      </div>
                    </div>

                    <div className="border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/35 rounded-xl p-4 space-y-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                        🛑 Rest Period
                      </span>
                      <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {profile.restPeriodWeeks ? `${profile.restPeriodWeeks} Weeks Washout` : 'N/A'}
                      </div>
                      {profile.restPeriodRationale && (
                        <p className="text-xs text-gray-500 leading-normal">{profile.restPeriodRationale}</p>
                      )}
                    </div>

                    <div className="border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/35 rounded-xl p-4 space-y-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                        ⏰ Administration
                      </span>
                      <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {formatPreferredTime(profile.preferredTime ?? null)}
                      </div>
                    </div>
                  </div>

                  {profile.timingNotes && (
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                        Timing Protocol
                      </h4>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 italic">
                        &quot;{profile.timingNotes}&quot;
                      </p>
                    </div>
                  )}

                  {/* Expected Dosing Tiers */}
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Expected Dosing Tiers
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {['Low', 'Typical', 'High'].map((tier) => {
                        const tierKey = `dosing${tier}` as 'dosingLow' | 'dosingTypical' | 'dosingHigh';
                        const dose = profile[tierKey] as { amount: string; unit: string; researchBenefits?: string | null } | null;
                        if (!dose) return null;
                        return (
                          <div key={tier} className="bg-slate-50/60 dark:bg-slate-950/20 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">{tier}</span>
                            <div className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                              {dose.amount} {dose.unit}
                            </div>
                            {dose.researchBenefits && (
                              <p className="text-[10px] text-gray-500 mt-1 leading-normal">{dose.researchBenefits}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Safety Disclaimer */}
                  {!profile.isFdaApproved && (
                    <div className="border border-red-200 dark:border-red-950/30 bg-red-50/40 dark:bg-red-950/10 p-3.5 rounded-xl text-red-800 dark:text-red-300 flex gap-2">
                      <ShieldAlert className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                      <div className="text-xs leading-relaxed">
                        <strong className="font-semibold">NOT FDA-APPROVED:</strong> This compound is not FDA-approved for the uses described here. Dosing references are reported from scientific literature and community sources for your information — not medical advice or a prescription. See{' '}
                        <Link href="/about" className="underline">About</Link>.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Supplement Dosing Schedule */}
              {compound.kind === 'SUPPLEMENT' && supplementProfile && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/35 rounded-xl p-4 space-y-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        💊 Form & Serving
                      </span>
                      <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {supplementProfile.servingSize} {supplementProfile.servingUnit} ({supplementProfile.form})
                      </div>
                    </div>

                    <div className="border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/35 rounded-xl p-4 space-y-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        🔄 Timing & Cadence
                      </span>
                      <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {formatFrequency(supplementProfile.dosingFrequency ?? null)}
                        {supplementProfile.dosesPerDay && supplementProfile.dosesPerDay > 1 ? ` (${supplementProfile.dosesPerDay}x daily)` : ''}
                      </div>
                      {supplementProfile.preferredTime && (
                        <p className="text-xs text-gray-500">
                          Preferred Time: {formatPreferredTime(supplementProfile.preferredTime ?? null)}
                        </p>
                      )}
                    </div>
                  </div>

                  {supplementProfile.timingNotes && (
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Timing Notes</h4>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 italic">
                        &quot;{supplementProfile.timingNotes}&quot;
                      </p>
                    </div>
                  )}

                  {/* Expected Dosing Tiers */}
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Expected Dosing Tiers
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {['Low', 'Typical', 'High'].map((tier) => {
                        const tierKey = `dosing${tier}` as 'dosingLow' | 'dosingTypical' | 'dosingHigh';
                        const dose = supplementProfile[tierKey] as { amount: string; unit: string; researchBenefits?: string | null } | null;
                        if (!dose) return null;
                        return (
                          <div key={tier} className="bg-slate-50/60 dark:bg-slate-950/20 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">{tier}</span>
                            <div className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                              {dose.amount} {dose.unit}
                            </div>
                            {dose.researchBenefits && (
                              <p className="text-[10px] text-gray-500 mt-1 leading-normal">{dose.researchBenefits}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TIMELINE TAB */}
          {activeTab === 'timeline' && hasTimeline && (
            <div className="space-y-5 animate-[fadeIn_0.2s_ease-out]">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                ⏱️ Clinical Progression Timeline
              </h4>
              <div className="relative pl-6 border-l-2 border-primary/20 space-y-6 py-2">
                {timeline.map((item) => (
                  <div key={item.week} className="relative group">
                    {/* Node */}
                    <div className="absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white dark:bg-slate-900 border-2 border-primary shadow-sm">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                        Week {item.week}
                        <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold tracking-wide">
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
                      </h5>
                      <ul className="mt-2 space-y-1">
                        {item.benefits.map((benefit, bIdx) => (
                          <li key={bIdx} className="text-xs text-gray-600 dark:text-gray-300 flex items-start gap-1.5 leading-relaxed">
                            <span className="text-primary mt-1.5 shrink-0 h-1 w-1 rounded-full bg-primary" />
                            <span>{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SYNERGIES & SIDE EFFECTS TAB */}
          {activeTab === 'synergies' && hasSynergies && (
            <div className="space-y-6 animate-[fadeIn_0.2s_ease-out]">
              {/* Side Effects */}
              {profile?.sideEffects && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Side Effects
                  </h4>
                  <div className="bg-red-50/20 dark:bg-red-950/5 border border-red-100/50 dark:border-red-950/20 rounded-xl p-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                      {profile.sideEffects}
                    </p>
                  </div>
                </div>
              )}

              {/* Stacking Notes */}
              {profile?.stackingNotes && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Stacking Notes
                  </h4>
                  <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800 rounded-xl p-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                      {profile.stackingNotes}
                    </p>
                  </div>
                </div>
              )}

              {/* Pairings */}
              {pairings.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Synergistic Pairings
                  </h4>
                  <div className="grid grid-cols-1 gap-3">
                    {pairings.map((p) => (
                      <div key={p.id} className="border border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/20 rounded-xl p-4 space-y-2 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                            with {p.pairedCompoundName}
                          </h5>
                          {p.bestOverall && (
                            <span className="text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-0.5">
                              <Sparkles className="h-2.5 w-2.5 text-amber-500" /> Best Synergy
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                          <strong className="font-semibold text-gray-800 dark:text-gray-200">Goal:</strong> {p.benefitGoal}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                          {p.rationale}
                        </p>
                        {p.expectedSynergy && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 bg-white/50 dark:bg-slate-950/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800/60">
                            <strong>Synergy:</strong> {p.expectedSynergy}
                          </div>
                        )}
                        {p.safetyCaveats && (
                          <p className="text-xs text-red-600 dark:text-red-400">
                            <strong>Safety:</strong> {p.safetyCaveats}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Adjuncts */}
              {adjuncts.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Recommended Adjuncts & Protocols
                  </h4>
                  <div className="grid grid-cols-1 gap-3">
                    {adjuncts.map((a) => (
                      <div key={a.id} className="border border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/20 rounded-xl p-4 space-y-2 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                            {a.adjunctName}
                          </h5>
                          <span className="text-[9px] bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                            {a.adjunctCategory}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                          <strong className="font-semibold text-gray-800 dark:text-gray-200">Goal:</strong> {a.benefitGoal}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                          {a.rationale}
                        </p>
                        {a.implementationNotes && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 bg-white/50 dark:bg-slate-950/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800/60">
                            <strong>Implementation:</strong> {a.implementationNotes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CITATIONS TAB */}
          {activeTab === 'citations' && hasCitations && (
            <div className="space-y-3 animate-[fadeIn_0.2s_ease-out]">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Scientific References & Citations
              </h4>
              <ul className="space-y-3 bg-slate-50/50 dark:bg-slate-900/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800/40">
                {citations.map((citation) => (
                  <CitationLink key={citation.id} citation={citation} />
                ))}
              </ul>
            </div>
          )}

          {/* Research Panel */}
          {compound.id && (
            <CompoundResearchPanel catalogItemId={compound.id} compoundName={compound.name ?? 'this compound'} />
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50/50 dark:bg-slate-900/30">
          <button
            onClick={onClose}
            className="min-h-9 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-4 py-2 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors shadow"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
