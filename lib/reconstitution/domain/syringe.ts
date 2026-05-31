import Decimal from 'decimal.js';

export const SYRINGE_CONVERSION_FACTORS = {
  U100: new Decimal('0.01'),
  U40: new Decimal('0.025'),
};

export function getVolumePerUnit(syringeStandard?: string): Decimal {
  if (syringeStandard === 'U40') {
    return SYRINGE_CONVERSION_FACTORS.U40;
  }
  return SYRINGE_CONVERSION_FACTORS.U100;
}

export function getCapColor(compoundSlug: string, compoundId?: string): string {
  const knownColors: Record<string, string> = {
    'tirzepatide': '--compound-tirzepatide',
    'semaglutide': '--compound-semaglutide',
    'bpc-157': '--compound-bpc157',
  };
  if (knownColors[compoundSlug]) return `hsl(var(${knownColors[compoundSlug]}))`;
  
  if (!compoundId) return 'hsl(215 16% 47%)';

  const salt = (compoundSlug ?? 'unknown') + compoundId;
  let hash = 0;
  for (let i = 0; i < salt.length; i++) {
    hash = salt.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  
  const lightnessVar = (hue >= 45 && hue <= 165)
    ? 'var(--vial-cap-lightness-low, 35%)'
    : 'var(--vial-cap-lightness-high, 45%)';

  return `hsl(${hue} 50% ${lightnessVar})`;
}
