import type { InjectionSite } from './types';

const SUBQ_SITES: InjectionSite[] = [
  { bodyPart: 'abdomen', side: 'left' },
  { bodyPart: 'abdomen', side: 'right' },
  { bodyPart: 'thigh', side: 'left' },
  { bodyPart: 'thigh', side: 'right' },
];

const IM_SITES: InjectionSite[] = [
  { bodyPart: 'thigh', side: 'left' },
  { bodyPart: 'thigh', side: 'right' },
  { bodyPart: 'deltoid', side: 'left' },
  { bodyPart: 'deltoid', side: 'right' },
  { bodyPart: 'ventrogluteal', side: 'left' },
  { bodyPart: 'ventrogluteal', side: 'right' },
];

export const SITES_BY_ROUTE: Record<string, InjectionSite[]> = {
  SubQ: SUBQ_SITES,
  IM: IM_SITES,
};

export function getSitesForRoute(administrationRoute: string): InjectionSite[] {
  return SITES_BY_ROUTE[administrationRoute] ?? [];
}

export function sitesEqual(a: InjectionSite, b: InjectionSite): boolean {
  return a.bodyPart === b.bodyPart && a.side === b.side;
}

/**
 * Returns the next site in round-robin order based on history.
 * Returns null when there is no prior history (AC 5: first-dose behavior).
 */
export function suggestNextSite(
  recentSites: InjectionSite[],
  validSites: InjectionSite[]
): InjectionSite | null {
  if (validSites.length === 0 || recentSites.length === 0) return null;

  // recentSites is newest-first; find() returns the most recent valid site
  const lastValidSite = recentSites.find((s) => validSites.some((v) => sitesEqual(v, s)));
  if (!lastValidSite) return null;

  const lastIdx = validSites.findIndex((v) => sitesEqual(v, lastValidSite));
  return validSites[(lastIdx + 1) % validSites.length];
}

export type SiteWithMeta = {
  site: InjectionSite;
  lastUsed: Date | null;
  daysSinceLastUse: number | null;
  isRested: boolean; // unused ≥ 7 days, or never used
};

export function getSitesMeta(
  logs: Array<{ injectionSite: InjectionSite | null; loggedAt: Date }>,
  validSites: InjectionSite[],
  asOf: Date
): SiteWithMeta[] {
  return validSites.map((site) => {
    const lastLog = logs
      .filter((l) => l.injectionSite !== null && sitesEqual(l.injectionSite!, site))
      .sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime())[0];

    const lastUsed = lastLog?.loggedAt ?? null;
    const daysSinceLastUse =
      lastUsed !== null
        ? Math.floor((asOf.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24))
        : null;

    return {
      site,
      lastUsed,
      daysSinceLastUse,
      isRested: daysSinceLastUse === null || daysSinceLastUse >= 7,
    };
  });
}

export type SiteSuggestion = {
  suggestion: InjectionSite | null;
  validSites: InjectionSite[];
  siteMeta: SiteWithMeta[];
  recentSites: InjectionSite[];
};
