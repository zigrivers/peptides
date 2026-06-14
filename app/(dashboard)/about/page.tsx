import { auth } from '@/lib/auth';
import { isLocalResearchEnabled } from '@/lib/ai/infrastructure/localModelClient';
import { FdaBriefingRepo } from '@/lib/research/infrastructure/FdaBriefingRepo';
import { FdaBriefingSection } from './_components/FdaBriefingSection';
import type { FdaBriefingResult } from '@/lib/research/domain/types';
import { fdaBriefingSchema } from '@/lib/research/domain/schemas';
import { ABOUT_SECTIONS } from './_content';

export default async function AboutPage() {
  const [session, row] = await Promise.all([auth(), FdaBriefingRepo.getGlobal().catch(() => null)]);
  const canRefresh = session?.user?.role === 'POWER_USER' && (await isLocalResearchEnabled());
  let initial: (FdaBriefingResult & { updatedAt: string }) | null = null;
  if (row) {
    const parsed = fdaBriefingSchema.safeParse({ summary: row.summary, findings: row.findings, sourcesUsed: row.sourcesUsed });
    if (parsed.success) initial = { ...parsed.data, updatedAt: row.updatedAt.toISOString() };
    else console.error('[about] stored FdaBriefing row failed schema validation', parsed.error);
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-bold">About</h1>
        <p className="text-sm text-muted-foreground">How this app works, and where peptides stand with the FDA.</p>
      </header>
      {ABOUT_SECTIONS.map((s) => (
        <section key={s.heading} className="space-y-2">
          <h2 className="text-lg font-semibold">{s.heading}</h2>
          {s.body.map((b, i) =>
            b.kind === 'p' ? (
              <p key={i} className="text-sm text-gray-700 dark:text-gray-200">{b.text}</p>
            ) : (
              <ul key={i} className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-200 space-y-1">
                {b.items.map((it, j) => <li key={j}>{it}</li>)}
              </ul>
            )
          )}
        </section>
      ))}
      <FdaBriefingSection initial={initial} canRefresh={canRefresh} />
    </div>
  );
}
