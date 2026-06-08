import { describe, it, expect } from 'vitest';
import { getCompoundCommonName } from './commonName';

describe('getCompoundCommonName', () => {
  it('should return Wolverine Stack for BPC-157 / TB-500 variants', () => {
    expect(getCompoundCommonName('BPC-157 / TB-500')).toBe('Wolverine Stack');
    expect(getCompoundCommonName('bpc-157/tb-500')).toBe('Wolverine Stack');
    expect(getCompoundCommonName('BPC-157 / TB-500 Mix')).toBe('Wolverine Stack');
    expect(getCompoundCommonName('bpc157/tb500 mix')).toBe('Wolverine Stack');
  });

  it('should return Prime & Trigger Stack for CJC-1295 and Ipamorelin variants', () => {
    expect(getCompoundCommonName('CJC-1295 No DAC / Ipamorelin')).toBe('Prime & Trigger Stack');
    expect(getCompoundCommonName('cjc-1295 / ipamorelin mix')).toBe('Prime & Trigger Stack');
  });

  it('should return CagriSema for Cagrilintide and Semaglutide variants', () => {
    expect(getCompoundCommonName('CagriSema')).toBe('CagriSema');
    expect(getCompoundCommonName('cagrilintide / semaglutide')).toBe('CagriSema');
  });

  it('should return GLOW-70 Cosmetic Blend for GLOW-70 variants', () => {
    expect(getCompoundCommonName('GLOW70')).toBe('GLOW-70 Cosmetic Blend');
    expect(getCompoundCommonName('glow-70')).toBe('GLOW-70 Cosmetic Blend');
  });

  it('should return null for other compounds', () => {
    expect(getCompoundCommonName('BPC-157')).toBeNull();
    expect(getCompoundCommonName('Semaglutide')).toBeNull();
  });
});
