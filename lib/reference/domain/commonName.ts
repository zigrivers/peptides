export function getCompoundCommonName(name: string): string | null {
  const norm = name.toLowerCase().trim().replace(/[-\s\/]/g, '');

  if (norm.includes('bpc157tb500') || (norm.includes('bpc157') && norm.includes('tb500'))) {
    return 'Wolverine Stack';
  }
  if (norm.includes('cjc1295') && norm.includes('ipamorelin')) {
    return 'Prime & Trigger Stack';
  }
  if (
    (norm.includes('cagrilintide') && norm.includes('semaglutide')) ||
    norm === 'cagrisema'
  ) {
    return 'CagriSema';
  }
  if (norm === 'glow70') {
    return 'GLOW-70 Cosmetic Blend';
  }
  return null;
}
