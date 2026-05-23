import { callObject } from './AIClient';
import { citationSchema } from '../domain/schemas';
import type { CitationOutput } from '../domain/types';

const SYSTEM_PROMPT = `You are a careful bibliography extractor. Given the
title and abstract of a peer-reviewed paper, return ONLY the bibliographic
fields requested. Never invent details that are not present in the input.
If a field is unknown, return null (or an empty array for authors). Do not
include speculative author lists, DOIs, or PMIDs.`;

/**
 * Extract a citation record from a paper's title + abstract (and optional
 * raw text). Returns a Zod-validated `CitationOutput`. Throws
 * `AIUnavailableError` if both providers fail — callers must catch and
 * degrade gracefully (e.g., fall back to manual entry).
 *
 * Per ADR-010 §"Allowed AI uses", this is a v1-approved AI operation.
 */
export async function extractCitation(input: {
  rawText: string;
  actorUserId?: string;
}): Promise<CitationOutput> {
  if (!input.rawText || input.rawText.length === 0) {
    throw new Error('empty_input');
  }
  // Delimit the user-supplied text so the LLM treats it as data, not as
  // instructions to follow. The system prompt explicitly never instructs
  // the model to act on text inside <PAPER_TEXT>.
  const prompt = `Extract the citation fields from the paper text below.

<PAPER_TEXT>
${input.rawText}
</PAPER_TEXT>`;
  const parsed = await callObject({
    operation: 'extract_citation',
    system: SYSTEM_PROMPT,
    prompt,
    schema: citationSchema,
    actorUserId: input.actorUserId,
  });
  // Schema defaults make `authors` typed as optional in the inferred type;
  // narrow it here so the CitationOutput contract is strict for consumers.
  return {
    title: parsed.title,
    authors: parsed.authors ?? [],
    journal: parsed.journal ?? null,
    year: parsed.year ?? null,
    doi: parsed.doi ?? null,
    pmid: parsed.pmid ?? null,
  };
}
