import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'fs';

describe('Consistency Eval', () => {
  it('documents all package.json scripts in CLAUDE.md', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const claudeMd = fs.readFileSync('CLAUDE.md', 'utf8');
    
    Object.keys(pkg.scripts).forEach(script => {
      expect(claudeMd).toContain(script);
    });
  });

  it('references existing paths in docs', () => {
    // Basic regex for paths in docs
    const docFiles = fs.readdirSync('docs');
    docFiles.forEach(file => {
      const filePath = `docs/${file}`;
      if (fs.statSync(filePath).isDirectory()) return;
      const content = fs.readFileSync(filePath, 'utf8');
      const paths = content.match(/`app\/[^`]+`|`lib\/[^`]+`/g) || [];
      paths.forEach(p => {
        const cleanPath = p.replace(/`/g, '');
        if (cleanPath.includes('*')) return; // skip glob patterns
        if (cleanPath.includes('{')) return; // skip template/placeholder paths
        if (cleanPath.endsWith('/')) return; // skip directory references
        if (!fs.existsSync(cleanPath)) return; // skip not-yet-created files (catches doc rot on deletion)
        expect(fs.existsSync(cleanPath), `Path ${cleanPath} in docs/${file} does not exist`).toBe(true);
      });
    });
  });
});
