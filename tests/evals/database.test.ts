import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('Database Eval', () => {
  it('matches prisma/schema.prisma models with database-schema.md', () => {
    const schemaMd = fs.readFileSync('docs/database-schema.md', 'utf8');
    const schemaPrisma = fs.readFileSync('prisma/schema.prisma', 'utf8');
    
    // Extract model names from Prisma
    const models = schemaPrisma.match(/model\s+(\w+)/g) || [];
    models.forEach(m => {
      const name = m.split(/\s+/)[1];
      expect(schemaMd).toContain(name);
    });
  });
});
