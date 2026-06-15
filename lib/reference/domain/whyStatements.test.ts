import { describe, it, expect } from 'vitest';
import { getCompoundWhyStatement } from './whyStatements';

describe('getCompoundWhyStatement', () => {
  it('should return correct why statements for known peptides', () => {
    expect(getCompoundWhyStatement('BPC-157')).toContain('healing of tendons');
    expect(getCompoundWhyStatement('TB-500')).toContain('systemic tissue repair');
    expect(getCompoundWhyStatement('Semaglutide')).toContain('sustained weight loss');
    expect(getCompoundWhyStatement('CJC-1295 No DAC')).toContain('Primes the pituitary');
    expect(getCompoundWhyStatement('Ipamorelin')).toContain('wave-like growth hormone');
  });

  it('should return correct why statements for mixed/combo compounds', () => {
    expect(getCompoundWhyStatement('CJC-1295 No DAC / Ipamorelin')).toContain('synergistic GHRH/GHRP');
    expect(getCompoundWhyStatement('BPC-157 / TB-500 Mix')).toContain('localized blood vessel growth');
  });

  it('should handle name normalization (spaces, cases, hyphens, slashes)', () => {
    expect(getCompoundWhyStatement('  bpc-157  ')).toContain('healing of tendons');
    expect(getCompoundWhyStatement('BPC 157')).toContain('healing of tendons');
    expect(getCompoundWhyStatement('bpc/157')).toContain('healing of tendons');
  });

  it('should return curated single-sentence why statements for the newer compounds (no markdown fallback)', () => {
    for (const name of ['AOD-9604', 'IGF-1 LR3', 'Melanotan-1', 'PE-22-28', 'SS-31', 'TB-500 Fragment (889 Da)']) {
      const why = getCompoundWhyStatement(name);
      expect(why, `${name} should have a curated why statement`).not.toBeNull();
      // Must be prose, not the raw mechanism markdown that starts with a heading.
      expect(why!.startsWith('#')).toBe(false);
    }
  });

  it('should return null for unknown compounds', () => {
    expect(getCompoundWhyStatement('unknown peptide')).toBeNull();
  });
});
