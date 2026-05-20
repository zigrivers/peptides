import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('Coverage Eval', () => {
  it('maps every User Story AC to a test case in story-tests-map.md', () => {
    const storiesMd = fs.readFileSync('docs/user-stories.md', 'utf8');
    const mapMd = fs.readFileSync('docs/story-tests-map.md', 'utf8');
    
    // Extract AC 1, AC 2, etc. from stories
    const acs = storiesMd.match(/AC \d+/g) || [];
    acs.forEach(ac => {
      expect(mapMd).toContain(ac);
    });
  });
});
