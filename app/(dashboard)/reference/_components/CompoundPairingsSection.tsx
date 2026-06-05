import React from 'react';
import Link from 'next/link';
import type { Citation, CompoundPairing, EvidenceQuality } from '@/lib/reference/domain/types';

function citationHref(citation: Citation): string | null {
  if (citation.url) return citation.url;
  if (citation.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${citation.pmid}/`;
  if (citation.doi) return `https://doi.org/${citation.doi}`;
  return null;
}

function formatEvidenceQuality(evidenceQuality: EvidenceQuality): string {
  switch (evidenceQuality) {
    case 'human_strong':
      return 'Strong Human Evidence';
    case 'human_limited':
      return 'Limited Human Evidence';
    case 'mechanistic':
      return 'Mechanistic';
    case 'preclinical':
      return 'Preclinical';
    case 'expert_consensus':
      return 'Expert Consensus';
    default:
      return evidenceQuality;
  }
}

function PairingCitationList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;

  return (
    <ul className="mt-3 space-y-1">
      {citations.map((citation) => {
        const href = citationHref(citation);
        return (
          <li key={citation.id} className="text-xs text-gray-600 dark:text-gray-300">
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
          </li>
        );
      })}
    </ul>
  );
}

function PairingPartner({ pairing }: { pairing: CompoundPairing }) {
  if (pairing.partnerExistsInCatalog && pairing.pairedCompoundSlug) {
    return (
      <Link href={`/reference/${pairing.pairedCompoundSlug}`} className="hover:text-primary hover:underline">
        {pairing.pairedCompoundName}
      </Link>
    );
  }

  return <span>{pairing.pairedCompoundName}</span>;
}

export function CompoundPairingsSection({ pairings = [] }: { pairings?: CompoundPairing[] }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
        Compound Pairings for Maximum Benefit
      </h2>

      {pairings.length === 0 ? (
        <div className="rounded-lg border border-border bg-card text-card-foreground p-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            No evidence-backed compound pairings are curated for this compound yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pairings.map((pairing) => (
            <article
              key={pairing.id}
              className="rounded-lg border border-border bg-card text-card-foreground p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    <PairingPartner pairing={pairing} />
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {pairing.benefitGoal}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-zinc-800 dark:text-gray-300">
                      {formatEvidenceQuality(pairing.evidenceQuality)}
                    </span>
                    {pairing.bestOverall && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                        Best Overall
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-md border border-red-200 bg-red-50/60 p-3 dark:border-red-950/30 dark:bg-red-950/10">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-red-800 dark:text-red-300">
                  Safety
                </h4>
                <p className="mt-1 text-sm text-red-800 dark:text-red-300">{pairing.safetyCaveats}</p>
                <p className="mt-2 text-xs text-red-700 dark:text-red-300">
                  <span className="font-semibold">Avoid if: </span>
                  {pairing.avoidIf}
                </p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Rationale
                  </h4>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{pairing.rationale}</p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Expected Synergy
                  </h4>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{pairing.expectedSynergy}</p>
                </div>
              </div>

              {pairing.timingOrSequencingNotes && (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-semibold">Timing note: </span>
                  {pairing.timingOrSequencingNotes}
                </p>
              )}

              <PairingCitationList citations={pairing.citationRefs} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
