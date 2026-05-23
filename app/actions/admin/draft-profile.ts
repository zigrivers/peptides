'use server';

import { auth } from '@/lib/auth';
import { draftCompoundProfile } from '@/lib/ai/application/draftCompoundProfile';

export interface DraftProfileResult {
  draft?: string;
  error?: string;
}

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

  try {
    const result = await draftCompoundProfile({
      compoundName: input.compoundName,
      citations: input.citations,
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
