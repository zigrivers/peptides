'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { isLocalResearchEnabled } from '@/lib/ai/infrastructure/localModelClient';
import { runFdaBriefing } from '@/lib/research/application/fdaBriefing';
import { FdaBriefingRepo } from '@/lib/research/infrastructure/FdaBriefingRepo';
import { withAudit } from '@/lib/audit/application/withAudit';
import type { CreateAuditEventInput } from '@/lib/audit/domain/AuditEvent';
import type { FdaBriefingResult } from '@/lib/research/domain/types';

type Result = { ok: true; briefing: FdaBriefingResult; updatedAt: string } | { ok: false; error: string };

export async function refreshFdaBriefingAction(): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };
  const userId = session.user.id as string;
  if (session.user.role !== 'POWER_USER') return { ok: false, error: 'forbidden' };
  if (!(await isLocalResearchEnabled())) return { ok: false, error: 'unavailable' };

  try {
    const briefing = await runFdaBriefing(userId);
    const row = await withAudit(
      (tx) =>
        FdaBriefingRepo.upsertGlobal(tx, {
          summary: briefing.summary,
          findings: briefing.findings,
          sourcesUsed: briefing.sourcesUsed,
          updatedByUserId: userId,
        }),
      {
        actorUserId: userId,
        subjectUserId: userId,
        category: 'Research',
        action: 'FDA_BRIEFING_REFRESHED',
        resourceId: 'global',
        resourceType: 'FdaBriefing',
        metadata: { findingCount: briefing.findings.length },
      } satisfies CreateAuditEventInput
    );
    try { revalidatePath('/about'); } catch { /* best-effort cache revalidation */ }
    return { ok: true, briefing, updatedAt: row.updatedAt.toISOString() };
  } catch {
    return { ok: false, error: 'failed' };
  }
}
