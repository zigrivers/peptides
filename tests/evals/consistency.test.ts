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
      const content = fs.readFileSync(`docs/${file}`, 'utf8');
      const paths = content.match(/`app\/[^`]+`|`lib\/[^`]+`/g) || [];
      paths.forEach(p => {
        const cleanPath = p.replace(/`/g, '');
        expect(fs.existsSync(cleanPath), `Path ${cleanPath} in docs/${file} does not exist`).toBe(true);
      });
    });
  });
});
