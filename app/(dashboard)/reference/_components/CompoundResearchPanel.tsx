'use client';

import React, { useEffect, useState } from 'react';
import { Link2, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { useCompoundResearch } from './useCompoundResearch';
import { listCompoundResearchAction } from '@/app/actions/reference/list-compound-research';
import { saveCompoundResearchNotesAction } from '@/app/actions/reference/save-compound-research-notes';
import { deleteCompoundResearchNoteAction } from '@/app/actions/reference/delete-compound-research-note';
import type { SavedResearchNote } from '@/lib/research/domain/types';

const DISCLAIMER = 'Unverified — not medical advice.';

const TIER_LABEL: Record<string, string> = {
  clinical: 'clinical',
  non_clinical: 'community / non-clinical',
  unclear: 'unclear',
};

export function CompoundResearchPanel({ catalogItemId, compoundName }: { catalogItemId: string; compoundName: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [notes, setNotes] = useState<SavedResearchNote[]>([]);
  const [question, setQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [saving, setSaving] = useState(false);
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

  // TEMPORARY save (Task 5 replaces with per-section save): flatten kept items to legacy findings.
  async function onSave() {
    if (!result) return;
    const findings = [
      ...result.evidence.map((e) => ({ claim: e.point, citations: e.sourceUrls.map((url) => ({ title: url, url })) })),
      ...result.dosing.map((d) => ({ claim: `[${TIER_LABEL[d.tier]}] ${d.text}`, citations: d.sourceUrls.map((url) => ({ title: url, url })) })),
    ].filter((f) => f.citations.length > 0);
    if (findings.length === 0) return;
    setSaving(true);
    const res = await saveCompoundResearchNotesAction({
      catalogItemId,
      question: submittedQuestion,
      answerSummary: result.directAnswer,
      approvedFindings: findings,
    });
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
              onClick={() => { setSubmittedQuestion(question); run(question); }}
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
              <AnswerSection title="Direct answer">
                <p className="text-sm text-gray-700 dark:text-gray-200">{result.directAnswer}</p>
              </AnswerSection>
              <p className="text-[11px] uppercase tracking-wide text-amber-600 dark:text-amber-400">{DISCLAIMER}</p>

              {result.evidence.length > 0 && (
                <AnswerSection title="Evidence">
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
                <AnswerSection title="Reported dosing &amp; protocols">
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
                <AnswerSection title="Caveats &amp; gaps">
                  <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-200">
                    {result.caveatsGaps.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </AnswerSection>
              )}

              <button onClick={onSave} disabled={saving} className="rounded-md border border-primary px-3 py-1.5 text-sm text-primary disabled:opacity-50">
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
                  <p className="text-sm text-gray-700 dark:text-gray-200">{n.claim ?? n.answerSummary ?? ''}</p>
                  <button onClick={() => onDelete(n.id)} aria-label="Delete note" className="text-gray-400 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">Q: {n.question}</p>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {n.citations.map((c) => (
                    <li key={c.id}>
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs text-primary underline">
                        {c.title} <Link2 className="h-3 w-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function AnswerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{title}</h4>
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
  const Row = ({ at, label, done }: { at: number; label: string; done?: boolean }) => (
    <li className={`flex items-center gap-2 ${idx >= at ? 'text-gray-700 dark:text-gray-200' : 'text-muted-foreground/50'}`}>
      <span>{idx > at || done ? '✓' : idx === at ? '◐' : '○'}</span>
      <span>{label}</span>
    </li>
  );
  return (
    <ul className="space-y-0.5 text-xs">
      <Row at={0} label="Planning searches" />
      <Row at={1} label={state.queries.length ? `Searching: ${state.queries.join(' · ')}` : 'Searching'} />
      <Row at={2} label={state.sourceCount != null ? `Found ${state.sourceCount} sources` : 'Collecting sources'} />
      <Row at={3} label="Reading &amp; writing answer" />
      {state.gapQuery && <Row at={4} label={`Filling a gap: ${state.gapQuery}`} />}
    </ul>
  );
}
