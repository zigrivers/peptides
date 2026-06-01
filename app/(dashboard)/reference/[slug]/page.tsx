import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getCompoundBySlug } from '@/lib/reference/application/CompoundService';
import type { Citation } from '@/lib/reference/domain/types';
import { getSerializedVialsForCompound } from '@/lib/reconstitution/application/VialService';
import { CompoundInventoryManager } from '../_components/CompoundInventoryManager';

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

function DoseRow({ label, amount, unit }: { label: string; amount: string; unit: string }) {
  return (
    <tr>
      <td className="py-1 pr-4 text-sm text-gray-500 dark:text-gray-400">{label}</td>
      <td className="py-1 text-sm font-medium text-gray-900 dark:text-gray-100">
        <span className="font-mono">{amount}</span> {unit}
      </td>
    </tr>
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

  const serializedVials = await getSerializedVialsForCompound(session.user.id, compound.id);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <nav className="mb-4">
        <Link href="/reference" className="text-sm text-primary hover:underline">
          ← Catalog
        </Link>
      </nav>

      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        {isArchived ? `${compound.name} (archived)` : compound.name}
      </h1>

      {compound.iupacName && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 font-mono break-all">{compound.iupacName}</p>
      )}

      {compound.synonyms.length > 0 && (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Also known as: {compound.synonyms.join(', ')}
        </p>
      )}

      {compound.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {compound.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs bg-primary/5 text-primary rounded-full px-2 py-0.5"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <CompoundInventoryManager
        compoundId={compound.id}
        compoundName={compound.name}
        vials={serializedVials}
        fridgeShelfLifeMonths={compound.profile?.fridgeShelfLifeMonths ?? 12}
        freezerShelfLifeMonths={compound.profile?.freezerShelfLifeMonths ?? 24}
      />

      {!compound.profile && (
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
          <p className="text-sm text-gray-600 dark:text-gray-300">{compound.mechanismOfAction}</p>
        </section>
      )}

      {compound.profile?.benefitTimeline && compound.profile.benefitTimeline.length > 0 && (
        <section className="mt-8 border border-border bg-card text-card-foreground rounded-xl p-5 shadow-sm animate-[fadeIn_0.3s_ease-out]">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-6">
            <span>⏱️</span> Clinical Progression Timeline
          </h2>
          <div className="relative pl-6 border-l-2 border-primary/20 space-y-6">
            {compound.profile.benefitTimeline.map((item) => (
              <div key={item.week} className="relative group">
                {/* Pulsing Timeline Node Indicator */}
                <div className="absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-card border-2 border-primary group-hover:scale-125 transition-all duration-200 shadow-sm">
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

      {compound.administrationRoutes.length > 0 && (
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

      {compound.profile && (
        <>
          <section className="mt-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
              Dosing Reference
            </h2>
            <table>
              <tbody>
                <DoseRow
                  label="Low"
                  amount={compound.profile.dosingLow.amount}
                  unit={compound.profile.dosingLow.unit}
                />
                <DoseRow
                  label="Typical"
                  amount={compound.profile.dosingTypical.amount}
                  unit={compound.profile.dosingTypical.unit}
                />
                <DoseRow
                  label="High"
                  amount={compound.profile.dosingHigh.amount}
                  unit={compound.profile.dosingHigh.unit}
                />
              </tbody>
            </table>
          </section>

          {compound.profile.sideEffects && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                Side Effects
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300">{compound.profile.sideEffects}</p>
            </section>
          )}

          {compound.profile.stackingNotes && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                Stacking Notes
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300">{compound.profile.stackingNotes}</p>
            </section>
          )}

          {compound.profile.citations.length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                Citations
              </h2>
              <ul className="space-y-1">
                {compound.profile.citations.map((cit) => (
                  <CitationLink key={cit.id} citation={cit} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
