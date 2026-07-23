import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '@/lib/shared/prisma';
import { validateDosingProtocol } from '@/lib/reference/domain/validation';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { renderToString } from 'react-dom/server';
import React from 'react';

// Mocks for Phase 4 UI tests
const mockAuth = vi.fn().mockResolvedValue({ user: { id: 'test-user-id' } });
const mockGetCompoundBySlug = vi.fn();
const mockGetSerializedVialsForCompound = vi.fn().mockResolvedValue([]);

vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}));

vi.mock('@/lib/reference/application/CompoundService', () => ({
  getCompoundBySlug: (slug: string) => mockGetCompoundBySlug(slug),
}));

vi.mock('@/lib/reconstitution/application/VialService', () => ({
  getSerializedVialsForCompound: () => mockGetSerializedVialsForCompound(),
}));

import CompoundProfilePage from '@/app/(dashboard)/reference/[slug]/page';

describe('REF Dosing Protocol Acceptances', () => {
  let testCompoundId: string;
  let defaultDosing: any;

  beforeAll(async () => {
    // Fail fast if not PostgreSQL
    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl.startsWith('postgres://') && !dbUrl.startsWith('postgresql://')) {
      throw new Error('PostgreSQL is a strict requirement for the Peptides test environment.');
    }

    // Set up a test compound
    const comp = await prisma.catalogItem.create({
      data: {
        name: 'Test Temp Dosing Compound',
        slug: 'test-temp-dosing-compound',
        catalogKey: 'test-temp-dosing-compound-key',
        administrationRoutes: ['SubQ'],
        status: 'PUBLISHED',
      },
    });
    testCompoundId = comp.id;

    defaultDosing = {
      amount: '250',
      unit: 'mcg',
    };
  });

  afterAll(async () => {
    // Clean up
    await prisma.catalogItem.deleteMany({
      where: { slug: 'test-temp-dosing-compound' },
    });
  });

  describe('Phase 1: App-Layer Zod Validation & Schema Invariants', () => {
    it('should validate standard daily protocol', () => {
      const valid = {
        cycleLengthWeeks: 8,
        restPeriodWeeks: 4,
        dosingFrequency: 'DAILY',
        dosesPerDay: 2,
        daysOn: 5,
        daysOff: 2,
        preferredTime: 'MORNING_AND_NIGHT',
        timingNotes: 'Empty stomach',
        isFdaApproved: false,
      };
      const result = validateDosingProtocol(valid);
      expect(result.success).toBe(true);
    });

    it('should reject cycles over 104 weeks or under 1', () => {
      const tooLong = validateDosingProtocol({ cycleLengthWeeks: 105 });
      const tooShort = validateDosingProtocol({ cycleLengthWeeks: 0 });
      expect(tooLong.success).toBe(false);
      expect(tooShort.success).toBe(false);
    });

    it('should reject rest periods over 104 weeks or under 1', () => {
      const tooLong = validateDosingProtocol({ restPeriodWeeks: 105 });
      const tooShort = validateDosingProtocol({ restPeriodWeeks: 0 });
      expect(tooLong.success).toBe(false);
      expect(tooShort.success).toBe(false);
    });

    it('should reject doses per day over 8 or under 1', () => {
      const tooMany = validateDosingProtocol({ dosesPerDay: 9 });
      const tooFew = validateDosingProtocol({ dosesPerDay: 0 });
      expect(tooMany.success).toBe(false);
      expect(tooFew.success).toBe(false);
    });

    it('should reject daily frequency with invalid daysOn/daysOff values', () => {
      const badSum = validateDosingProtocol({
        dosingFrequency: 'DAILY',
        daysOn: 5,
        daysOff: 3,
      });
      const invalidDays = validateDosingProtocol({
        dosingFrequency: 'DAILY',
        daysOn: 7,
        daysOff: 0,
      });
      const missingDays = validateDosingProtocol({
        dosingFrequency: 'DAILY',
        daysOn: 5,
        daysOff: null,
      });
      expect(badSum.success).toBe(false);
      expect(invalidDays.success).toBe(false);
      expect(missingDays.success).toBe(false);
    });

    it('should reject custom frequency without trimmed text description', () => {
      const noDesc = validateDosingProtocol({
        dosingFrequency: 'CUSTOM',
        customFrequencyDescription: null,
      });
      const emptyDesc = validateDosingProtocol({
        dosingFrequency: 'CUSTOM',
        customFrequencyDescription: '   ',
      });
      expect(noDesc.success).toBe(false);
      expect(emptyDesc.success).toBe(false);
    });

    it('should reject dosesPerDay >= 2 without preferredTime', () => {
      const missingTime = validateDosingProtocol({
        dosesPerDay: 2,
        preferredTime: null,
      });
      expect(missingTime.success).toBe(false);
    });

    it('should validate cross-field alignment for preferredTime and dosesPerDay', () => {
      // MORNING_AND_NIGHT requires exactly 2 doses
      const badTimeFor2 = validateDosingProtocol({
        dosesPerDay: 3,
        preferredTime: 'MORNING_AND_NIGHT',
      });
      expect(badTimeFor2.success).toBe(false);

      // MORNING_AFTERNOON_NIGHT requires exactly 3 doses
      const badTimeFor3 = validateDosingProtocol({
        dosesPerDay: 2,
        preferredTime: 'MORNING_AFTERNOON_NIGHT',
      });
      expect(badTimeFor3.success).toBe(false);

      // 4+ doses requires ANYTIME or AS_NEEDED
      const badTimeFor4 = validateDosingProtocol({
        dosesPerDay: 4,
        preferredTime: 'MORNING_AND_NIGHT',
      });
      expect(badTimeFor4.success).toBe(false);

      const goodTimeFor4 = validateDosingProtocol({
        dosesPerDay: 4,
        preferredTime: 'ANYTIME',
      });
      expect(goodTimeFor4.success).toBe(true);
    });

    it('should validate JSON fixtures file content', () => {
      const fixturePath = path.join(__dirname, '../../prisma/seed-data/dosing_fixtures.json');
      const rawData = fs.readFileSync(fixturePath, 'utf-8');
      const fixtures = JSON.parse(rawData);

      for (const item of fixtures) {
        if (item.profile) {
          const validation = validateDosingProtocol(item.profile);
          expect(validation.success, `Fixture validation failed for compound: ${item.name}. Errors: ${JSON.stringify(validation.error)}`).toBe(true);
        }
      }
    });

    it('should verify regulatory and clinical disclaimer checks for FDA vs non-FDA compounds', () => {
      const fixturePath = path.join(__dirname, '../../prisma/seed-data/dosing_fixtures.json');
      const rawData = fs.readFileSync(fixturePath, 'utf-8');
      const fixtures = JSON.parse(rawData);

      for (const item of fixtures) {
        if (item.profile) {
          const disclaimer = 'Regimen is empirical and based on scientific literature, including preclinical studies and early clinical research. Not FDA-approved.';
          if (!item.profile.isFdaApproved) {
            if (item.name === 'Cagrilintide/Semaglutide') {
              expect(item.profile.timingNotes).toContain('Not FDA-approved.');
            } else {
              expect(item.profile.timingNotes).toContain(disclaimer);
            }
          } else {
            expect(item.profile.timingNotes ? item.profile.timingNotes.includes(disclaimer) : false).toBe(false);
          }
        }
      }
    });

    it('should seed SS-31 with research-peptide community dosing ranges and cycled protocol', () => {
      // Catalog audience is DIY / research-peptide community: tiers and schedule
      // should reflect community-reported charts (0.5/1/5 mg, 5-on/2-off, 8/8 cycle),
      // not the 40 mg continuous FORZINITY/Barth clinical default as Typical.
      const seedPath = path.join(__dirname, '../../prisma/seed.ts');
      const fixturePath = path.join(__dirname, '../../prisma/seed-data/dosing_fixtures.json');
      const seedSource = fs.readFileSync(seedPath, 'utf-8');
      const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as Array<{
        name: string;
        profile?: {
          cycleLengthWeeks: number | null;
          restPeriodWeeks: number | null;
          dosingFrequency: string;
          daysOn: number | null;
          daysOff: number | null;
          preferredTime: string | null;
          timingNotes: string;
        };
      }>;

      const ss31Block = seedSource.slice(seedSource.indexOf("name: 'SS-31'"), seedSource.indexOf("name: 'TB-500 Fragment"));
      expect(ss31Block).toContain("amount: '0.5'");
      expect(ss31Block).toContain("amount: '1'");
      expect(ss31Block).toContain("amount: '5'");
      expect(ss31Block).not.toMatch(/dosingTypical:[\s\S]*?amount: '40'/);
      expect(ss31Block).not.toMatch(/dosingHigh:[\s\S]*?amount: '60'/);
      expect(ss31Block).toMatch(/5 days on \/ 2 days off/);

      const fixture = fixtures.find((f) => f.name === 'SS-31');
      expect(fixture?.profile).toBeDefined();
      expect(fixture!.profile!.dosingFrequency).toBe('DAILY');
      expect(fixture!.profile!.daysOn).toBe(5);
      expect(fixture!.profile!.daysOff).toBe(2);
      expect(fixture!.profile!.cycleLengthWeeks).toBe(8);
      expect(fixture!.profile!.restPeriodWeeks).toBe(8);
      expect(fixture!.profile!.preferredTime).toBe('MORNING');
      expect(fixture!.profile!.timingNotes).toMatch(/community/i);
      expect(fixture!.profile!.timingNotes).toMatch(/FORZINITY/);
      expect(fixture!.profile!.timingNotes).toMatch(/40 mg/);

      const validation = validateDosingProtocol(fixture!.profile!);
      expect(validation.success, JSON.stringify(validation.error)).toBe(true);
    });

    it('should seed MOTS-c with research-peptide community dosing ranges and thrice-weekly protocol', () => {
      // Catalog audience is DIY / research-peptide community: modal charts use 5 mg SC
      // 2–3× weekly (high tier ~10 mg), not 10 mg typical / 15 mg high as if those were the
      // standard per-injection sizes.
      const seedPath = path.join(__dirname, '../../prisma/seed.ts');
      const fixturePath = path.join(__dirname, '../../prisma/seed-data/dosing_fixtures.json');
      const seedSource = fs.readFileSync(seedPath, 'utf-8');
      const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as Array<{
        name: string;
        profile?: {
          cycleLengthWeeks: number | null;
          restPeriodWeeks: number | null;
          dosingFrequency: string;
          daysOn: number | null;
          daysOff: number | null;
          preferredTime: string | null;
          timingNotes: string;
        };
      }>;

      const motsBlock = seedSource.slice(seedSource.indexOf("name: 'MOTS-c'"), seedSource.indexOf("name: 'KPV'"));
      const lowAmt = motsBlock.match(/dosingLow:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const typAmt = motsBlock.match(/dosingTypical:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const highAmt = motsBlock.match(/dosingHigh:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      // Community modal is 5 mg typical (not the old 10 mg typical / 15 mg high).
      expect(lowAmt).toBe('5.0');
      expect(typAmt).toBe('5.0');
      expect(highAmt).toBe('10.0');
      expect(typAmt).not.toBe('10.0');
      expect(highAmt).not.toBe('15.0');
      expect(motsBlock).toMatch(/2–3× weekly/);

      const fixture = fixtures.find((f) => f.name === 'MOTS-c');
      expect(fixture?.profile).toBeDefined();
      expect(fixture!.profile!.dosingFrequency).toBe('THRICE_WEEKLY');
      expect(fixture!.profile!.cycleLengthWeeks).toBe(6);
      expect(fixture!.profile!.restPeriodWeeks).toBe(4);
      expect(fixture!.profile!.preferredTime).toBe('MORNING');
      expect(fixture!.profile!.timingNotes).toMatch(/community/i);
      expect(fixture!.profile!.timingNotes).toMatch(/5 mg/);
      expect(fixture!.profile!.timingNotes).toMatch(/Not FDA-approved/);

      const validation = validateDosingProtocol(fixture!.profile!);
      expect(validation.success, JSON.stringify(validation.error)).toBe(true);
    });

    it('should seed TB-500 with research-peptide community dosing ranges and twice-weekly protocol', () => {
      // Catalog audience is DIY / research-peptide community: modal charts use ~2–2.5 mg SC
      // twice weekly loading (~4–5 mg/week), not 5 mg typical / 10 mg high as if those were
      // the standard per-injection sizes (which implied 10–20 mg/week).
      const seedPath = path.join(__dirname, '../../prisma/seed.ts');
      const fixturePath = path.join(__dirname, '../../prisma/seed-data/dosing_fixtures.json');
      const seedSource = fs.readFileSync(seedPath, 'utf-8');
      const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as Array<{
        name: string;
        profile?: {
          cycleLengthWeeks: number | null;
          restPeriodWeeks: number | null;
          dosingFrequency: string;
          preferredTime: string | null;
          timingNotes: string;
        };
      }>;

      const tbBlock = seedSource.slice(seedSource.indexOf("name: 'TB-500'"), seedSource.indexOf("name: 'Semaglutide'"));
      const lowAmt = tbBlock.match(/dosingLow:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const typAmt = tbBlock.match(/dosingTypical:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const highAmt = tbBlock.match(/dosingHigh:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      // Community modal is 2.5 mg typical loading shot (not the old 5.0 typical / 10.0 high).
      expect(lowAmt).toBe('2.0');
      expect(typAmt).toBe('2.5');
      expect(highAmt).toBe('5.0');
      expect(typAmt).not.toBe('5.0');
      expect(highAmt).not.toBe('10.0');
      expect(tbBlock).toMatch(/Twice weekly SC \(loading/);
      expect(tbBlock).toMatch(/community/i);
      expect(tbBlock).toMatch(/Not FDA-approved|no FDA-approved/i);

      const fixture = fixtures.find((f) => f.name === 'TB-500');
      expect(fixture?.profile).toBeDefined();
      expect(fixture!.profile!.dosingFrequency).toBe('TWICE_WEEKLY');
      expect(fixture!.profile!.cycleLengthWeeks).toBe(6);
      expect(fixture!.profile!.restPeriodWeeks).toBe(4);
      expect(fixture!.profile!.preferredTime).toBe('ANYTIME');
      expect(fixture!.profile!.timingNotes).toMatch(/community/i);
      expect(fixture!.profile!.timingNotes).toMatch(/2–2\.5 mg/);
      expect(fixture!.profile!.timingNotes).toMatch(/loading/i);
      expect(fixture!.profile!.timingNotes).toMatch(/Not FDA-approved/);

      const validation = validateDosingProtocol(fixture!.profile!);
      expect(validation.success, JSON.stringify(validation.error)).toBe(true);
    });

    it('should seed BPC-157 with research-peptide community dosing ranges and BID protocol', () => {
      // Catalog audience is DIY / research-peptide community: modal charts use ~250–500 mcg
      // SC 1–2× daily (often ~500 mcg/day, frequently split), 4–8 week on / 2–4 week off —
      // not 200 mcg low or an 8/4 cycle framed as clinical standard.
      const seedPath = path.join(__dirname, '../../prisma/seed.ts');
      const fixturePath = path.join(__dirname, '../../prisma/seed-data/dosing_fixtures.json');
      const seedSource = fs.readFileSync(seedPath, 'utf-8');
      const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as Array<{
        name: string;
        profile?: {
          cycleLengthWeeks: number | null;
          restPeriodWeeks: number | null;
          dosingFrequency: string;
          dosesPerDay: number | null;
          preferredTime: string | null;
          timingNotes: string;
        };
      }>;

      const bpcBlock = seedSource.slice(seedSource.indexOf("name: 'BPC-157'"), seedSource.indexOf("name: 'TB-500'"));
      const lowAmt = bpcBlock.match(/dosingLow:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const typAmt = bpcBlock.match(/dosingTypical:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const highAmt = bpcBlock.match(/dosingHigh:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      expect(lowAmt).toBe('250');
      expect(typAmt).toBe('500');
      expect(highAmt).toBe('1000');
      expect(lowAmt).not.toBe('200');
      expect(bpcBlock).toMatch(/1–2× daily SC/);
      expect(bpcBlock).toMatch(/community/i);
      expect(bpcBlock).toMatch(/Not FDA-approved/);

      const fixture = fixtures.find((f) => f.name === 'BPC-157');
      expect(fixture?.profile).toBeDefined();
      expect(fixture!.profile!.dosingFrequency).toBe('DAILY');
      expect(fixture!.profile!.dosesPerDay).toBe(2);
      expect(fixture!.profile!.cycleLengthWeeks).toBe(6);
      expect(fixture!.profile!.restPeriodWeeks).toBe(2);
      expect(fixture!.profile!.preferredTime).toBe('MORNING_AND_NIGHT');
      expect(fixture!.profile!.timingNotes).toMatch(/community/i);
      expect(fixture!.profile!.timingNotes).toMatch(/250–500 mcg/);
      expect(fixture!.profile!.timingNotes).toMatch(/Not FDA-approved/);

      const validation = validateDosingProtocol(fixture!.profile!);
      expect(validation.success, JSON.stringify(validation.error)).toBe(true);
    });

    it('should seed CJC-1295 No DAC / Ipamorelin with research-peptide community blend ranges', () => {
      // DIY / research-peptide audience: classic 100/100 mcg tiers with advanced high 300/300,
      // not the prior 150/150 high ceiling.
      const seedPath = path.join(__dirname, '../../prisma/seed.ts');
      const fixturePath = path.join(__dirname, '../../prisma/seed-data/dosing_fixtures.json');
      const seedSource = fs.readFileSync(seedPath, 'utf-8');
      const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as Array<{
        name: string;
        profile?: {
          cycleLengthWeeks: number | null;
          restPeriodWeeks: number | null;
          dosingFrequency: string;
          dosesPerDay: number | null;
          daysOn: number | null;
          daysOff: number | null;
          preferredTime: string | null;
          timingNotes: string;
        };
      }>;

      const blockStart = seedSource.indexOf("name: 'CJC-1295 No DAC / Ipamorelin'");
      const blockEnd = seedSource.indexOf("name: 'BPC-157 / TB-500'");
      expect(blockStart).toBeGreaterThan(-1);
      expect(blockEnd).toBeGreaterThan(blockStart);
      const comboBlock = seedSource.slice(blockStart, blockEnd);
      const lowAmt = comboBlock.match(/dosingLow:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const typAmt = comboBlock.match(/dosingTypical:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const highAmt = comboBlock.match(/dosingHigh:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      expect(lowAmt).toBe('100/100');
      expect(typAmt).toBe('100/100');
      expect(highAmt).toBe('300/300');
      expect(highAmt).not.toBe('150/150');
      expect(comboBlock).toMatch(/5 days on \/ 2 off/);

      const fixture = fixtures.find((f) => f.name === 'CJC-1295 No DAC / Ipamorelin');
      expect(fixture?.profile).toBeDefined();
      expect(fixture!.profile!.dosingFrequency).toBe('DAILY');
      expect(fixture!.profile!.dosesPerDay).toBe(2);
      expect(fixture!.profile!.daysOn).toBe(5);
      expect(fixture!.profile!.daysOff).toBe(2);
      expect(fixture!.profile!.cycleLengthWeeks).toBe(12);
      expect(fixture!.profile!.restPeriodWeeks).toBe(4);
      expect(fixture!.profile!.preferredTime).toBe('MORNING_AND_NIGHT');
      expect(fixture!.profile!.timingNotes).toMatch(/community/i);
      expect(fixture!.profile!.timingNotes).toContain(
        'Regimen is empirical and based on scientific literature, including preclinical studies and early clinical research. Not FDA-approved.',
      );

      const validation = validateDosingProtocol(fixture!.profile!);
      expect(validation.success, JSON.stringify(validation.error)).toBe(true);
    });

    it('should seed GHK-Cu with research-peptide community injectable dosing and 8/8 cycle', () => {
      // DIY audience: SubQ tiers stay in the 1–3 mg community band; protocol moves to
      // the commonly cited 8-week on / 8-week off injectable cycle (was 6/4).
      const seedPath = path.join(__dirname, '../../prisma/seed.ts');
      const fixturePath = path.join(__dirname, '../../prisma/seed-data/dosing_fixtures.json');
      const seedSource = fs.readFileSync(seedPath, 'utf-8');
      const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as Array<{
        name: string;
        profile?: {
          cycleLengthWeeks: number | null;
          restPeriodWeeks: number | null;
          dosingFrequency: string;
          dosesPerDay: number | null;
          preferredTime: string | null;
          timingNotes: string;
        };
      }>;

      const blockStart = seedSource.indexOf("name: 'GHK-Cu'");
      const blockEnd = seedSource.indexOf("name: 'Tesamorelin'");
      expect(blockStart).toBeGreaterThan(-1);
      expect(blockEnd).toBeGreaterThan(blockStart);
      const ghkBlock = seedSource.slice(blockStart, blockEnd);
      const lowAmt = ghkBlock.match(/dosingLow:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const typAmt = ghkBlock.match(/dosingTypical:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const highAmt = ghkBlock.match(/dosingHigh:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      expect(lowAmt).toBe('1.0');
      expect(typAmt).toBe('2.0');
      expect(highAmt).toBe('3.0');
      expect(ghkBlock).toMatch(/Once daily SubQ/);

      const fixture = fixtures.find((f) => f.name === 'GHK-Cu');
      expect(fixture?.profile).toBeDefined();
      expect(fixture!.profile!.dosingFrequency).toBe('DAILY');
      expect(fixture!.profile!.dosesPerDay).toBe(1);
      expect(fixture!.profile!.cycleLengthWeeks).toBe(8);
      expect(fixture!.profile!.restPeriodWeeks).toBe(8);
      expect(fixture!.profile!.preferredTime).toBe('MORNING');
      expect(fixture!.profile!.timingNotes).toMatch(/community/i);
      expect(fixture!.profile!.timingNotes).toMatch(/topical/i);
      expect(fixture!.profile!.timingNotes).toContain(
        'Regimen is empirical and based on scientific literature, including preclinical studies and early clinical research. Not FDA-approved.',
      );

      const validation = validateDosingProtocol(fixture!.profile!);
      expect(validation.success, JSON.stringify(validation.error)).toBe(true);
    });

    it('should seed Selank with research-peptide community multi-dose ranges and 5-on/2-off protocol', () => {
      // DIY audience: typical 300 mcg (Russian Selanc-style per-dose) 2–3× daily,
      // not a single morning-only 500 mcg snapshot; high 500 mcg not 1000 mcg per dose.
      const seedPath = path.join(__dirname, '../../prisma/seed.ts');
      const fixturePath = path.join(__dirname, '../../prisma/seed-data/dosing_fixtures.json');
      const seedSource = fs.readFileSync(seedPath, 'utf-8');
      const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as Array<{
        name: string;
        profile?: {
          cycleLengthWeeks: number | null;
          restPeriodWeeks: number | null;
          dosingFrequency: string;
          dosesPerDay: number | null;
          daysOn: number | null;
          daysOff: number | null;
          preferredTime: string | null;
          timingNotes: string;
        };
      }>;

      const blockStart = seedSource.indexOf("name: 'Selank'");
      const blockEnd = seedSource.indexOf("name: 'Sermorelin'");
      expect(blockStart).toBeGreaterThan(-1);
      expect(blockEnd).toBeGreaterThan(blockStart);
      const selankBlock = seedSource.slice(blockStart, blockEnd);
      const lowAmt = selankBlock.match(/dosingLow:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const typAmt = selankBlock.match(/dosingTypical:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const highAmt = selankBlock.match(/dosingHigh:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      expect(lowAmt).toBe('250');
      expect(typAmt).toBe('300');
      expect(highAmt).toBe('500');
      expect(highAmt).not.toBe('1000');
      expect(selankBlock).toMatch(/2–3× daily/);

      const fixture = fixtures.find((f) => f.name === 'Selank');
      expect(fixture?.profile).toBeDefined();
      expect(fixture!.profile!.dosingFrequency).toBe('DAILY');
      expect(fixture!.profile!.dosesPerDay).toBe(2);
      expect(fixture!.profile!.daysOn).toBe(5);
      expect(fixture!.profile!.daysOff).toBe(2);
      expect(fixture!.profile!.cycleLengthWeeks).toBe(4);
      expect(fixture!.profile!.restPeriodWeeks).toBe(4);
      expect(fixture!.profile!.preferredTime).toBe('MORNING_AND_NIGHT');
      expect(fixture!.profile!.timingNotes).toMatch(/community/i);
      expect(fixture!.profile!.timingNotes).toMatch(/Selanc|300 mcg|Russian/i);
      expect(fixture!.profile!.timingNotes).toContain(
        'Regimen is empirical and based on scientific literature, including preclinical studies and early clinical research. Not FDA-approved.',
      );

      const validation = validateDosingProtocol(fixture!.profile!);
      expect(validation.success, JSON.stringify(validation.error)).toBe(true);
    });

    it('should seed Semax with research-peptide community nasal dosing ranges and BID protocol', () => {
      // Catalog audience is DIY / research-peptide community: modal nootropic charts use
      // ~200–600 mcg intranasal (typical ~300 mcg) 1–2× daily on short cycles — not 900 mcg
      // three times daily framed as the Catalog high without community context.
      const seedPath = path.join(__dirname, '../../prisma/seed.ts');
      const fixturePath = path.join(__dirname, '../../prisma/seed-data/dosing_fixtures.json');
      const seedSource = fs.readFileSync(seedPath, 'utf-8');
      const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as Array<{
        name: string;
        profile?: {
          cycleLengthWeeks: number | null;
          restPeriodWeeks: number | null;
          dosingFrequency: string;
          dosesPerDay: number | null;
          preferredTime: string | null;
          timingNotes: string;
        };
      }>;

      // Anchor on the compound profile header (demo seed data also mentions NA-Semax earlier).
      const blockStart = seedSource.indexOf("name: 'Semax',\n      iupacName: null");
      const blockEnd = seedSource.indexOf("name: 'NA-Semax-Amidate',\n      iupacName:");
      expect(blockStart).toBeGreaterThan(-1);
      expect(blockEnd).toBeGreaterThan(blockStart);
      const semaxBlock = seedSource.slice(blockStart, blockEnd);
      const lowAmt = semaxBlock.match(/dosingLow:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const typAmt = semaxBlock.match(/dosingTypical:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const highAmt = semaxBlock.match(/dosingHigh:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      expect(lowAmt).toBe('100');
      expect(typAmt).toBe('300');
      expect(highAmt).toBe('600');
      expect(highAmt).not.toBe('900');
      expect(semaxBlock).toMatch(/1–2× daily nasal/);
      expect(semaxBlock).toMatch(/community/i);

      const fixture = fixtures.find((f) => f.name === 'Semax');
      expect(fixture?.profile).toBeDefined();
      expect(fixture!.profile!.dosingFrequency).toBe('DAILY');
      expect(fixture!.profile!.dosesPerDay).toBe(2);
      expect(fixture!.profile!.cycleLengthWeeks).toBe(2);
      expect(fixture!.profile!.restPeriodWeeks).toBe(2);
      expect(fixture!.profile!.preferredTime).toBe('ANYTIME');
      expect(fixture!.profile!.timingNotes).toMatch(/community/i);
      expect(fixture!.profile!.timingNotes).toMatch(/300 mcg/);
      expect(fixture!.profile!.timingNotes).toMatch(/Not FDA-approved/);

      const validation = validateDosingProtocol(fixture!.profile!);
      expect(validation.success, JSON.stringify(validation.error)).toBe(true);
    });
  });

  describe('Phase 2: Database CHECK Constraints (Negative Tests)', () => {
    const rawInsert = async (profileData: any) => {
      const id = '00000000-0000-0000-0000-000000000001';
      // Clean up previous test record if it exists
      await prisma.$executeRawUnsafe(`DELETE FROM "CompoundProfile" WHERE id = '${id}'`);

      const cols = ['id', 'catalogItemId', 'dosingLow', 'dosingTypical', 'dosingHigh'];
      const paramSlots = ['$1', '$2', '$3::jsonb', '$4::jsonb', '$5::jsonb'];
      const params: any[] = [
        id,
        testCompoundId,
        JSON.stringify(defaultDosing),
        JSON.stringify(defaultDosing),
        JSON.stringify(defaultDosing),
      ];

      let paramIndex = 6;
      for (const [key, value] of Object.entries(profileData)) {
        cols.push(key);
        if (key === 'dosingFrequency') {
          paramSlots.push(`$${paramIndex}::"DosingFrequency"`);
        } else if (key === 'preferredTime') {
          paramSlots.push(`$${paramIndex}::"PreferredTime"`);
        } else {
          paramSlots.push(`$${paramIndex}`);
        }
        params.push(value);
        paramIndex++;
      }

      const sql = `INSERT INTO "CompoundProfile" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${paramSlots.join(', ')})`;
      await prisma.$executeRawUnsafe(sql, ...params);
    };

    it('should trigger chk_cycle_length error for length > 104', async () => {
      await expect(rawInsert({ cycleLengthWeeks: 105 })).rejects.toThrow();
    });

    it('should trigger chk_rest_period error for rest > 104', async () => {
      await expect(rawInsert({ restPeriodWeeks: 105 })).rejects.toThrow();
    });

    it('should trigger chk_doses_per_day error for doses > 8', async () => {
      await expect(rawInsert({ dosesPerDay: 9 })).rejects.toThrow();
    });

    it('should trigger chk_daily_weekly_schedule error for DAILY invalid daysOn/daysOff', async () => {
      await expect(
        rawInsert({
          dosingFrequency: 'DAILY',
          daysOn: 7,
          daysOff: 0,
        })
      ).rejects.toThrow();

      await expect(
        rawInsert({
          dosingFrequency: 'DAILY',
          daysOn: 5,
          daysOff: 3,
        })
      ).rejects.toThrow();
    });

    it('should trigger chk_custom_frequency_desc error for missing custom description', async () => {
      await expect(
        rawInsert({
          dosingFrequency: 'CUSTOM',
          customFrequencyDescription: null,
        })
      ).rejects.toThrow();
    });

    it('should trigger chk_doses_per_day_time_alignment error for doses >= 2 with single/incorrect timing enums', async () => {
      await expect(
        rawInsert({
          dosesPerDay: 2,
          preferredTime: 'MORNING', // MORNING is a single dose time, not twice-daily composite
        })
      ).rejects.toThrow();

      await expect(
        rawInsert({
          dosesPerDay: 4,
          preferredTime: 'MORNING_AND_NIGHT', // Timing must be ANYTIME or AS_NEEDED for 4+ doses
        })
      ).rejects.toThrow();
    });

    it('should verify all custom CHECK constraints exist on CompoundProfile and are active', async () => {
      const constraints: any[] = await prisma.$queryRawUnsafe(`
        SELECT conname, pg_get_constraintdef(oid) as def
        FROM pg_catalog.pg_constraint
        WHERE conrelid = '"CompoundProfile"'::regclass AND conname LIKE 'chk_%'
      `);

      const constraintNames = constraints.map((c) => c.conname);
      expect(constraintNames).toContain('chk_cycle_length');
      expect(constraintNames).toContain('chk_rest_period');
      expect(constraintNames).toContain('chk_doses_per_day');
      expect(constraintNames).toContain('chk_daily_weekly_schedule');
      expect(constraintNames).toContain('chk_custom_frequency_desc');
      expect(constraintNames).toContain('chk_doses_per_day_time_alignment');

      // Verify semantic contents of the CHECK constraints by normalizing the definition string
      const normalize = (str: string) => str.toLowerCase().replace(/[\s\(\)'"]/g, '');

      const cycleLengthDef = constraints.find((c) => c.conname === 'chk_cycle_length')?.def || '';
      expect(normalize(cycleLengthDef)).toContain('cyclelengthweeks<=104');

      const dosesDef = constraints.find((c) => c.conname === 'chk_doses_per_day')?.def || '';
      expect(normalize(dosesDef)).toContain('dosesperday<=8');

      const weeklyDef = constraints.find((c) => c.conname === 'chk_daily_weekly_schedule')?.def || '';
      expect(normalize(weeklyDef)).toContain('dayson+daysoff=7');
    });
  });

  describe('Phase 3: Data Integrity & Provenance Citations', () => {
    it('should verify every seeded compound has at least one valid citation', async () => {
      const fixturePath = path.join(__dirname, '../../prisma/seed-data/dosing_fixtures.json');
      const rawData = fs.readFileSync(fixturePath, 'utf-8');
      const fixtures = JSON.parse(rawData);

      // Verify that for all seeded compounds, if they exist in the DB, they have citations
      for (const item of fixtures) {
        const compound = await prisma.catalogItem.findFirst({
          where: { name: item.name },
          include: {
            profile: true,
            citations: true,
          },
        });

        if (compound && compound.profile) {
          expect(compound.citations.length).toBeGreaterThanOrEqual(1);
          for (const citation of compound.citations) {
            expect(citation.title).toBeTruthy();
          }
        }
      }
    });

    it('should verify citation metadata consistency (PMID/DOI titles match expected strings)', () => {
      const fixturePath = path.join(__dirname, '../../prisma/seed-data/dosing_fixtures.json');
      const rawData = fs.readFileSync(fixturePath, 'utf-8');
      const fixtures = JSON.parse(rawData);

      // A map of known verified PMIDs to their expected keywords in the title
      const expectedPmidTitles: Record<string, string[]> = {
        '9404683': ['semax'],
        '37364590': ['cagrilintide', 'semaglutide'], // CagriSema Lancet study
        '9849822': ['ipamorelin', 'selective', 'growth', 'hormone'], // Ipamorelin study
      };

      for (const item of fixtures) {
        if (item.citations) {
          for (const cit of item.citations) {
            if (cit.pmid && expectedPmidTitles[cit.pmid]) {
              const expectedKeywords = expectedPmidTitles[cit.pmid];
              for (const keyword of expectedKeywords) {
                expect(cit.title.toLowerCase()).toContain(keyword.toLowerCase());
              }
            }
            // Ensure no citation uses the incorrect cleft lip PMID
            expect(cit.pmid).not.toBe('29322637');
          }
        }
      }
    });

    it('should ensure seed script is fully idempotent', async () => {
      // Execute the seeding command twice and verify citations and profiles are not duplicated
      // We run in child process to ensure we do not interfere with Prisma connections in vitest runner
      execSync('npx tsx prisma/seed.ts', { env: { ...process.env, BYPASS_PG_GUARD: 'true' } });

      const countBefore = await prisma.citation.count();
      const profileCountBefore = await prisma.compoundProfile.count();

      // Trigger seed again
      execSync('npx tsx prisma/seed.ts', { env: { ...process.env, BYPASS_PG_GUARD: 'true' } });

      const finalCount = await prisma.citation.count();
      const finalProfileCount = await prisma.compoundProfile.count();

      expect(finalCount).toBe(countBefore);
      expect(finalProfileCount).toBe(profileCountBefore);
    });

    it('should seed Tesamorelin with a 1.4 mg typical dose and continuous-daily as the default (5/2 surfaced only as a community convention)', async () => {
      const compound = await prisma.catalogItem.findFirst({
        where: { name: 'Tesamorelin' },
        include: { profile: true },
      });
      expect(compound).toBeTruthy();
      const profile = compound!.profile as any;
      expect(profile).toBeTruthy();

      // Dose-tier amounts: Low 1.0 / Typical 1.4 (current FDA on-label, Egrifta SV) / High 2.0 (original trial dose, documented ceiling)
      expect(profile.dosingLow.amount).toBe('1.0');
      expect(profile.dosingTypical.amount).toBe('1.4');
      expect(profile.dosingHigh.amount).toBe('2.0');

      // Continuous daily is the documented default — no tier should bake "5 days on / 2 days off" into its frequency label
      const lowFreq = String(profile.dosingLow.recommendedFrequency ?? '').toLowerCase();
      const typFreq = String(profile.dosingTypical.recommendedFrequency ?? '').toLowerCase();
      const highFreq = String(profile.dosingHigh.recommendedFrequency ?? '').toLowerCase();
      expect(lowFreq).not.toMatch(/5 days on/);
      expect(typFreq).not.toMatch(/5 days on/);
      expect(highFreq).not.toMatch(/5 days on/);
      expect(typFreq).toContain('daily');

      // Global protocol snapshot must read continuous daily (not a 5/2 schedule)
      expect(profile.dosingFrequency).toBe('DAILY');
      expect(profile.daysOn).toBeNull();
      expect(profile.daysOff).toBeNull();

      // The 5/2 pattern is surfaced only as an optional community convention in timing notes
      const notes = String(profile.timingNotes ?? '').toLowerCase();
      expect(notes).toContain('5 days on, 2 days off');
      expect(notes).toContain('community');
    });

    it('should seed SS-31 with community research-peptide tiers and 5-on/2-off cycled protocol in the DB', async () => {
      const compound = await prisma.catalogItem.findFirst({
        where: { name: 'SS-31' },
        include: { profile: true },
      });
      expect(compound).toBeTruthy();
      const profile = compound!.profile as any;
      expect(profile).toBeTruthy();

      expect(profile.dosingLow.amount).toBe('0.5');
      expect(profile.dosingTypical.amount).toBe('1');
      expect(profile.dosingHigh.amount).toBe('5');
      expect(profile.dosingLow.unit).toBe('mg');
      expect(profile.dosingTypical.unit).toBe('mg');
      expect(profile.dosingHigh.unit).toBe('mg');

      const typFreq = String(profile.dosingTypical.recommendedFrequency ?? '').toLowerCase();
      expect(typFreq).toMatch(/5 days on/);
      expect(typFreq).toMatch(/daily/);

      expect(profile.dosingFrequency).toBe('DAILY');
      expect(profile.daysOn).toBe(5);
      expect(profile.daysOff).toBe(2);
      expect(profile.cycleLengthWeeks).toBe(8);
      expect(profile.restPeriodWeeks).toBe(8);
      expect(profile.preferredTime).toBe('MORNING');
      expect(profile.isFdaApproved).toBe(false);

      const notes = String(profile.timingNotes ?? '');
      expect(notes.toLowerCase()).toContain('community');
      expect(notes).toContain('FORZINITY');
      expect(notes).toContain('40 mg');
      expect(notes).toContain(
        'Regimen is empirical and based on scientific literature, including preclinical studies and early clinical research. Not FDA-approved.',
      );
    });

    it('should seed MOTS-c with community research-peptide tiers and thrice-weekly cycled protocol in the DB', async () => {
      const compound = await prisma.catalogItem.findFirst({
        where: { name: 'MOTS-c' },
        include: { profile: true },
      });
      expect(compound).toBeTruthy();
      const profile = compound!.profile as any;
      expect(profile).toBeTruthy();

      expect(profile.dosingLow.amount).toBe('5.0');
      expect(profile.dosingTypical.amount).toBe('5.0');
      expect(profile.dosingHigh.amount).toBe('10.0');
      expect(profile.dosingLow.unit).toBe('mg');
      expect(profile.dosingTypical.unit).toBe('mg');
      expect(profile.dosingHigh.unit).toBe('mg');

      const typFreq = String(profile.dosingTypical.recommendedFrequency ?? '').toLowerCase();
      expect(typFreq).toMatch(/2/);
      expect(typFreq).toMatch(/3/);
      expect(typFreq).toMatch(/week/);

      expect(profile.dosingFrequency).toBe('THRICE_WEEKLY');
      expect(profile.cycleLengthWeeks).toBe(6);
      expect(profile.restPeriodWeeks).toBe(4);
      expect(profile.preferredTime).toBe('MORNING');
      expect(profile.isFdaApproved).toBe(false);

      const notes = String(profile.timingNotes ?? '');
      expect(notes.toLowerCase()).toContain('community');
      expect(notes).toContain('5 mg');
      expect(notes).toContain(
        'Regimen is empirical and based on scientific literature, including preclinical studies and early clinical research. Not FDA-approved.',
      );
    });

    it('should seed TB-500 with community research-peptide tiers and twice-weekly cycled protocol in the DB', async () => {
      const compound = await prisma.catalogItem.findFirst({
        where: { name: 'TB-500' },
        include: { profile: true },
      });
      expect(compound).toBeTruthy();
      const profile = compound!.profile as any;
      expect(profile).toBeTruthy();

      expect(profile.dosingLow.amount).toBe('2.0');
      expect(profile.dosingTypical.amount).toBe('2.5');
      expect(profile.dosingHigh.amount).toBe('5.0');
      expect(profile.dosingLow.unit).toBe('mg');
      expect(profile.dosingTypical.unit).toBe('mg');
      expect(profile.dosingHigh.unit).toBe('mg');

      const typFreq = String(profile.dosingTypical.recommendedFrequency ?? '').toLowerCase();
      expect(typFreq).toMatch(/twice weekly|2× weekly|2x weekly/);
      expect(typFreq).toMatch(/loading/);

      expect(profile.dosingFrequency).toBe('TWICE_WEEKLY');
      expect(profile.cycleLengthWeeks).toBe(6);
      expect(profile.restPeriodWeeks).toBe(4);
      expect(profile.preferredTime).toBe('ANYTIME');
      expect(profile.isFdaApproved).toBe(false);

      const notes = String(profile.timingNotes ?? '');
      expect(notes.toLowerCase()).toContain('community');
      expect(notes).toMatch(/2–2\.5 mg/);
      expect(notes.toLowerCase()).toContain('loading');
      expect(notes).toContain(
        'Regimen is empirical and based on scientific literature, including preclinical studies and early clinical research. Not FDA-approved.',
      );
    });

    it('should seed CJC-1295 No DAC / Ipamorelin with community blend tiers in the DB', async () => {
      const compound = await prisma.catalogItem.findFirst({
        where: { name: 'CJC-1295 No DAC / Ipamorelin' },
        include: { profile: true },
      });
      expect(compound).toBeTruthy();
      const profile = compound!.profile as any;
      expect(profile).toBeTruthy();

      expect(profile.dosingLow.amount).toBe('100/100');
      expect(profile.dosingTypical.amount).toBe('100/100');
      expect(profile.dosingHigh.amount).toBe('300/300');
      expect(profile.dosingLow.unit).toBe('mcg');
      expect(profile.dosingTypical.unit).toBe('mcg');
      expect(profile.dosingHigh.unit).toBe('mcg');

      const typFreq = String(profile.dosingTypical.recommendedFrequency ?? '').toLowerCase();
      expect(typFreq).toMatch(/twice daily|2/);
      expect(typFreq).toMatch(/5 days on/);

      expect(profile.dosingFrequency).toBe('DAILY');
      expect(profile.dosesPerDay).toBe(2);
      expect(profile.daysOn).toBe(5);
      expect(profile.daysOff).toBe(2);
      expect(profile.cycleLengthWeeks).toBe(12);
      expect(profile.restPeriodWeeks).toBe(4);
      expect(profile.preferredTime).toBe('MORNING_AND_NIGHT');
      expect(profile.isFdaApproved).toBe(false);

      const notes = String(profile.timingNotes ?? '');
      expect(notes.toLowerCase()).toContain('community');
      expect(notes).toContain(
        'Regimen is empirical and based on scientific literature, including preclinical studies and early clinical research. Not FDA-approved.',
      );
    });

    it('should seed GHK-Cu with community injectable tiers and 8/8 protocol in the DB', async () => {
      const compound = await prisma.catalogItem.findFirst({
        where: { name: 'GHK-Cu' },
        include: { profile: true },
      });
      expect(compound).toBeTruthy();
      const profile = compound!.profile as any;
      expect(profile).toBeTruthy();

      expect(profile.dosingLow.amount).toBe('1.0');
      expect(profile.dosingTypical.amount).toBe('2.0');
      expect(profile.dosingHigh.amount).toBe('3.0');
      expect(profile.dosingLow.unit).toBe('mg');
      expect(profile.dosingFrequency).toBe('DAILY');
      expect(profile.dosesPerDay).toBe(1);
      expect(profile.cycleLengthWeeks).toBe(8);
      expect(profile.restPeriodWeeks).toBe(8);
      expect(profile.preferredTime).toBe('MORNING');
      expect(profile.isFdaApproved).toBe(false);
      expect(String(profile.timingNotes).toLowerCase()).toContain('community');
      expect(String(profile.timingNotes).toLowerCase()).toContain('topical');
      expect(String(profile.dosingTypical.recommendedFrequency).toLowerCase()).toMatch(/daily/);
    });

    it('should seed Semax with community research-peptide nasal tiers and 2/2 BID protocol in the DB', async () => {
      const compound = await prisma.catalogItem.findFirst({
        where: { name: 'Semax' },
        include: { profile: true },
      });
      expect(compound).toBeTruthy();
      const profile = compound!.profile as any;
      expect(profile).toBeTruthy();

      expect(profile.dosingLow.amount).toBe('100');
      expect(profile.dosingTypical.amount).toBe('300');
      expect(profile.dosingHigh.amount).toBe('600');
      expect(profile.dosingLow.unit).toBe('mcg');
      expect(profile.dosingTypical.unit).toBe('mcg');
      expect(profile.dosingHigh.unit).toBe('mcg');

      const typFreq = String(profile.dosingTypical.recommendedFrequency ?? '').toLowerCase();
      expect(typFreq).toMatch(/1|2|daily|nasal/);

      expect(profile.dosingFrequency).toBe('DAILY');
      expect(profile.dosesPerDay).toBe(2);
      expect(profile.cycleLengthWeeks).toBe(2);
      expect(profile.restPeriodWeeks).toBe(2);
      expect(profile.preferredTime).toBe('ANYTIME');
      expect(profile.isFdaApproved).toBe(false);

      const notes = String(profile.timingNotes ?? '');
      expect(notes.toLowerCase()).toContain('community');
      expect(notes).toMatch(/300 mcg/);
      expect(notes).toContain(
        'Regimen is empirical and based on scientific literature, including preclinical studies and early clinical research. Not FDA-approved.',
      );
    });

    it('should seed Selank with community multi-dose tiers and 5-on/2-off protocol in the DB', async () => {
      const compound = await prisma.catalogItem.findFirst({
        where: { name: 'Selank' },
        include: { profile: true },
      });
      expect(compound).toBeTruthy();
      const profile = compound!.profile as any;
      expect(profile).toBeTruthy();

      expect(profile.dosingLow.amount).toBe('250');
      expect(profile.dosingTypical.amount).toBe('300');
      expect(profile.dosingHigh.amount).toBe('500');
      expect(profile.dosingLow.unit).toBe('mcg');
      expect(profile.dosingTypical.unit).toBe('mcg');
      expect(profile.dosingHigh.unit).toBe('mcg');

      const typFreq = String(profile.dosingTypical.recommendedFrequency ?? '').toLowerCase();
      expect(typFreq).toMatch(/2|3|daily/);

      expect(profile.dosingFrequency).toBe('DAILY');
      expect(profile.dosesPerDay).toBe(2);
      expect(profile.daysOn).toBe(5);
      expect(profile.daysOff).toBe(2);
      expect(profile.cycleLengthWeeks).toBe(4);
      expect(profile.restPeriodWeeks).toBe(4);
      expect(profile.preferredTime).toBe('MORNING_AND_NIGHT');
      expect(profile.isFdaApproved).toBe(false);

      const notes = String(profile.timingNotes ?? '');
      expect(notes.toLowerCase()).toContain('community');
      expect(notes).toMatch(/Selanc|300 mcg|Russian/i);
      expect(notes).toContain(
        'Regimen is empirical and based on scientific literature, including preclinical studies and early clinical research. Not FDA-approved.',
      );
    });
  });

  describe('Phase 4: UI Fallbacks & Disclaimer Conditional Rendering', () => {
    it('should render FDA approved continuous compound with no disclaimer and custom notes', async () => {
      const mockCompound = {
        id: 'comp-1',
        name: 'Tesamorelin',
        slug: 'tesamorelin',
        iupacName: 'Some IUPAC',
        synonyms: [],
        status: 'PUBLISHED',
        tags: [],
        administrationRoutes: ['SubQ'],
        profile: {
          id: 'prof-1',
          catalogItemId: 'comp-1',
          dosingLow: { amount: '1', unit: 'mg' },
          dosingTypical: { amount: '2', unit: 'mg' },
          dosingHigh: { amount: '2', unit: 'mg' },
          fridgeShelfLifeMonths: 12,
          freezerShelfLifeMonths: 24,
          cycleLengthWeeks: null,
          cycleRationale: null,
          restPeriodWeeks: null,
          restPeriodRationale: null,
          dosingFrequency: 'DAILY',
          dosesPerDay: 1,
          customFrequencyDescription: null,
          daysOn: null,
          daysOff: null,
          preferredTime: 'MORNING',
          timingNotes: 'Inject subcutaneously once daily into the abdomen',
          isFdaApproved: true,
          citations: [],
          benefitTimeline: [],
        },
        citations: [],
      };
      mockGetCompoundBySlug.mockResolvedValue(mockCompound);

      const component = await CompoundProfilePage({ params: Promise.resolve({ slug: 'tesamorelin' }) });
      const html = renderToString(component);

      // Verify header and components
      expect(html).toContain('Protocol Snapshot');
      expect(html).toContain('Continuous');
      expect(html).toContain('Daily');
      expect(html).toContain('Inject subcutaneously once daily into the abdomen');
      // FDA approved -> disclaimer should NOT be rendered
      expect(html).not.toContain('DISCLAIMER: This compound is not FDA-approved');
    });

    it('should render non-FDA compound with disclaimer and cycle info', async () => {
      const mockCompound = {
        id: 'comp-2',
        name: 'BPC-157',
        slug: 'bpc-157',
        iupacName: null,
        synonyms: [],
        status: 'PUBLISHED',
        tags: [],
        administrationRoutes: ['SubQ'],
        profile: {
          id: 'prof-2',
          catalogItemId: 'comp-2',
          dosingLow: { amount: '250', unit: 'mcg' },
          dosingTypical: { amount: '500', unit: 'mcg' },
          dosingHigh: { amount: '1000', unit: 'mcg' },
          fridgeShelfLifeMonths: 12,
          freezerShelfLifeMonths: 24,
          cycleLengthWeeks: 8,
          cycleRationale: 'Test cycle rationale text',
          restPeriodWeeks: 4,
          restPeriodRationale: 'Test rest period rationale text',
          dosingFrequency: 'DAILY',
          dosesPerDay: 2,
          customFrequencyDescription: null,
          daysOn: 5,
          daysOff: 2,
          preferredTime: 'MORNING_AND_NIGHT',
          timingNotes: 'Take on an empty stomach',
          isFdaApproved: false,
          citations: [],
          benefitTimeline: [],
        },
        citations: [],
      };
      mockGetCompoundBySlug.mockResolvedValue(mockCompound);

      const component = await CompoundProfilePage({ params: Promise.resolve({ slug: 'bpc-157' }) });
      const html = renderToString(component);

      expect(html).toContain('8 Weeks');
      expect(html).toContain('4 Weeks Washout');
      expect(html).toContain('Test cycle rationale text');
      expect(html).toContain('Test rest period rationale text');
      expect(html).toContain('5 Days On / 2 Off');
      expect(html).toContain('Morning and Night');
      expect(html).toContain('Take on an empty stomach');
      // Non-FDA approved -> disclaimer MUST be rendered
      expect(html).toContain('DISCLAIMER:');
      expect(html).toContain('This compound is not FDA-approved');
    });

    it('should render custom frequency descriptions and fallbacks for empty scheduling fields', async () => {
      const mockCompound = {
        id: 'comp-3',
        name: 'GLOW50',
        slug: 'glow50',
        iupacName: null,
        synonyms: [],
        status: 'PUBLISHED',
        tags: [],
        administrationRoutes: ['Topical'],
        profile: {
          id: 'prof-3',
          catalogItemId: 'comp-3',
          dosingLow: { amount: '1', unit: 'mg' },
          dosingTypical: { amount: '2', unit: 'mg' },
          dosingHigh: { amount: '4', unit: 'mg' },
          fridgeShelfLifeMonths: 12,
          freezerShelfLifeMonths: 24,
          cycleLengthWeeks: null,
          cycleRationale: null,
          restPeriodWeeks: null,
          restPeriodRationale: null,
          dosingFrequency: 'CUSTOM',
          dosesPerDay: null,
          customFrequencyDescription: 'Apply topically once or twice daily',
          daysOn: null,
          daysOff: null,
          preferredTime: null,
          timingNotes: null,
          isFdaApproved: false,
          citations: [],
          benefitTimeline: [],
        },
        citations: [],
      };
      mockGetCompoundBySlug.mockResolvedValue(mockCompound);

      const component = await CompoundProfilePage({ params: Promise.resolve({ slug: 'glow50' }) });
      const html = renderToString(component);

      expect(html).toContain('Continuous'); // cycle fallback
      expect(html).toContain('Apply topically once or twice daily'); // custom frequency
      expect(html).toContain('N/A'); // rest period and admin fallback
      expect(html).not.toContain('Timing Protocol'); // no timing notes -> hidden
    });
  });
});
