import { describe, it, expect } from 'vitest';
import { syringeMaxUnits, getVolumePerUnit, getCapColor } from './syringe';

describe('getVolumePerUnit', () => {
  it('returns 0.025 for U40 and 0.01 for U100 (default)', () => {
    expect(getVolumePerUnit('U40').toString()).toBe('0.025');
    expect(getVolumePerUnit('U100').toString()).toBe('0.01');
    expect(getVolumePerUnit(undefined).toString()).toBe('0.01');
  });
});

describe('getCapColor', () => {
  it('returns a CSS var for a known compound slug', () => {
    expect(getCapColor('bpc-157')).toContain('--compound-bpc157');
  });

  it('returns a neutral color when no compoundId is provided', () => {
    expect(getCapColor('unknown-slug')).toBe('hsl(215 16% 47%)');
  });

  it('derives a stable hue from slug+id, hitting both lightness branches', () => {
    // Iterate enough ids that both ternary branches (hue in [45,165] vs not) execute.
    const colors = Array.from({ length: 30 }, (_, i) => getCapColor('c', `id-${i}`));
    for (const c of colors) expect(c).toMatch(/^hsl\(\d+ 50% var\(/);
    const low = colors.some((c) => c.includes('lightness-low'));
    const high = colors.some((c) => c.includes('lightness-high'));
    expect(low && high).toBe(true);
  });

  it('handles a nullish slug with a compoundId (uses the unknown salt)', () => {
    const c = getCapColor(undefined as unknown as string, 'id-3');
    expect(c).toMatch(/^hsl\(\d+ 50% var\(/);
  });
});

describe('syringeMaxUnits', () => {
  it.each([
    ['U100', '0.3', 30],
    ['U100', '0.5', 50],
    ['U100', '1.0', 100],
    ['U40', '0.3', 12],
    ['U40', '0.5', 20],
    ['U40', '1.0', 40],
  ] as const)('%s %s mL = %i units', (standard, size, expected) => {
    expect(syringeMaxUnits(standard, size)).toBe(expected);
  });
});
