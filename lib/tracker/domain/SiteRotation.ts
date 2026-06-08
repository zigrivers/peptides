import type { InjectionSite } from './types';

const SUBQ_SITES: InjectionSite[] = [
  { bodyPart: 'abdomen-upper', side: 'left' },
  { bodyPart: 'abdomen-upper', side: 'right' },
  { bodyPart: 'abdomen-lower', side: 'left' },
  { bodyPart: 'abdomen-lower', side: 'right' },
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
  const normalized = administrationRoute.trim().toLowerCase();
  if (normalized === 'subq' || normalized === 'subcutaneous' || normalized === 'sub-q') {
    return SITES_BY_ROUTE.SubQ;
  }
  if (normalized === 'im' || normalized === 'intramuscular' || normalized === 'intra-muscular') {
    return SITES_BY_ROUTE.IM;
  }
  const matchKey = Object.keys(SITES_BY_ROUTE).find(
    (k) => k.toLowerCase() === normalized
  );
  if (matchKey) {
    return SITES_BY_ROUTE[matchKey];
  }
  return [];
}

export function sitesEqual(a: InjectionSite, b: InjectionSite): boolean {
  return a.bodyPart === b.bodyPart && a.side === b.side;
}

export function sitesEqualLegacy(a: InjectionSite, b: InjectionSite): boolean {
  if (a.side !== b.side) return false;
  if (a.bodyPart === b.bodyPart) return true;

  // Legacy abdomen mapping: treat 'abdomen' as matching both 'abdomen-upper' and 'abdomen-lower'
  if (a.bodyPart === 'abdomen' && (b.bodyPart === 'abdomen-upper' || b.bodyPart === 'abdomen-lower')) {
    return true;
  }
  if (b.bodyPart === 'abdomen' && (a.bodyPart === 'abdomen-upper' || a.bodyPart === 'abdomen-lower')) {
    return true;
  }

  return false;
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
  const lastValidSiteRaw = recentSites.find((s) => validSites.some((v) => sitesEqualLegacy(v, s)));
  if (!lastValidSiteRaw) return null;

  const lastValidSite: InjectionSite = {
    ...lastValidSiteRaw,
    bodyPart: lastValidSiteRaw.bodyPart === 'abdomen' ? 'abdomen-lower' : lastValidSiteRaw.bodyPart,
  };

  let lastIdx = validSites.findIndex((v) => sitesEqual(v, lastValidSite));
  if (lastIdx === -1) {
    lastIdx = validSites.findIndex((v) => sitesEqualLegacy(v, lastValidSite));
  }
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
    // logs is newest-first; find() gives the most recent matching site
    const lastLog = logs.find((l) => l.injectionSite !== null && sitesEqualLegacy(l.injectionSite!, site));

    const lastUsed = lastLog?.loggedAt ?? null;
    const daysSinceLastUse =
      lastUsed !== null
        ? Math.floor(
            (Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()) -
              Date.UTC(lastUsed.getUTCFullYear(), lastUsed.getUTCMonth(), lastUsed.getUTCDate())) /
              (1000 * 60 * 60 * 24)
          )
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
