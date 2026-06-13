export type AIProvider = 'anthropic' | 'gemini' | 'deepseek';

export const MODEL_IDS = {
  // ADR-010: drafting and "high-quality" workloads.
  anthropicSonnet: 'claude-sonnet-4-6',
  // ADR-010: batch / cost-sensitive jobs (citation extraction, digest).
  anthropicHaiku: 'claude-haiku-4-5-20251001',
  // ADR-010: secondary provider.
  geminiPro: 'gemini-2.5-pro',
  // ADR-010: tertiary provider (cost-efficient; primary for the monthly
  // catalog-refresh job — see catalog-platform-upgrade-plan.md §5).
  deepseekChat: 'deepseek-chat',
} as const;

export type ModelId = (typeof MODEL_IDS)[keyof typeof MODEL_IDS];

/**
 * Logical operation identifier used in audit metadata. Keeping these as
 * literals (not free text) lets the audit reader filter cleanly per use
 * case and prevents accidental prompt-content leakage into the audit log
 * via mis-labelled operations.
 */
export type AIOperation = 'extract_citation' | 'draft_compound_profile' | 'compound_research';

export interface CitationOutput {
  title: string;
  authors: string[];
  journal: string | null;
  year: number | null;
  doi: string | null;
  pmid: string | null;
}

export class AIUnavailableError extends Error {
  constructor(public readonly cause?: unknown) {
    super('ai_unavailable');
    this.name = 'AIUnavailableError';
  }
}

export class AIInvalidResponseError extends Error {
  constructor() {
    super('ai_invalid_response');
    this.name = 'AIInvalidResponseError';
  }
}
