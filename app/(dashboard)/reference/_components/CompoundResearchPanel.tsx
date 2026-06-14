'use client';

import React, { useEffect, useState } from 'react';
import { Link2, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { useCompoundResearch } from './useCompoundResearch';
import { listCompoundResearchAction } from '@/app/actions/reference/list-compound-research';
import { saveCompoundResearchNotesAction } from '@/app/actions/reference/save-compound-research-notes';
import { deleteCompoundResearchNoteAction } from '@/app/actions/reference/delete-compound-research-note';
import type { SavedResearchNote } from '@/lib/research/domain/types';
import { shouldShowDoseWarning } from '@/lib/research/domain/guards';

const DISCLAIMER = 'Unverified — not medical advice.';
const DOSE_WARNING = 'Dose figures are reported from studies and protocols for informational purposes only — not dosing advice.';

const TIER_LABEL: Record<string, string> = {
  clinical: 'clinical',
  non_clinical: 'community / non-clinical',
  unclear: 'unclear',
};

const SECTION_LABEL: Record<string, string> = {
  direct_answer: 'Direct answer',
  evidence: 'Evidence',
  dosing: 'Reported dosing & protocols',
  caveats: 'Caveats & gaps',
};

function dedupeCitations(urls: string[]): { title: string; url: string }[] {
  const seen = new Set<string>();
  const out: { title: string; url: string }[] = [];
  for (const url of urls) { if (seen.has(url)) continue; seen.add(url); out.push({ title: url, url }); }
  return out;
}

function strongestTier(tiers: string[]): 'clinical' | 'non_clinical' | 'unclear' {
  if (tiers.includes('clinical')) return 'clinical';
  if (tiers.includes('non_clinical')) return 'non_clinical';
  return 'unclear';
}

export function CompoundResearchPanel({ catalogItemId, compoundName }: { catalogItemId: string; compoundName: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [notes, setNotes] = useState<SavedResearchNote[]>([]);
  const [question, setQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [saving, setSaving] = useState(false);
  const [approved, setApproved] = useState<Record<string, boolean>>({
    direct_answer: true,
    evidence: true,
    dosing: true,
    caveats: true,
  });
  const { state, errorCode, result, run } = useCompoundResearch(catalogItemId);

  useEffect(() => {
    let active = true;
    listCompoundResearchAction(catalogItemId).then((res) => {
      if (!active || !res.ok) return;
      setEnabled(res.enabled);
      setNotes(res.notes);
    });
    return () => { active = false; };
  }, [catalogItemId]);

  const busy = ['planning', 'searching', 'sources_found', 'synthesizing', 'gap_filling'].includes(state.phase);

  function collectSections() {
    if (!result) return [];
    const sections: { type: 'direct_answer' | 'evidence' | 'dosing' | 'caveats'; content: string; tier: 'clinical' | 'non_clinical' | 'unclear' | null; citations: { title: string; url: string }[] }[] = [];
    // Keep this literal in sync with NO_PROSE_SUMMARY in lib/research/application/compoundResearch.ts —
    // the placeholder lead is never worth saving as a note section.
    if (approved.direct_answer && result.directAnswer && result.directAnswer !== 'A plain-language summary is not shown here - see the evidence, dosing, and caveats below for what the sources report.')
      sections.push({ type: 'direct_answer', content: result.directAnswer, tier: null, citations: [] });
    if (approved.evidence && result.evidence.length)
      sections.push({ type: 'evidence', content: result.evidence.map((e) => `• ${e.point}`).join('\n'), tier: null, citations: dedupeCitations(result.evidence.flatMap((e) => e.sourceUrls)) });
    if (approved.dosing && result.dosing.length)
      // one dosing section; tier = the strongest tier present (clinical > non_clinical > unclear)
      sections.push({ type: 'dosing', content: result.dosing.map((d) => `• [${TIER_LABEL[d.tier]}] ${d.text}`).join('\n'), tier: strongestTier(result.dosing.map((d) => d.tier)), citations: dedupeCitations(result.dosing.flatMap((d) => d.sourceUrls)) });
    if (approved.caveats && result.caveatsGaps.length)
      sections.push({ type: 'caveats', content: result.caveatsGaps.map((c) => `• ${c}`).join('\n'), tier: null, citations: [] });
    return sections;
  }

  async function onSave() {
    const sections = collectSections();
    if (sections.length === 0) return;
    setSaving(true);
    const res = await saveCompoundResearchNotesAction({ catalogItemId, question: submittedQuestion, sections });
    setSaving(false);
    if (res.ok) {
      const refreshed = await listCompoundResearchAction(catalogItemId);
      if (refreshed.ok) setNotes(refreshed.notes);
    }
  }

  async function onDelete(noteId: string) {
    const res = await deleteCompoundResearchNoteAction({ noteId });
    if (res.ok) setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }

  return (
    <section className="mt-6 border border-border bg-card text-card-foreground rounded-xl p-5 shadow-sm">
      <h2 className="text-lg font-bold flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" /> Ask about {compoundName}
      </h2>

      {enabled === null && <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>}
      {enabled === false && (
        <p className="text-sm text-muted-foreground">Research assistant is unavailable right now. Your saved notes are still shown below.</p>
      )}

      {enabled && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={500}
              placeholder="e.g. What does research say about dosing and frequency?"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
              disabled={busy}
            />
            <button
              onClick={() => { setSubmittedQuestion(question); setApproved({ direct_answer: true, evidence: true, dosing: true, caveats: true }); run(question); }}
              disabled={busy || question.trim().length === 0}
              aria-label={busy ? 'Running research…' : 'Ask'}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : 'Ask'}
            </button>
          </div>

          {busy && <ResearchTimeline state={state} />}

          {state.phase === 'error' && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {errorCode === 'rate_limited' ? 'Too many requests — try again later.' :
               errorCode === 'feature_disabled' ? 'Research assistant is unavailable right now.' :
               'Something went wrong running the research.'}
            </p>
          )}

          {result && state.phase === 'done' && (
            <div className="space-y-4 border-t border-border pt-3">
              <AnswerSection
                title="Direct answer"
                sectionKey="direct_answer"
                approved={approved.direct_answer}
                onToggle={(v) => setApproved((prev) => ({ ...prev, direct_answer: v }))}
              >
                <p className="text-sm text-gray-700 dark:text-gray-200">{result.directAnswer}</p>
              </AnswerSection>
              {result && shouldShowDoseWarning(result.directAnswer, result.dosing.length) && (
                <p className="text-xs rounded px-2 py-1 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  ⚠ {DOSE_WARNING}
                </p>
              )}
              <p className="text-[11px] uppercase tracking-wide text-amber-600 dark:text-amber-400">{DISCLAIMER}</p>

              {result.evidence.length > 0 && (
                <AnswerSection
                  title="Evidence"
                  sectionKey="evidence"
                  approved={approved.evidence}
                  onToggle={(v) => setApproved((prev) => ({ ...prev, evidence: v }))}
                >
                  <ul className="space-y-2">
                    {result.evidence.map((e, i) => (
                      <li key={i} className="text-sm">
                        {e.point}
                        <SourceLinks urls={e.sourceUrls} />
                      </li>
                    ))}
                  </ul>
                </AnswerSection>
              )}

              {result.dosing.length > 0 && (
                <AnswerSection
                  title="Reported dosing & protocols"
                  sectionKey="dosing"
                  approved={approved.dosing}
                  onToggle={(v) => setApproved((prev) => ({ ...prev, dosing: v }))}
                >
                  <ul className="space-y-2">
                    {result.dosing.map((d, i) => (
                      <li key={i} className="text-sm">
                        <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{TIER_LABEL[d.tier]}</span>
                        {d.text}
                        <SourceLinks urls={d.sourceUrls} />
                      </li>
                    ))}
                  </ul>
                </AnswerSection>
              )}

              {result.caveatsGaps.length > 0 && (
                <AnswerSection
                  title="Caveats & gaps"
                  sectionKey="caveats"
                  approved={approved.caveats}
                  onToggle={(v) => setApproved((prev) => ({ ...prev, caveats: v }))}
                >
                  <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-200">
                    {result.caveatsGaps.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </AnswerSection>
              )}

              <button onClick={onSave} disabled={saving || collectSections().length === 0} className="rounded-md border border-primary px-3 py-1.5 text-sm text-primary disabled:opacity-50">
                {saving ? 'Saving…' : 'Save this answer'}
              </button>
            </div>
          )}
        </div>
      )}

      {notes.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Your saved research</h3>
          <p className="text-[11px] uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-2">{DISCLAIMER}</p>
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-md border border-border/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">Q: {n.question}</p>
                  <button onClick={() => onDelete(n.id)} aria-label="Delete note" className="text-gray-400 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {n.sections.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {n.sections.map((s) => (
                      <div key={s.id}>
                        <h5 className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{SECTION_LABEL[s.type]}{s.tier ? ` · ${TIER_LABEL[s.tier]}` : ''}</h5>
                        <p className="whitespace-pre-line text-sm text-gray-700 dark:text-gray-200">{s.content}</p>
                        <ul className="mt-1 flex flex-wrap gap-2">
                          {s.citations.map((c) => (
                            <li key={c.id}><a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs text-primary underline">source <Link2 className="h-3 w-3" /></a></li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2">
                    <p className="text-sm text-gray-700 dark:text-gray-200">{n.claim ?? n.answerSummary ?? ''}</p>
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {n.citations.map((c) => (<li key={c.id}><a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs text-primary underline">{c.title} <Link2 className="h-3 w-3" /></a></li>))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function AnswerSection({
  title,
  sectionKey,
  approved,
  onToggle,
  children,
}: {
  title: string;
  sectionKey: string;
  approved: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{title}</h4>
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={approved}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-3 w-3"
            aria-label={`Include ${sectionKey} when saving`}
          />
          save
        </label>
      </div>
      {children}
    </div>
  );
}

function SourceLinks({ urls }: { urls: string[] }) {
  return (
    <span className="mt-1 flex flex-wrap gap-2">
      {urls.map((u) => (
        <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs text-primary underline">
          source <Link2 className="h-3 w-3" />
        </a>
      ))}
    </span>
  );
}

function ResearchTimeline({ state }: { state: ReturnType<typeof useCompoundResearch>['state'] }) {
  const order = ['planning', 'searching', 'sources_found', 'synthesizing', 'gap_filling'];
  const idx = order.indexOf(state.phase);
  const Row = ({ at, label }: { at: number; label: string }) => (
    <li className={`flex items-center gap-2 ${idx >= at ? 'text-gray-700 dark:text-gray-200' : 'text-muted-foreground/50'}`}>
      <span>{idx > at ? '✓' : idx === at ? '◐' : '○'}</span>
      <span>{label}</span>
    </li>
  );
  return (
    <ul className="space-y-0.5 text-xs">
      <Row at={0} label="Planning searches" />
      <Row at={1} label={state.queries.length ? `Searching: ${state.queries.join(' · ')}` : 'Searching'} />
      <Row at={2} label={state.sourceCount != null ? `Found ${state.sourceCount} sources` : 'Collecting sources'} />
      <Row at={3} label="Reading & writing answer" />
      {state.gapQuery && <Row at={4} label={`Filling a gap: ${state.gapQuery}`} />}
    </ul>
  );
}
