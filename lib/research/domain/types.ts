export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  /** Cleaned page text when the provider returns it (Tavily rawContent); absent for DDG. */
  content?: string;
}

export interface ResearchFinding {
  /** Ephemeral per-run id (not persisted) so the client can toggle/approve. */
  id: string;
  claim: string;
  sourceUrls: string[];
}

export interface ResearchSource {
  title: string;
  url: string;
}

export interface ResearchResult {
  summary: string;
  findings: ResearchFinding[];
  sourcesUsed: ResearchSource[];
}

export interface SavedResearchNote {
  id: string;
  question: string;
  answerSummary: string | null;
  claim: string;
  citations: { id: string; title: string; url: string }[];
  createdAt: string; // ISO
}
