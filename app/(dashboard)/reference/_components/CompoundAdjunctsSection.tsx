import React from 'react';
import type {
  AdjunctCategory,
  AdjunctSafetyCategory,
  CatalogAdjunctCitation,
  CompoundAdjunctRecommendation,
  EvidenceQuality,
} from '@/lib/reference/domain/types';

function citationHref(citation: CatalogAdjunctCitation): string | null {
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

function formatAdjunctCategory(category: AdjunctCategory): string {
  switch (category) {
    case 'SUPPLEMENT':
      return 'Supplement';
    case 'MINERAL':
      return 'Mineral';
    case 'MEDICATION':
      return 'Medication';
    case 'LIFESTYLE_PROTOCOL':
      return 'Lifestyle Protocol';
    case 'LAB_MONITORING':
      return 'Lab Monitoring';
    case 'SAFETY_MITIGATION':
      return 'Safety Mitigation';
    default:
      return category;
  }
}

function formatSafetyCategory(category: AdjunctSafetyCategory): string {
  switch (category) {
    case 'CONTRAINDICATED':
      return 'Contraindicated';
    case 'CLINICIAN_SUPERVISION':
      return 'Clinician Supervision';
    case 'LAB_MONITORING_RECOMMENDED':
      return 'Lab Monitoring Recommended';
    case 'TIMING_SENSITIVE':
      return 'Timing Sensitive';
    case 'INTERACTION_SENSITIVE':
      return 'Interaction Sensitive';
    case 'SAFETY_MITIGATION':
      return 'Safety Mitigation';
    case 'OPTIONAL_SUPPORTIVE_MEASURE':
      return 'Optional Supportive Measure';
    default:
      return category;
  }
}

function AdjunctCitationList({ citations }: { citations: CatalogAdjunctCitation[] }) {
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

export function CompoundAdjunctsSection({
  adjuncts = [],
}: {
  adjuncts?: CompoundAdjunctRecommendation[];
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
        Supportive Adjuncts and Monitoring
      </h2>

      {adjuncts.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            No supportive adjuncts or monitoring supports are curated for this compound yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {adjuncts.map((adjunct) => (
            <article
              key={adjunct.id}
              className="rounded-lg border border-border bg-card p-4 text-card-foreground"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {adjunct.adjunctName}
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    {adjunct.adjunctDescription}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-medium text-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-300">
                      {formatAdjunctCategory(adjunct.adjunctCategory)}
                    </span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {adjunct.benefitGoal}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-zinc-800 dark:text-gray-300">
                      {formatEvidenceQuality(adjunct.evidenceQuality)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-950/10">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-300">
                  Safety
                </h4>
                <p className="mt-1 text-sm font-medium text-amber-900 dark:text-amber-300">
                  {formatSafetyCategory(adjunct.safetyCategory)}
                </p>
                <p className="mt-1 text-sm text-amber-900 dark:text-amber-300">
                  {adjunct.safetyCaveats}
                </p>
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">Avoid if: </span>
                  {adjunct.avoidIf}
                </p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Rationale
                  </h4>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{adjunct.rationale}</p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Expected Benefit
                  </h4>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    {adjunct.expectedBenefit}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-md bg-gray-50 p-3 dark:bg-zinc-900/60">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Evidence Context
                </h4>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {adjunct.adjunctEvidenceSummary}
                </p>
                {adjunct.implementationNotes && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {adjunct.implementationNotes}
                  </p>
                )}
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {adjunct.adjunctSafetyNotes}
                </p>
              </div>

              <AdjunctCitationList citations={adjunct.citationRefs} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
