export const CATALOG_TAGS = [
  { value: 'healing', label: 'Healing' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'weight-loss', label: 'Weight Loss' },
  { value: 'longevity', label: 'Longevity' },
  { value: 'cognitive', label: 'Cognitive' },
  { value: 'skin', label: 'Skin' },
  { value: 'metabolic', label: 'Metabolic' },
] as const;

export type CatalogTag = (typeof CATALOG_TAGS)[number]['value'];
