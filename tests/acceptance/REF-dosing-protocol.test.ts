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

    it('should seed KPV with research-peptide community dosing ranges and daily cycled protocol', () => {
      // Catalog audience is DIY / research-peptide community: modal charts use 200–500 mcg
      // daily SC or oral (high ~1,000 mcg), 4–8 week blocks — not MC3/4 melanocortin cycle
      // rationales or a 4-week-only on-cycle framed as the full standard.
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
          cycleRationale?: string | null;
          restPeriodRationale?: string | null;
        };
      }>;

      const kpvBlock = seedSource.slice(seedSource.indexOf("name: 'KPV'"), seedSource.indexOf("name: 'ARA-290'"));
      const lowAmt = kpvBlock.match(/dosingLow:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const typAmt = kpvBlock.match(/dosingTypical:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const highAmt = kpvBlock.match(/dosingHigh:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      // Community modal is 200 / 500 / 1000 mcg daily research-planning band.
      expect(lowAmt).toBe('200');
      expect(typAmt).toBe('500');
      expect(highAmt).toBe('1000');
      expect(kpvBlock).toMatch(/Once daily SC or oral/);
      expect(kpvBlock).toMatch(/community/i);
      expect(kpvBlock).toMatch(/PepT1|NF-κB|NF-kB/i);

      const fixture = fixtures.find((f) => f.name === 'KPV');
      expect(fixture?.profile).toBeDefined();
      expect(fixture!.profile!.dosingFrequency).toBe('DAILY');
      expect(fixture!.profile!.cycleLengthWeeks).toBe(8);
      expect(fixture!.profile!.restPeriodWeeks).toBe(4);
      expect(fixture!.profile!.preferredTime).toBe('MORNING');
      expect(fixture!.profile!.timingNotes).toMatch(/community/i);
      expect(fixture!.profile!.timingNotes).toMatch(/200–500 mcg|200-500 mcg/);
      expect(fixture!.profile!.timingNotes).toMatch(/Not FDA-approved/);
      // Must not teach incorrect melanocortin MC3/4 cycle rationales.
      expect(fixture!.profile!.cycleRationale ?? '').not.toMatch(/MC3|MC4|melanocortin receptor/i);
      expect(fixture!.profile!.restPeriodRationale ?? '').not.toMatch(/melanocortin receptor/i);

      const validation = validateDosingProtocol(fixture!.profile!);
      expect(validation.success, JSON.stringify(validation.error)).toBe(true);
    });

    it('should seed NAD+ with research-peptide community SubQ dosing ranges and thrice-weekly protocol', () => {
      // Catalog audience is DIY / research-peptide community SubQ: modal charts use ~50–100 mg
      // SC 2–3× weekly (start ~25 mg), not daily/EOD as Typical and not IV 250–1000 mg sessions
      // as home SubQ guidance.
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
          restPeriodRationale?: string | null;
        };
      }>;

      const nadBlock = seedSource.slice(seedSource.indexOf("name: 'NAD+'"), seedSource.indexOf("name: 'Oxytocin'"));
      const lowAmt = nadBlock.match(/dosingLow:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const typAmt = nadBlock.match(/dosingTypical:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const highAmt = nadBlock.match(/dosingHigh:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      expect(lowAmt).toBe('25');
      expect(typAmt).toBe('50');
      expect(highAmt).toBe('100');
      expect(nadBlock).toMatch(/2–3× weekly SC/);
      expect(nadBlock).not.toMatch(/recommendedFrequency: 'Daily or every other day'/);
      expect(nadBlock).not.toMatch(/recommendedFrequency: 'Once daily'/);
      expect(nadBlock).toMatch(/community/i);

      const fixture = fixtures.find((f) => f.name === 'NAD+');
      expect(fixture?.profile).toBeDefined();
      expect(fixture!.profile!.dosingFrequency).toBe('THRICE_WEEKLY');
      expect(fixture!.profile!.preferredTime).toBe('MORNING');
      expect(fixture!.profile!.timingNotes).toMatch(/community/i);
      expect(fixture!.profile!.timingNotes).toMatch(/50–100 mg|50-100 mg|50 mg/);
      expect(fixture!.profile!.timingNotes).toMatch(/SubQ|subcutaneous/i);
      expect(fixture!.profile!.timingNotes).toMatch(/IV/);
      expect(fixture!.profile!.timingNotes).toMatch(/Not FDA-approved/);
      expect(fixture!.profile!.restPeriodRationale ?? '').not.toMatch(/safe and beneficial/i);

      const validation = validateDosingProtocol(fixture!.profile!);
      expect(validation.success, JSON.stringify(validation.error)).toBe(true);
    });

    it('should seed DSIP with research-peptide community dosing ranges and nightly protocol', () => {
      // Catalog audience is DIY / research-peptide community: modal SC charts use ~100–300 mcg
      // nightly before bed (planning mid ~250; high ~500), cycled ~4 on / 4 off — not a 2-week
      // on-block framed as clinical standard, and not historical IV 25 nmol/kg as typical.
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

      const dsipBlock = seedSource.slice(seedSource.indexOf("name: 'DSIP'"), seedSource.indexOf("name: 'Hexarelin'"));
      const lowAmt = dsipBlock.match(/dosingLow:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const typAmt = dsipBlock.match(/dosingTypical:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const highAmt = dsipBlock.match(/dosingHigh:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      expect(lowAmt).toBe('100');
      expect(typAmt).toBe('250');
      expect(highAmt).toBe('500');
      expect(dsipBlock).toMatch(/Nightly SC/);
      expect(dsipBlock).toMatch(/community/i);
      expect(dsipBlock).toMatch(/Not FDA-approved/);

      const fixture = fixtures.find((f) => f.name === 'DSIP');
      expect(fixture?.profile).toBeDefined();
      expect(fixture!.profile!.dosingFrequency).toBe('DAILY');
      expect(fixture!.profile!.dosesPerDay).toBe(1);
      expect(fixture!.profile!.cycleLengthWeeks).toBe(4);
      expect(fixture!.profile!.restPeriodWeeks).toBe(4);
      expect(fixture!.profile!.preferredTime).toBe('NIGHT');
      expect(fixture!.profile!.timingNotes).toMatch(/community/i);
      expect(fixture!.profile!.timingNotes).toMatch(/100–300 mcg/);
      expect(fixture!.profile!.timingNotes).toMatch(/Not FDA-approved/);
      expect(fixture!.profile!.cycleLengthWeeks).not.toBe(2);

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

    it('should seed Retatrutide with research-peptide community weekly titration ranges', () => {
      // DIY charts track trial ladders: start ~2 mg, mid-high maintenance ~8 mg, max ~12 mg
      // weekly continuous (not the old 4 mg typical as “standard”).
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

      const blockStart = seedSource.indexOf("name: 'Retatrutide'");
      const blockEnd = seedSource.indexOf("name: 'Thymosin Alpha-1'");
      expect(blockStart).toBeGreaterThan(-1);
      expect(blockEnd).toBeGreaterThan(blockStart);
      const retaBlock = seedSource.slice(blockStart, blockEnd);
      const lowAmt = retaBlock.match(/dosingLow:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const typAmt = retaBlock.match(/dosingTypical:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const highAmt = retaBlock.match(/dosingHigh:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      expect(lowAmt).toBe('2.0');
      expect(typAmt).toBe('8.0');
      expect(highAmt).toBe('12.0');
      expect(typAmt).not.toBe('4.0');
      expect(retaBlock).toMatch(/Once weekly SubQ/);

      const fixture = fixtures.find((f) => f.name === 'Retatrutide');
      expect(fixture?.profile).toBeDefined();
      expect(fixture!.profile!.dosingFrequency).toBe('WEEKLY');
      expect(fixture!.profile!.dosesPerDay).toBe(1);
      expect(fixture!.profile!.cycleLengthWeeks).toBeNull();
      expect(fixture!.profile!.restPeriodWeeks).toBeNull();
      expect(fixture!.profile!.preferredTime).toBe('ANYTIME');
      expect(fixture!.profile!.timingNotes).toMatch(/community|DIY|research-peptide/i);
      expect(fixture!.profile!.timingNotes).toMatch(/2.*4.*8.*12|titrat/i);
      expect(fixture!.profile!.timingNotes).toContain(
        'Regimen is empirical and based on scientific literature, including preclinical studies and early clinical research. Not FDA-approved.',
      );

      const validation = validateDosingProtocol(fixture!.profile!);
      expect(validation.success, JSON.stringify(validation.error)).toBe(true);
    });

    it('should seed Pinealon with research-peptide community mcg dosing and short bioregulator cycle', () => {
      // DIY modal band: ~200–1000 mcg once daily for 10–20 days, multi-month rest.
      // Not FDA-approved; clinic multi-mg charts are minority, not Typical.
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
          isFdaApproved?: boolean;
          cycleRationale?: string;
          restPeriodRationale?: string;
        };
        citations?: Array<{ title: string; doi?: string | null; pmid?: string | null }>;
      }>;

      const blockStart = seedSource.indexOf("name: 'Pinealon'");
      const blockEnd = seedSource.indexOf("name: 'MOTS-c'");
      expect(blockStart).toBeGreaterThan(-1);
      expect(blockEnd).toBeGreaterThan(blockStart);
      const pinealonBlock = seedSource.slice(blockStart, blockEnd);
      const lowAmt = pinealonBlock.match(/dosingLow:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const typAmt = pinealonBlock.match(/dosingTypical:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const highAmt = pinealonBlock.match(/dosingHigh:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      expect(lowAmt).toBe('200');
      expect(typAmt).toBe('500');
      expect(highAmt).toBe('1000');
      expect(pinealonBlock).toMatch(/unit: 'mcg'/);
      expect(pinealonBlock).toMatch(/### The Technical Mechanism/);
      expect(pinealonBlock).toMatch(/### The Analogy/);
      expect(pinealonBlock).toMatch(/### Clinical Expected Timeline/);
      expect(pinealonBlock).toMatch(/Glu-Asp-Arg|EDR/);
      expect(pinealonBlock).toMatch(/community/i);
      expect(pinealonBlock).toMatch(/33396470/);
      expect(pinealonBlock).toMatch(/sideEffects:/);
      expect(pinealonBlock).toMatch(/stackingNotes:/);
      expect(pinealonBlock).toMatch(/reconstitutedShelfLifeDays: 28/);

      const fixture = fixtures.find((f) => f.name === 'Pinealon');
      expect(fixture?.profile).toBeDefined();
      expect(fixture!.profile!.dosingFrequency).toBe('DAILY');
      expect(fixture!.profile!.dosesPerDay).toBe(1);
      expect(fixture!.profile!.cycleLengthWeeks).toBe(2);
      expect(fixture!.profile!.restPeriodWeeks).toBe(10);
      expect(fixture!.profile!.preferredTime).toBe('MORNING');
      expect(fixture!.profile!.isFdaApproved).toBe(false);
      expect(fixture!.profile!.timingNotes).toMatch(/community|DIY|research-peptide/i);
      expect(fixture!.profile!.timingNotes).toMatch(/200|500|1000|1 mg/i);
      expect(fixture!.profile!.timingNotes).toMatch(/Not FDA-approved/);
      expect(fixture!.profile!.cycleRationale).toBeTruthy();
      expect(fixture!.profile!.restPeriodRationale).toBeTruthy();
      expect(fixture!.citations?.length).toBeGreaterThanOrEqual(1);
      expect(fixture!.citations?.some((c) => c.pmid === '33396470')).toBe(true);

      const validation = validateDosingProtocol(fixture!.profile!);
      expect(validation.success, JSON.stringify(validation.error)).toBe(true);
    });

    it('should seed ARA-290 with research-peptide community SC dosing ranges and 4/8 daily protocol', () => {
      // DIY audience mirrors Phase 2 fixed SC mg charts: 2 / 4 / 8 mg once daily with
      // modal 4 mg × ~28 days; high 8 mg is an upper trial arm, not a default “severe” dose.
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

      const blockStart = seedSource.indexOf("name: 'ARA-290'");
      const blockEnd = seedSource.indexOf("name: 'Cagrilintide/Semaglutide'");
      expect(blockStart).toBeGreaterThan(-1);
      expect(blockEnd).toBeGreaterThan(blockStart);
      const araBlock = seedSource.slice(blockStart, blockEnd);
      const lowAmt = araBlock.match(/dosingLow:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const typAmt = araBlock.match(/dosingTypical:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const highAmt = araBlock.match(/dosingHigh:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      expect(lowAmt).toBe('2.0');
      expect(typAmt).toBe('4.0');
      expect(highAmt).toBe('8.0');
      expect(araBlock).toMatch(/Once daily SC/);
      expect(araBlock).toMatch(/community|Phase 2|trial/i);
      expect(araBlock).toMatch(/no clear superiority|not a default/i);

      const fixture = fixtures.find((f) => f.name === 'ARA-290');
      expect(fixture?.profile).toBeDefined();
      expect(fixture!.profile!.dosingFrequency).toBe('DAILY');
      expect(fixture!.profile!.dosesPerDay).toBe(1);
      expect(fixture!.profile!.cycleLengthWeeks).toBe(4);
      expect(fixture!.profile!.restPeriodWeeks).toBe(8);
      expect(fixture!.profile!.preferredTime).toBe('MORNING');
      expect(fixture!.profile!.timingNotes).toMatch(/community/i);
      expect(fixture!.profile!.timingNotes).toMatch(/4 mg/);
      expect(fixture!.profile!.timingNotes).toMatch(/28 days|4-week/i);
      expect(fixture!.profile!.timingNotes).toMatch(/Not FDA-approved/);

      const validation = validateDosingProtocol(fixture!.profile!);
      expect(validation.success, JSON.stringify(validation.error)).toBe(true);
    });

    it('should seed PT-141 with label 1.75 mg typical, community start/high, and as-needed FDA-aware protocol', () => {
      // Vyleesi label: 1.75 mg SC as-needed for premenopausal HSDD (max 1/24h, 8/month).
      // Community charts start lower (~0.5 mg) and sometimes cite ~2 mg high — separate from label.
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
          isFdaApproved?: boolean;
          cycleRationale?: string | null;
          restPeriodRationale?: string | null;
        };
        citations?: Array<{ title: string; doi?: string; pmid?: string }>;
      }>;

      const blockStart = seedSource.indexOf("name: 'PT-141'");
      const blockEnd = seedSource.indexOf('const fixturesPath');
      expect(blockStart).toBeGreaterThan(-1);
      expect(blockEnd).toBeGreaterThan(blockStart);
      const ptBlock = seedSource.slice(blockStart, blockEnd);

      const lowAmt = ptBlock.match(/dosingLow:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const typAmt = ptBlock.match(/dosingTypical:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const highAmt = ptBlock.match(/dosingHigh:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      expect(lowAmt).toBe('0.5');
      expect(typAmt).toBe('1.75');
      expect(highAmt).toBe('2');

      expect(ptBlock).toMatch(/### The Technical Mechanism/);
      expect(ptBlock).toMatch(/### The Analogy/);
      expect(ptBlock).toMatch(/### Clinical Expected Timeline/);
      expect(ptBlock).toMatch(/Bremelanotide|Vyleesi/i);
      expect(ptBlock).toMatch(/MC4R|melanocortin/i);
      expect(ptBlock).toMatch(/sideEffects:/);
      expect(ptBlock).toMatch(/stackingNotes:/);
      expect(ptBlock).toMatch(/reconstitutedShelfLifeDays:\s*30/);
      expect(ptBlock).toMatch(/pmid: '31599840'|pmid: '12851303'|pmid: '33455598'/);
      // Clinical vs community separation — do not invent a male/ED label indication
      expect(ptBlock).toMatch(/HSDD/);
      expect(ptBlock).toMatch(/off-label|Not an FDA-authorized|not FDA-approved/i);
      expect(ptBlock).toMatch(/community|Research-peptide|DIY/i);

      const fixture = fixtures.find((f) => f.name === 'PT-141');
      expect(fixture?.profile).toBeDefined();
      expect(fixture!.profile!.dosingFrequency).toBe('AS_NEEDED');
      expect(fixture!.profile!.preferredTime).toBe('AS_NEEDED');
      expect(fixture!.profile!.dosesPerDay).toBe(1);
      expect(fixture!.profile!.cycleLengthWeeks).toBeNull();
      expect(fixture!.profile!.restPeriodWeeks).toBeNull();
      expect(fixture!.profile!.isFdaApproved).toBe(true);
      expect(fixture!.profile!.timingNotes).toMatch(/1\.75 mg/);
      expect(fixture!.profile!.timingNotes).toMatch(/45 minutes|45 min/i);
      expect(fixture!.profile!.timingNotes).toMatch(/8 doses per month|8\/month/i);
      expect(fixture!.profile!.timingNotes).toMatch(/HSDD/);
      expect(fixture!.profile!.timingNotes).toMatch(/community|DIY|research-peptide/i);
      expect(fixture!.profile!.timingNotes).toMatch(/premenopausal|women/i);
      // FDA-approved compounds must not carry the generic non-FDA disclaimer string
      expect(fixture!.profile!.timingNotes).not.toContain(
        'Regimen is empirical and based on scientific literature, including preclinical studies and early clinical research. Not FDA-approved.',
      );
      expect(fixture!.profile!.cycleRationale).toMatch(/as-needed|as needed/i);
      expect(fixture!.profile!.restPeriodRationale).toMatch(/8 doses|24 h|hyperpigmentation/i);
      expect(fixture!.citations?.length).toBeGreaterThanOrEqual(2);
      expect(fixture!.citations?.some((c) => c.pmid === '31599840' || c.doi?.includes('3500'))).toBe(true);

      const validation = validateDosingProtocol(fixture!.profile!);
      expect(validation.success, JSON.stringify(validation.error)).toBe(true);
    });

    it('should seed Testosterone Cypionate with label TRT vs community weekly ranges and FDA-aware protocol', () => {
      // Label: 50–400 mg deep IM every 2–4 weeks for confirmed hypogonadism.
      // Clinic/DIY modal: ~100–200 mg/week (often split 2×/week); 50/100/200 weekly tiers.
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
          isFdaApproved?: boolean;
          cycleRationale?: string | null;
          restPeriodRationale?: string | null;
        };
        citations?: Array<{ title: string; doi?: string; pmid?: string; url?: string }>;
      }>;

      const blockStart = seedSource.indexOf("name: 'Testosterone Cypionate'");
      const blockEnd = seedSource.indexOf("name: 'Testosterone Propionate'");
      expect(blockStart).toBeGreaterThan(-1);
      expect(blockEnd).toBeGreaterThan(blockStart);
      const tcBlock = seedSource.slice(blockStart, blockEnd);

      const lowAmt = tcBlock.match(/dosingLow:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const typAmt = tcBlock.match(/dosingTypical:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const highAmt = tcBlock.match(/dosingHigh:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      expect(lowAmt).toBe('50');
      expect(typAmt).toBe('100');
      expect(highAmt).toBe('200');

      expect(tcBlock).toMatch(/### The Technical Mechanism/);
      expect(tcBlock).toMatch(/### The Analogy/);
      expect(tcBlock).toMatch(/### Clinical Expected Timeline/);
      expect(tcBlock).toMatch(/Depo-Testosterone|cypionate/i);
      expect(tcBlock).toMatch(/hypogonadism/i);
      expect(tcBlock).toMatch(/sideEffects:/);
      expect(tcBlock).toMatch(/stackingNotes:/);
      expect(tcBlock).toMatch(/hematocrit|erythrocytosis/i);
      // Clinical vs community separation — label q2–4 weeks vs weekly DIY/clinic charts
      expect(tcBlock).toMatch(/50–400|50-400/);
      expect(tcBlock).toMatch(/community|DIY|clinic/i);
      expect(tcBlock).toMatch(/supraphysiologic|performance/i);

      const fixture = fixtures.find((f) => f.name === 'Testosterone Cypionate');
      expect(fixture?.profile).toBeDefined();
      expect(fixture!.profile!.dosingFrequency).toBe('TWICE_WEEKLY');
      expect(fixture!.profile!.preferredTime).toBe('ANYTIME');
      expect(fixture!.profile!.dosesPerDay).toBe(1);
      expect(fixture!.profile!.cycleLengthWeeks).toBeNull();
      expect(fixture!.profile!.restPeriodWeeks).toBeNull();
      expect(fixture!.profile!.isFdaApproved).toBe(true);
      expect(fixture!.profile!.timingNotes).toMatch(/50–400|50-400/);
      expect(fixture!.profile!.timingNotes).toMatch(/2 to 4 weeks|2–4 weeks|q2/i);
      expect(fixture!.profile!.timingNotes).toMatch(/100–200|100-200|weekly/i);
      expect(fixture!.profile!.timingNotes).toMatch(/community|DIY|clinic/i);
      expect(fixture!.profile!.timingNotes).toMatch(/hypogonadism/i);
      expect(fixture!.profile!.timingNotes).not.toContain(
        'Regimen is empirical and based on scientific literature, including preclinical studies and early clinical research. Not FDA-approved.',
      );
      expect(fixture!.profile!.cycleRationale).toMatch(/chronic|replacement|hypogonadism/i);
      expect(fixture!.profile!.restPeriodRationale).toMatch(/washout|fertility|baseline/i);
      expect(fixture!.citations?.length).toBeGreaterThanOrEqual(2);
      expect(
        fixture!.citations?.some(
          (c) =>
            (c.url && c.url.includes('dailymed')) ||
            c.pmid === '29562364' ||
            c.doi?.includes('2018-00229'),
        ),
      ).toBe(true);

      const validation = validateDosingProtocol(fixture!.profile!);
      expect(validation.success, JSON.stringify(validation.error)).toBe(true);
    });

    it('should seed Testosterone Propionate with short-ester EOD ranges and clinical-vs-community separation', () => {
      // Short ester (~0.8–1 day half-life): historical ~10–50 mg 2–3×/week; DIY modal ~25–50 mg EOD.
      // Do not invent a current Depo-style weekly package-insert band when product label is sparse.
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
          isFdaApproved?: boolean;
          cycleRationale?: string | null;
          restPeriodRationale?: string | null;
        };
        citations?: Array<{ title: string; doi?: string; pmid?: string; url?: string }>;
      }>;

      const blockStart = seedSource.indexOf("name: 'Testosterone Propionate'");
      const blockEnd = seedSource.indexOf("name: 'Tadalafil'");
      expect(blockStart).toBeGreaterThan(-1);
      expect(blockEnd).toBeGreaterThan(blockStart);
      const tpBlock = seedSource.slice(blockStart, blockEnd);

      const lowAmt = tpBlock.match(/dosingLow:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const typAmt = tpBlock.match(/dosingTypical:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      const highAmt = tpBlock.match(/dosingHigh:\s*\{[\s\S]*?amount: '([^']+)'/)?.[1];
      expect(lowAmt).toBe('25');
      expect(typAmt).toBe('50');
      expect(highAmt).toBe('100');

      expect(tpBlock).toMatch(/### The Technical Mechanism/);
      expect(tpBlock).toMatch(/### The Analogy/);
      expect(tpBlock).toMatch(/### Clinical Expected Timeline/);
      expect(tpBlock).toMatch(/propionate/i);
      expect(tpBlock).toMatch(/hypogonadism/i);
      expect(tpBlock).toMatch(/sideEffects:/);
      expect(tpBlock).toMatch(/stackingNotes:/);
      expect(tpBlock).toMatch(/hematocrit|erythrocytosis/i);
      // Short-ester PK + clinical vs community separation
      expect(tpBlock).toMatch(/EOD|every other day|every-other-day/i);
      expect(tpBlock).toMatch(/half-life|short-acting|short ester/i);
      expect(tpBlock).toMatch(/community|DIY|clinic/i);
      expect(tpBlock).toMatch(/supraphysiologic|performance|blast/i);
      expect(tpBlock).toMatch(/fridgeShelfLifeMonths:\s*null/);
      expect(tpBlock).toMatch(/freezerShelfLifeMonths:\s*null/);
      expect(tpBlock).toMatch(/reconstitutedShelfLifeDays:\s*28/);

      const fixture = fixtures.find((f) => f.name === 'Testosterone Propionate');
      expect(fixture?.profile).toBeDefined();
      expect(fixture!.profile!.dosingFrequency).toBe('EOD');
      expect(fixture!.profile!.preferredTime).toBe('ANYTIME');
      expect(fixture!.profile!.dosesPerDay).toBe(1);
      expect(fixture!.profile!.cycleLengthWeeks).toBeNull();
      expect(fixture!.profile!.restPeriodWeeks).toBeNull();
      expect(fixture!.profile!.isFdaApproved).toBe(true);
      expect(fixture!.profile!.timingNotes).toMatch(/EOD|every other day|every-other-day|daily/i);
      expect(fixture!.profile!.timingNotes).toMatch(/25–50|25-50|10–50|10-50/);
      expect(fixture!.profile!.timingNotes).toMatch(/community|DIY|clinic/i);
      expect(fixture!.profile!.timingNotes).toMatch(/hypogonadism|androgen deficiency/i);
      expect(fixture!.profile!.timingNotes).toMatch(/half-life|short/i);
      expect(fixture!.profile!.timingNotes).not.toContain(
        'Regimen is empirical and based on scientific literature, including preclinical studies and early clinical research. Not FDA-approved.',
      );
      expect(fixture!.profile!.cycleRationale).toMatch(/chronic|replacement|hypogonadism/i);
      expect(fixture!.profile!.restPeriodRationale).toMatch(/washout|fertility|baseline/i);
      expect(fixture!.citations?.length).toBeGreaterThanOrEqual(2);
      expect(
        fixture!.citations?.some(
          (c) =>
            c.pmid === '3782423' ||
            c.pmid === '29562364' ||
            c.doi?.includes('2018-00229') ||
            c.doi?.includes('tau.2016.07.10'),
        ),
      ).toBe(true);

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

    it('should seed KPV with community research-peptide tiers and daily cycled protocol in the DB', async () => {
      const compound = await prisma.catalogItem.findFirst({
        where: { name: 'KPV' },
        include: { profile: true },
      });
      expect(compound).toBeTruthy();
      const profile = compound!.profile as any;
      expect(profile).toBeTruthy();

      expect(profile.dosingLow.amount).toBe('200');
      expect(profile.dosingTypical.amount).toBe('500');
      expect(profile.dosingHigh.amount).toBe('1000');
      expect(profile.dosingLow.unit).toBe('mcg');
      expect(profile.dosingTypical.unit).toBe('mcg');
      expect(profile.dosingHigh.unit).toBe('mcg');

      const typFreq = String(profile.dosingTypical.recommendedFrequency ?? '').toLowerCase();
      expect(typFreq).toMatch(/once daily|daily/);
      expect(typFreq).toMatch(/sc|oral|subq|subcutaneous/);

      expect(profile.dosingFrequency).toBe('DAILY');
      expect(profile.cycleLengthWeeks).toBe(8);
      expect(profile.restPeriodWeeks).toBe(4);
      expect(profile.preferredTime).toBe('MORNING');
      expect(profile.isFdaApproved).toBe(false);

      const notes = String(profile.timingNotes ?? '');
      expect(notes.toLowerCase()).toContain('community');
      expect(notes).toMatch(/200–500 mcg|200-500 mcg|500 mcg/);
      expect(notes).toContain(
        'Regimen is empirical and based on scientific literature, including preclinical studies and early clinical research. Not FDA-approved.',
      );
      expect(String(profile.cycleRationale ?? '')).not.toMatch(/MC3|MC4|melanocortin receptor/i);
      expect(String(profile.restPeriodRationale ?? '')).not.toMatch(/melanocortin receptor/i);
    });

    it('should seed NAD+ with community SubQ research-peptide tiers and thrice-weekly protocol in the DB', async () => {
      const compound = await prisma.catalogItem.findFirst({
        where: { name: 'NAD+' },
        include: { profile: true },
      });
      expect(compound).toBeTruthy();
      const profile = compound!.profile as any;
      expect(profile).toBeTruthy();

      expect(profile.dosingLow.amount).toBe('25');
      expect(profile.dosingTypical.amount).toBe('50');
      expect(profile.dosingHigh.amount).toBe('100');
      expect(profile.dosingLow.unit).toBe('mg');
      expect(profile.dosingTypical.unit).toBe('mg');
      expect(profile.dosingHigh.unit).toBe('mg');

      const typFreq = String(profile.dosingTypical.recommendedFrequency ?? '').toLowerCase();
      expect(typFreq).toMatch(/2/);
      expect(typFreq).toMatch(/3/);
      expect(typFreq).toMatch(/week/);
      expect(typFreq).not.toMatch(/daily or every other day/);
      expect(typFreq).not.toMatch(/^once daily$/);

      expect(profile.dosingFrequency).toBe('THRICE_WEEKLY');
      expect(profile.preferredTime).toBe('MORNING');
      expect(profile.isFdaApproved).toBe(false);

      const notes = String(profile.timingNotes ?? '');
      expect(notes.toLowerCase()).toContain('community');
      expect(notes).toMatch(/50–100 mg|50-100 mg|50 mg/);
      expect(notes).toMatch(/IV/);
      expect(notes).toContain(
        'Regimen is empirical and based on scientific literature, including preclinical studies and early clinical research. Not FDA-approved.',
      );
      expect(String(profile.restPeriodRationale ?? '')).not.toMatch(/safe and beneficial/i);
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

    it('should seed ARA-290 with community research-peptide SC tiers and 4/8 daily protocol in the DB', async () => {
      const compound = await prisma.catalogItem.findFirst({
        where: { name: 'ARA-290' },
        include: { profile: true },
      });
      expect(compound).toBeTruthy();
      const profile = compound!.profile as any;
      expect(profile).toBeTruthy();

      expect(profile.dosingLow.amount).toBe('2.0');
      expect(profile.dosingTypical.amount).toBe('4.0');
      expect(profile.dosingHigh.amount).toBe('8.0');
      expect(profile.dosingLow.unit).toBe('mg');
      expect(profile.dosingTypical.unit).toBe('mg');
      expect(profile.dosingHigh.unit).toBe('mg');

      const typFreq = String(profile.dosingTypical.recommendedFrequency ?? '').toLowerCase();
      expect(typFreq).toMatch(/daily/);
      expect(typFreq).toMatch(/4-week|28|sc/);

      expect(profile.dosingFrequency).toBe('DAILY');
      expect(profile.dosesPerDay).toBe(1);
      expect(profile.cycleLengthWeeks).toBe(4);
      expect(profile.restPeriodWeeks).toBe(8);
      expect(profile.preferredTime).toBe('MORNING');
      expect(profile.isFdaApproved).toBe(false);

      const notes = String(profile.timingNotes ?? '');
      expect(notes.toLowerCase()).toContain('community');
      expect(notes).toMatch(/4 mg/);
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

    it('should seed Retatrutide with community weekly tiers and continuous protocol in the DB', async () => {
      const compound = await prisma.catalogItem.findFirst({
        where: { name: 'Retatrutide' },
        include: { profile: true },
      });
      expect(compound).toBeTruthy();
      const profile = compound!.profile as any;
      expect(profile).toBeTruthy();

      expect(profile.dosingLow.amount).toBe('2.0');
      expect(profile.dosingTypical.amount).toBe('8.0');
      expect(profile.dosingHigh.amount).toBe('12.0');
      expect(profile.dosingLow.unit).toBe('mg');
      expect(profile.dosingTypical.unit).toBe('mg');
      expect(profile.dosingHigh.unit).toBe('mg');

      const typFreq = String(profile.dosingTypical.recommendedFrequency ?? '').toLowerCase();
      expect(typFreq).toMatch(/weekly/);

      expect(profile.dosingFrequency).toBe('WEEKLY');
      expect(profile.dosesPerDay).toBe(1);
      expect(profile.cycleLengthWeeks).toBeNull();
      expect(profile.restPeriodWeeks).toBeNull();
      expect(profile.preferredTime).toBe('ANYTIME');
      expect(profile.isFdaApproved).toBe(false);

      const notes = String(profile.timingNotes ?? '');
      expect(notes.toLowerCase()).toMatch(/community|diy|research-peptide/);
      expect(notes).toMatch(/12 mg|titrat/i);
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
