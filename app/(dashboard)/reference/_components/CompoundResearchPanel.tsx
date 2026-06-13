'use client';

import { useEffect, useState } from 'react';
import { Link2, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { useCompoundResearch } from './useCompoundResearch';
import { listCompoundResearchAction } from '@/app/actions/reference/list-compound-research';
import { saveCompoundResearchNotesAction } from '@/app/actions/reference/save-compound-research-notes';
import { deleteCompoundResearchNoteAction } from '@/app/actions/reference/delete-compound-research-note';
import type { SavedResearchNote } from '@/lib/research/domain/types';
import { normalizeUrl } from '@/lib/research/domain/urlNormalize';

const DISCLAIMER = 'Unverified — not medical advice.';

export function CompoundResearchPanel({ catalogItemId, compoundName }: { catalogItemId: string; compoundName: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [notes, setNotes] = useState<SavedResearchNote[]>([]);
  const [question, setQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const { phase, errorCode, result, run } = useCompoundResearch(catalogItemId);

  useEffect(() => {
    let active = true;
    listCompoundResearchAction(catalogItemId).then((res) => {
      if (!active || !res.ok) return;
      setEnabled(res.enabled);
      setNotes(res.notes);
    });
    return () => { active = false; };
  }, [catalogItemId]);

  const busy = phase === 'planning' || phase === 'searching' || phase === 'synthesizing';

  async function onSave() {
    if (!result) return;
    const approvedFindings = result.findings
      .filter((f) => approved[f.id])
      .map((f) => ({
        claim: f.claim,
        citations: f.sourceUrls.map((url) => ({
          title: result.sourcesUsed.find((s) => normalizeUrl(s.url) === normalizeUrl(url))?.title ?? url,
          url,
        })),
      }));
    if (approvedFindings.length === 0) return;
    setSaving(true);
    const res = await saveCompoundResearchNotesAction({
      catalogItemId,
      question: submittedQuestion,
      answerSummary: result.summary,
      approvedFindings,
    });
    setSaving(false);
    if (res.ok) {
      const refreshed = await listCompoundResearchAction(catalogItemId);
      if (refreshed.ok) setNotes(refreshed.notes);
      setApproved({});
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
        <p className="text-sm text-muted-foreground">
          Research assistant is unavailable right now. Your saved notes are still shown below.
        </p>
      )}

      {enabled && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={500}
              placeholder="e.g. What does research say about tendon healing?"
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

          {busy && <p className="text-xs text-muted-foreground capitalize">{phase}…</p>}
          {phase === 'error' && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {errorCode === 'rate_limited' ? 'Too many requests — try again later.' :
               errorCode === 'feature_disabled' ? 'Research assistant is unavailable right now.' :
               'Something went wrong running the research.'}
            </p>
          )}

          {result && phase === 'done' && (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-sm text-gray-700 dark:text-gray-200">{result.summary}</p>
              <p className="text-[11px] uppercase tracking-wide text-amber-600 dark:text-amber-400">{DISCLAIMER}</p>
              <ul className="space-y-2">
                {result.findings.map((f) => (
                  <li key={f.id} className="rounded-md border border-border/60 p-2">
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!approved[f.id]}
                        onChange={(e) => setApproved((p) => ({ ...p, [f.id]: e.target.checked }))}
                        className="mt-1"
                      />
                      <span className="flex-1">
                        {f.claim}
                        <span className="mt-1 flex flex-wrap gap-2">
                          {f.sourceUrls.map((u) => (
                            <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs text-primary underline">
                              source <Link2 className="h-3 w-3" />
                            </a>
                          ))}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {result.findings.length === 0 && (
                <p className="text-sm text-muted-foreground">No grounded findings for that question.</p>
              )}
              {result.findings.length > 0 && (
                <button onClick={onSave} disabled={saving} className="rounded-md border border-primary px-3 py-1.5 text-sm text-primary disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save selected findings'}
                </button>
              )}
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
                  <p className="text-sm text-gray-700 dark:text-gray-200">{n.claim}</p>
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
