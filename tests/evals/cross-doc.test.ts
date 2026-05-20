import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('Cross-Doc Eval', () => {
  it('maintains tech stack consistency in architecture doc', () => {
    const techStackMd = fs.readFileSync('docs/tech-stack.md', 'utf8');
    const systemArchMd = fs.readFileSync('docs/system-architecture.md', 'utf8');
    
    // Check for Next.js 15, Prisma, Tailwind
    expect(systemArchMd).toContain('Next.js 15');
    expect(systemArchMd).toContain('Prisma');
    expect(systemArchMd).toContain('Tailwind');
  });
});
