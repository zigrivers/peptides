import type { z } from 'zod';
import type { fdaBriefingSchema } from './schemas';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  /** Cleaned page text when the provider returns it (Tavily rawContent); absent for DDG. */
  content?: string;
}

export type DoseTier = 'clinical' | 'non_clinical' | 'unclear';
export type ResearchSectionType = 'direct_answer' | 'evidence' | 'dosing' | 'caveats';

export interface ResearchEvidenceItem {
  point: string;
  sourceUrls: string[];
}
export interface ResearchDosingItem {
  text: string;
  tier: DoseTier;
  sourceUrls: string[];
}
export interface ResearchSource {
  title: string;
  url: string;
}

export interface ResearchAnswer {
  directAnswer: string;
  evidence: ResearchEvidenceItem[];
  dosing: ResearchDosingItem[];
  caveatsGaps: string[];
  sourcesUsed: ResearchSource[];
  /** Advisory only; raises (never suppresses) gap-fill; never shown or saved. */
  needsMoreEvidence: boolean;
}

export type FdaBriefingResult = z.output<typeof fdaBriefingSchema>;

export interface SavedSectionCitation {
  id: string;
  title: string;
  url: string;
}
export interface SavedSection {
  id: string;
  type: ResearchSectionType;
  content: string;
  tier: DoseTier | null;
  order: number;
  citations: SavedSectionCitation[];
}
export interface SavedResearchNote {
  id: string;
  question: string;
  createdAt: string; // ISO
  /** New per-section notes. Empty for legacy notes. */
  sections: SavedSection[];
  /** Legacy per-finding fields (used only when sections is empty). */
  claim: string | null;
  answerSummary: string | null;
  citations: SavedSectionCitation[];
}
