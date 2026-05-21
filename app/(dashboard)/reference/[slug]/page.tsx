import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getCompoundBySlug } from '@/lib/reference/application/CompoundService';
import type { Citation } from '@/lib/reference/domain/types';

function CitationLink({ citation }: { citation: Citation }) {
  const href = citation.url
    ? citation.url
    : citation.pmid
    ? `https://pubmed.ncbi.nlm.nih.gov/${citation.pmid}/`
    : citation.doi
    ? `https://doi.org/${citation.doi}`
    : null;

  return (
    <li className="text-sm text-gray-600">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-indigo-600"
        >
          {citation.title}
        </a>
      ) : (
        citation.title
      )}
      {citation.doi && <span className="ml-1 text-gray-400">DOI: {citation.doi}</span>}
      {citation.pmid && <span className="ml-1 text-gray-400">PMID: {citation.pmid}</span>}
    </li>
  );
}

function DoseRow({ label, amount, unit }: { label: string; amount: string; unit: string }) {
  return (
    <tr>
      <td className="py-1 pr-4 text-sm text-gray-500">{label}</td>
      <td className="py-1 text-sm font-medium text-gray-900">
        {amount} {unit}
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

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <nav className="mb-4">
        <Link href="/reference" className="text-sm text-indigo-600 hover:underline">
          ← Catalog
        </Link>
      </nav>

      <h1 className="text-2xl font-semibold text-gray-900">
        {isArchived ? `${compound.name} (archived)` : compound.name}
      </h1>

      {compound.iupacName && (
        <p className="mt-1 text-xs text-gray-400 font-mono break-all">{compound.iupacName}</p>
      )}

      {compound.synonyms.length > 0 && (
        <p className="mt-2 text-sm text-gray-500">
          Also known as: {compound.synonyms.join(', ')}
        </p>
      )}

      {compound.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {compound.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs bg-indigo-50 text-indigo-700 rounded-full px-2 py-0.5"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {!compound.profile && (
        <div className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-sm text-yellow-800 font-medium">Profile in progress</p>
          <p className="mt-1 text-sm text-yellow-700">
            Dosing and clinical information will be added soon.
          </p>
        </div>
      )}

      {compound.mechanismOfAction && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
            Mechanism of Action
          </h2>
          <p className="text-sm text-gray-600">{compound.mechanismOfAction}</p>
        </section>
      )}

      {compound.administrationRoutes.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
            Administration Routes
          </h2>
          <div className="flex flex-wrap gap-2">
            {compound.administrationRoutes.map((route) => (
              <span
                key={route}
                className="text-sm bg-gray-100 text-gray-700 rounded px-2 py-1"
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
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
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
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Side Effects
              </h2>
              <p className="text-sm text-gray-600">{compound.profile.sideEffects}</p>
            </section>
          )}

          {compound.profile.stackingNotes && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Stacking Notes
              </h2>
              <p className="text-sm text-gray-600">{compound.profile.stackingNotes}</p>
            </section>
          )}

          {compound.profile.citations.length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
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
