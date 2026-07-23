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
