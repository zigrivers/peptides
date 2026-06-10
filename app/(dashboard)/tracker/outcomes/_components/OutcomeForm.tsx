'use client';

import React, { useActionState, useState } from 'react';
import type { LogOutcomeActionState } from '@/app/actions/tracker/log-outcome';

interface ExistingOutcome {
  overallRating: number;
  tags: string[];
  note: string | null;
  protocolRatings: { protocolId: string; rating: number }[];
}

interface Props {
  action: (
    prev: LogOutcomeActionState | null,
    formData: FormData
  ) => Promise<LogOutcomeActionState>;
  scheduledDateISO: string;
  suggestedTags: readonly string[];
  activeProtocols: readonly { id: string; name: string }[];
  existingOutcome: ExistingOutcome | null;
}

export function OutcomeForm({
  action,
  scheduledDateISO,
  suggestedTags,
  activeProtocols,
  existingOutcome,
}: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [rating, setRating] = useState<number>(existingOutcome?.overallRating ?? 3);
  const [tags, setTags] = useState<string[]>(existingOutcome?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [note, setNote] = useState<string>(existingOutcome?.note ?? '');
  // Initialize protocolRatings ONLY for protocols that are still active.
  // Otherwise a stale rating (for a protocol the user has since paused) would
  // be sent to the server, which rejects non-ACTIVE protocols and would
  // block any further outcome edits today. Filtering here matches what the
  // UI surfaces: you can only modify ratings for protocols that are visible.
  const activeIds = new Set(activeProtocols.map((p) => p.id));
  const initialRatingMap: Record<string, number> = Object.fromEntries(
    (existingOutcome?.protocolRatings ?? [])
      .filter((r) => activeIds.has(r.protocolId))
      .map((r) => [r.protocolId, r.rating])
  );
  const [protocolRatings, setProtocolRatings] = useState<Record<string, number>>(initialRatingMap);

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  // The server action transports tags as a comma-separated string, so we must
  // split any pasted/typed commas at the client boundary to keep wire format
  // and chip count in sync.
  function addTag() {
    const candidates = tagInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (candidates.length === 0) {
      setTagInput('');
      return;
    }
    setTags((prev) => {
      const out = [...prev];
      for (const c of candidates) {
        if (!out.includes(c)) out.push(c);
      }
      return out;
    });
    setTagInput('');
  }
  function setRatingFor(protocolId: string, value: number) {
    setProtocolRatings((prev) => ({ ...prev, [protocolId]: value }));
  }

  // Flush any pending tag text into chips before submit so the typed-but-
  // not-pressed-Enter case doesn't silently drop the user's tag.
  function flushPendingTag(): string[] {
    const candidates = tagInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (candidates.length === 0) return tags;
    const out = [...tags];
    for (const c of candidates) {
      if (!out.includes(c)) out.push(c);
    }
    return out;
  }

  const submittedTags = flushPendingTag();
  const ratingsPayload = Object.entries(protocolRatings)
    .filter(([protocolId, v]) => v >= 1 && v <= 5 && activeIds.has(protocolId))
    .map(([protocolId, rating]) => ({ protocolId, rating }));

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="scheduledDate" value={scheduledDateISO} />
      <input type="hidden" name="tags" value={submittedTags.join(',')} />
      <input type="hidden" name="protocolRatings" value={JSON.stringify(ratingsPayload)} />
      <input type="hidden" name="overallRating" value={String(rating)} />

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-2">
          Overall wellbeing
        </legend>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              aria-pressed={rating === value}
              className={`min-h-10 min-w-10 flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                rating === value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-500">1 = poor, 5 = great</p>
      </fieldset>

      <div>
        <label htmlFor="tagInput" className="block text-sm font-medium text-gray-700 mb-1">
          Tags
        </label>
        {suggestedTags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {suggestedTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                aria-pressed={tags.includes(tag)}
                className={`min-h-9 rounded-full border px-3 py-2 text-xs transition-colors ${
                  tags.includes(tag)
                    ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {tag}
              </button>
            ))}
            <span className="text-xs text-gray-400 self-center">your recent tags</span>
          </div>
        )}
        <div className="flex gap-2">
          <input
            id="tagInput"
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="e.g. energy, focus, sleep"
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={addTag}
            className="min-h-10 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Add
          </button>
        </div>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-900"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => toggleTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                  className="-mr-2 inline-flex min-h-8 min-w-8 items-center justify-center rounded-full text-indigo-700 hover:bg-indigo-100 hover:text-indigo-900"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-1">
          Note <span className="text-xs text-gray-400">(optional, up to 1000 chars)</span>
        </label>
        <textarea
          id="note"
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 1000))}
          maxLength={1000}
          rows={3}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-gray-500">{note.length} / 1000</p>
      </div>

      {activeProtocols.length > 0 && (
        <fieldset>
          <legend className="block text-sm font-medium text-gray-700 mb-2">
            Per-protocol ratings
          </legend>
          <ul className="space-y-2">
            {activeProtocols.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-700">{p.name}</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRatingFor(p.id, value)}
                      aria-pressed={protocolRatings[p.id] === value}
                      className={`min-h-10 min-w-10 rounded text-xs ${
                        protocolRatings[p.id] === value
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="min-h-10 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? 'Saving…' : existingOutcome ? 'Update outcome' : 'Save outcome'}
      </button>
    </form>
  );
}
