/**
 * Task 5.4 — draftCompoundProfile operation tests.
 *
 * Includes the disallowed-phrase guard required by ADR-010 (no
 * "safety clearance" / "FDA-approved" / personalized dose recommendations).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCallText = vi.fn();
vi.mock('@/lib/ai/application/AIClient', () => ({
  callObject: vi.fn(),
  callText: mockCallText,
}));

beforeEach(() => {
  vi.resetAllMocks();
});

const { draftCompoundProfile } = await import('@/lib/ai/application/draftCompoundProfile');

describe('draftCompoundProfile', () => {
  it('returns the draft text on success', async () => {
    mockCallText.mockResolvedValueOnce(
      '## Overview\nBPC-157 is a synthetic peptide.\n## Mechanism\n...\n## Notes for further review\n- needs more citations'
    );
    const result = await draftCompoundProfile({
      compoundName: 'BPC-157',
      citations: ['Smith J, 2022, Peptides journal'],
    });
    expect(result.draft).toContain('## Overview');
  });

  it('rejects empty compound name', async () => {
    await expect(
      draftCompoundProfile({ compoundName: '', citations: [] })
    ).rejects.toThrow('empty_compound_name');
  });

  it('rejects output containing "safety clearance"', async () => {
    mockCallText.mockResolvedValueOnce(
      'This compound has safety clearance for use. It is safe.'
    );
    await expect(
      draftCompoundProfile({ compoundName: 'BPC-157', citations: [] })
    ).rejects.toThrow('disallowed_output');
  });

  it('rejects output claiming FDA approval', async () => {
    mockCallText.mockResolvedValueOnce(
      'This compound is approved by the FDA for therapeutic use.'
    );
    await expect(
      draftCompoundProfile({ compoundName: 'BPC-157', citations: [] })
    ).rejects.toThrow('disallowed_output');
  });

  it('propagates ai_unavailable for the caller to handle', async () => {
    mockCallText.mockRejectedValueOnce(new Error('ai_unavailable'));
    await expect(
      draftCompoundProfile({ compoundName: 'BPC-157', citations: [] })
    ).rejects.toThrow('ai_unavailable');
  });
});
