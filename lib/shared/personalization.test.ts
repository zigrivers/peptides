import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SUPPORTED_ACCENTS } from './personalization';

describe('Personalization Accent Synchronization', () => {
  it('should ensure every supported accent in personalization.ts has corresponding css definitions in app/globals.css', () => {
    const globalsCssPath = path.resolve(process.cwd(), 'app/globals.css');
    const globalsCss = fs.readFileSync(globalsCssPath, 'utf8');

    for (const accent of SUPPORTED_ACCENTS) {
      // Check for light mode accent definition
      const lightModeSelector = `[data-accent="${accent}"]`;
      expect(globalsCss).toContain(lightModeSelector);

      // Check for dark mode accent definition
      const darkModeSelector = `[data-theme="dark"][data-accent="${accent}"]`;
      expect(globalsCss).toContain(darkModeSelector);

      // Check for system dark mode accent definition
      const systemSelector = `[data-theme="system"][data-accent="${accent}"]`;
      expect(globalsCss).toContain(systemSelector);
    }
  });
});
