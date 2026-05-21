import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('Coverage Eval', () => {
  it('maps every User Story AC to a test case in story-tests-map.md', () => {
    const storiesMd = fs.readFileSync('docs/user-stories.md', 'utf8');
    const mapMd = fs.readFileSync('docs/story-tests-map.md', 'utf8');

    // Stories use "AC 1 (Label):" format; the map uses "AC-1" format.
    // Normalize both sides to "ACN" for the existence check.
    const normalize = (s: string) => s.replace(/AC[-\s]?(\d+)/g, 'AC$1');
    const storiesNorm = normalize(storiesMd);
    const mapNorm = normalize(mapMd);

    // For each story section (### US-XXX-NN: ...), collect all AC tokens it contains
    // and assert both the story-id and each AC token appear in the test-map.
    const storySectionRegex = /###\s+(US-[A-Z]+-\d+):[\s\S]*?(?=###\s+US-|## |$)/g;
    const missing: string[] = [];
    let section;
    while ((section = storySectionRegex.exec(storiesNorm)) !== null) {
      const storyId = section[1];
      const sectionText = section[0];
      const acTokens = Array.from(new Set(sectionText.match(/AC\d+/g) || []));
      if (!mapNorm.includes(storyId)) {
        missing.push(`${storyId}: story has no row in docs/story-tests-map.md`);
        continue;
      }
      for (const ac of acTokens) {
        // Crude: check that within ~500 chars after the story-id header, the AC is present.
        // This catches "story present but ACs not enumerated" cases.
        const storyAnchorIdx = mapNorm.indexOf(storyId);
        const nextStoryIdx = mapNorm.search(new RegExp(`US-[A-Z]+-\\d+`, 'g'));
        const slice = mapNorm.slice(storyAnchorIdx, storyAnchorIdx + 800);
        if (!slice.includes(ac)) {
          missing.push(`${storyId} ${ac}: AC has no row near the story in docs/story-tests-map.md`);
        }
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Coverage gap: ${missing.length} story AC(s) not mapped in docs/story-tests-map.md:\n${missing.join('\n')}`
      );
    }

    // Sanity: at least one story must be present (catches an empty stories file).
    expect(storySectionRegex.test(storiesNorm) || storySectionRegex.lastIndex > 0).toBeTruthy();
  });
});
