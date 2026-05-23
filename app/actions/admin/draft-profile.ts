'use server';

import { auth } from '@/lib/auth';
import { draftCompoundProfile } from '@/lib/ai/application/draftCompoundProfile';

export interface DraftProfileResult {
  draft?: string;
  error?: string;
}

// Input caps: prevent a Power User (or a compromised admin session) from
// driving large prompt payloads that would burn tokens, time out, or
// exceed provider context windows.
const MAX_COMPOUND_NAME_LEN = 128;
const MAX_CITATION_COUNT = 30;
const MAX_CITATION_LEN = 2000;

/**
 * Admin-only action that generates an AI draft compound profile. The
 * draft is returned to the caller for human review — never auto-persisted.
 *
 * Per ADR-010, AI failures must NOT block any user-facing flow; this
 * action catches every error and surfaces a structured `error` field so
 * the admin can immediately fall back to manual entry.
 */
export async function draftProfileAction(input: {
  compoundName: string;
  citations: string[];
}): Promise<DraftProfileResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'unauthorized' };
  // Positive role gate (defense-in-depth): the UserRole enum is currently
  // POWER_USER | MANAGED_USER, but a future addition would otherwise grant
  // the new role unintended access if we only blocked MANAGED_USER.
  if (session.user.role !== 'POWER_USER') return { error: 'forbidden' };

  // Input validation + size caps. Trim aggressively; reject empty + oversized.
  const compoundName =
    typeof input.compoundName === 'string' ? input.compoundName.trim() : '';
  if (compoundName.length === 0) return { error: 'empty_compound_name' };
  if (compoundName.length > MAX_COMPOUND_NAME_LEN) return { error: 'compound_name_too_long' };

  const citationsRaw = Array.isArray(input.citations) ? input.citations : [];
  if (citationsRaw.length > MAX_CITATION_COUNT) return { error: 'too_many_citations' };
  const citations: string[] = [];
  for (const c of citationsRaw) {
    if (typeof c !== 'string') return { error: 'invalid_citation' };
    const trimmed = c.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.length > MAX_CITATION_LEN) return { error: 'citation_too_long' };
    citations.push(trimmed);
  }

  try {
    const result = await draftCompoundProfile({
      compoundName,
      citations,
      actorUserId: session.user.id,
    });
    return { draft: result.draft };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown_error';
    if (msg === 'ai_unavailable') return { error: 'ai_unavailable' };
    if (msg === 'disallowed_output') return { error: 'disallowed_output' };
    if (msg === 'empty_compound_name') return { error: 'empty_compound_name' };
    return { error: 'draft_failed' };
  }
}
