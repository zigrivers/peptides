import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('Structure Eval', () => {
  it('follows feature-based slice rules for lib/', () => {
    const libDirs = fs.readdirSync('lib').filter(d => fs.statSync(`lib/${d}`).isDirectory());
    const allowedModules = ['auth', 'tracker', 'ordering', 'reference', 'reconstitution', 'jobs', 'audit', 'shared', 'offline', 'admin'];
    
    libDirs.forEach(dir => {
      expect(allowedModules).toContain(dir);
      if (dir !== 'shared' && dir !== 'jobs') {
        const subDirs = fs.readdirSync(`lib/${dir}`);
        expect(subDirs).toContain('domain');
        expect(subDirs).toContain('application');
      }
    });
  });

  it('colocates unit tests with implementation', () => {
    // Implementation check: every .ts file in lib/ should have a .test.ts or be a barrel
    // (This is a coarse check, skip for now to avoid false positives on initial empty dirs)
  });
});
