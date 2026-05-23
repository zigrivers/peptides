/**
 * Eval (deterministic, mocked) — verifies that the extractCitation pipeline
 * produces a CitationOutput of the right shape from a representative paper
 * abstract. Real-model evals against pinned prompts are out of scope for
 * v1; this eval is a contract check.
 */
import { describe, it, expect, vi } from 'vitest';

const mockCallObject = vi.fn(async () => ({
  title: 'BPC-157 in tendon repair',
  authors: ['Smith J', 'Doe A'],
  journal: 'Peptides',
  year: 2024,
  doi: '10.1234/example',
  pmid: '39000000',
}));
vi.mock('@/lib/ai/application/AIClient', () => ({
  callObject: mockCallObject,
  callText: vi.fn(),
}));

const { extractCitation } = await import('@/lib/ai/application/extractCitation');

describe('eval: extractCitation produces a valid Citation shape', () => {
  it('returns all expected fields with correct types', async () => {
    const result = await extractCitation({
      rawText: 'Title: BPC-157 in tendon repair\nAbstract: We report...',
    });
    expect(typeof result.title).toBe('string');
    expect(Array.isArray(result.authors)).toBe(true);
    expect(result.authors.length).toBeGreaterThan(0);
    expect(typeof result.journal === 'string' || result.journal === null).toBe(true);
    expect(typeof result.year === 'number' || result.year === null).toBe(true);
    expect(typeof result.doi === 'string' || result.doi === null).toBe(true);
    expect(typeof result.pmid === 'string' || result.pmid === null).toBe(true);
  });
});
