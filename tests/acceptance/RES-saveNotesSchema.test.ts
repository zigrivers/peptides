import { describe, it, expect } from 'vitest';
import { saveNotesInputSchema } from '@/lib/research/domain/schemas';

const base = { catalogItemId: 'c1', question: 'q' };

describe('saveNotesInputSchema (sections)', () => {
  it('accepts a valid per-section payload', () => {
    const r = saveNotesInputSchema.safeParse({
      ...base,
      sections: [
        { type: 'direct_answer', content: 'answer', tier: null, citations: [] },
        { type: 'dosing', content: 'topical 1-2%', tier: 'clinical', citations: [{ title: 'S', url: 'https://a.com' }] },
      ],
    });
    expect(r.success).toBe(true);
  });
  it('rejects duplicate section types', () => {
    const r = saveNotesInputSchema.safeParse({
      ...base,
      sections: [
        { type: 'evidence', content: 'a', tier: null, citations: [{ title: 'S', url: 'https://a.com' }] },
        { type: 'evidence', content: 'b', tier: null, citations: [{ title: 'S', url: 'https://a.com' }] },
      ],
    });
    expect(r.success).toBe(false);
  });
  it('requires a citation for evidence/dosing sections', () => {
    const r = saveNotesInputSchema.safeParse({ ...base, sections: [{ type: 'evidence', content: 'a', tier: null, citations: [] }] });
    expect(r.success).toBe(false);
  });
  it('requires tier only on dosing sections', () => {
    const bad = saveNotesInputSchema.safeParse({ ...base, sections: [{ type: 'evidence', content: 'a', tier: 'clinical', citations: [{ title: 'S', url: 'https://a.com' }] }] });
    expect(bad.success).toBe(false);
    const ok = saveNotesInputSchema.safeParse({ ...base, sections: [{ type: 'caveats', content: 'c', tier: null, citations: [] }] });
    expect(ok.success).toBe(true);
  });
  it('rejects a dosing section with null tier', () => {
    const r = saveNotesInputSchema.safeParse({
      catalogItemId: 'c1', question: 'q',
      sections: [{ type: 'dosing', content: 'x', tier: null, citations: [{ title: 'S', url: 'https://a.com' }] }],
    });
    expect(r.success).toBe(false);
  });
});
