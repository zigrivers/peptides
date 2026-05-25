import { z } from 'zod';

// NOTE: Keep in sync with accent color classes mapped in app/globals.css
export const SUPPORTED_THEMES = ['light', 'dark', 'system'] as const;
export const SUPPORTED_ACCENTS = ['indigo', 'emerald', 'violet', 'amber', 'rose', 'slate'] as const;

export type Theme = (typeof SUPPORTED_THEMES)[number];
export type AccentColor = (typeof SUPPORTED_ACCENTS)[number];

export const personalizationSchema = z.object({
  theme: z.enum(SUPPORTED_THEMES),
  accentColor: z.enum(SUPPORTED_ACCENTS),
  clientVersion: z.number().int().positive().optional(),
});
