/**
 * Task 5.4 — extractCitation operation tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCallObject = vi.fn();
vi.mock('@/lib/ai/application/AIClient', () => ({
  callObject: mockCallObject,
  callText: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

const { extractCitation } = await import('@/lib/ai/application/extractCitation');

describe('extractCitation', () => {
  it('AC-1: returns the parsed citation on success', async () => {
    mockCallObject.mockResolvedValueOnce({
      title: 'BPC-157 in tissue repair',
      authors: ['Smith J', 'Doe A'],
      journal: 'Peptides',
      year: 2022,
      doi: '10.1234/test',
      pmid: '12345678',
    });
    const result = await extractCitation({
      rawText: 'Title: BPC-157 in tissue repair\nAbstract: ...',
    });
    expect(result.title).toBe('BPC-157 in tissue repair');
    expect(result.authors).toContain('Smith J');
    expect(mockCallObject).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'extract_citation',
        prompt: expect.stringContaining('<PAPER_TEXT>'),
      })
    );
  });

  it('AC-2: rejects empty input', async () => {
    await expect(extractCitation({ rawText: '' })).rejects.toThrow('empty_input');
    expect(mockCallObject).not.toHaveBeenCalled();
  });

  it('AC-3: propagates AIUnavailableError so caller can degrade gracefully', async () => {
    mockCallObject.mockRejectedValueOnce(new Error('ai_unavailable'));
    await expect(
      extractCitation({ rawText: 'paper content here' })
    ).rejects.toThrow('ai_unavailable');
  });
});
