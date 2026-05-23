/**
 * Eval (deterministic, mocked) — verifies the profile-draft pipeline's
 * structural contract: the produced draft is non-empty, includes the
 * expected section headings, and does not contain disallowed phrases
 * (ADR-010 anti-vision rules).
 */
import { describe, it, expect, vi } from 'vitest';

const mockCallText = vi.fn(
  async () =>
    `## Overview\n\nBPC-157 is a synthetic peptide derived from a stomach protein.\n\n## Mechanism\n\nProposed to modulate growth factor signaling.\n\n## Reported effects\n\n- Tendon repair in rats (citation needed)\n\n## Reported risks\n\n- Limited human data.\n\n## Notes for further review\n\n- Verify all citations.`
);
vi.mock('@/lib/ai/application/AIClient', () => ({
  callObject: vi.fn(),
  callText: mockCallText,
}));

const { draftCompoundProfile } = await import('@/lib/ai/application/draftCompoundProfile');

describe('eval: draftCompoundProfile produces a valid, scope-compliant draft', () => {
  it('returns a draft containing the expected section headings', async () => {
    const { draft } = await draftCompoundProfile({
      compoundName: 'BPC-157',
      citations: ['Smith J, 2024'],
    });
    expect(draft.length).toBeGreaterThan(20);
    expect(draft).toContain('## Overview');
    expect(draft).toContain('## Mechanism');
    expect(draft).toContain('## Notes for further review');
  });

  it('does not contain disallowed phrases', async () => {
    const { draft } = await draftCompoundProfile({
      compoundName: 'BPC-157',
      citations: [],
    });
    expect(draft.toLowerCase()).not.toContain('safety clearance');
    expect(draft.toLowerCase()).not.toContain('fda-approved');
    expect(draft.toLowerCase()).not.toContain('clinically approved');
  });
});
