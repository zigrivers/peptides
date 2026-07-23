import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  BodyDurationSchema,
  parseBodyDuration,
  parseCompoundDosing,
} from '@/lib/reference/domain/validation';
import { formatBodyDurationLabel } from '@/lib/reference/domain/protocolLabels';
import type { BodyDuration } from '@/lib/reference/domain/types';

/**
 * Full-catalog coverage for post-injection bodyDuration.
 * Exercises the real Zod schema + parseBodyDuration path used by CompoundRepo.
 */
describe('REF bodyDuration catalog coverage', () => {
  const fixturesPath = path.join(process.cwd(), 'prisma/seed-data/dosing_fixtures.json');
  const researchPath = path.join(process.cwd(), 'prisma/seed-data/body_duration_research.json');

  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8')) as Array<{
    name: string;
    profile: { bodyDuration?: unknown; dosingFrequency?: string | null };
    citations?: Array<{ title: string; doi?: string; pmid?: string; url?: string }>;
  }>;

  const research = JSON.parse(fs.readFileSync(researchPath, 'utf8')) as {
    compounds: Record<string, { bodyDuration: BodyDuration; citations?: unknown[] }>;
  };

  it('has dosing fixtures for the full peptide catalog', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(50);
  });

  it('populates valid bodyDuration for every seeded catalog compound', () => {
    const failures: string[] = [];

    for (const fixture of fixtures) {
      const raw = fixture.profile?.bodyDuration;
      if (raw === undefined || raw === null) {
        failures.push(`${fixture.name}: missing bodyDuration`);
        continue;
      }

      const parsed = parseBodyDuration(raw);
      if (!parsed) {
        failures.push(`${fixture.name}: parseBodyDuration returned null`);
        continue;
      }

      const result = BodyDurationSchema.safeParse(parsed);
      if (!result.success) {
        failures.push(`${fixture.name}: ${result.error.message}`);
        continue;
      }

      if (!parsed.frequencyImplication.trim()) {
        failures.push(`${fixture.name}: empty frequencyImplication`);
      }

      if (parsed.halfLifeHours === null && parsed.effectiveDurationHours === null) {
        failures.push(`${fixture.name}: no half-life or effective duration`);
      }

      // Label path used by Protocol Snapshot must be plain-language and non-empty
      const label = formatBodyDurationLabel(parsed);
      if (!label || label === 'N/A') {
        failures.push(`${fixture.name}: formatBodyDurationLabel produced N/A`);
      } else if (label.startsWith('t1/2') || label.startsWith('t1⁄2') || label.startsWith('t\u00bd') || /^half[- ]?life/i.test(label)) {
        failures.push(`${fixture.name}: label still leads with half-life jargon: ${label}`);
      } else if (!label.startsWith('Lasts ')) {
        failures.push(`${fixture.name}: label should start with "Lasts": ${label}`);
      }

      // Citation evidence: at least one citation on the fixture
      if (!fixture.citations || fixture.citations.length === 0) {
        failures.push(`${fixture.name}: no citations`);
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('keeps research file and fixtures in sync for every compound', () => {
    const fixtureNames = fixtures.map((f) => f.name).sort();
    const researchNames = Object.keys(research.compounds).sort();
    expect(fixtureNames).toEqual(researchNames);

    for (const fixture of fixtures) {
      const fromResearch = research.compounds[fixture.name]?.bodyDuration;
      const fromFixture = parseBodyDuration(fixture.profile.bodyDuration);
      expect(fromFixture, fixture.name).toEqual(fromResearch);
    }
  });

  it('marks uncertainty when sources are weak (sample of sparse-PK compounds)', () => {
    const sparseNames = ['FOXO4-DRI', 'BPC-157', 'PE-22-28', 'Adipotide', 'GLOW50'];
    for (const name of sparseNames) {
      const fixture = fixtures.find((f) => f.name === name);
      expect(fixture, name).toBeTruthy();
      const duration = parseBodyDuration(fixture!.profile.bodyDuration);
      expect(duration?.certainty, name).toBe('UNCERTAIN');
      expect(duration?.frequencyImplication.length, name).toBeGreaterThan(40);
      // Protocol label must surface the uncertainty marker
      expect(formatBodyDurationLabel(duration!)).toMatch(/uncertain/i);
    }
  });

  it('includes established long- and short-acting human PK samples', () => {
    const samples: Array<{ name: string; certainty: BodyDuration['certainty']; minHalfLife?: number }> =
      [
        { name: 'Semaglutide', certainty: 'ESTABLISHED', minHalfLife: 100 },
        { name: 'Tirzepatide', certainty: 'ESTABLISHED', minHalfLife: 100 },
        { name: 'PT-141', certainty: 'ESTABLISHED' },
        { name: 'Tesamorelin', certainty: 'ESTABLISHED' },
        { name: 'HGH', certainty: 'ESTABLISHED' },
      ];

    for (const sample of samples) {
      const fixture = fixtures.find((f) => f.name === sample.name);
      expect(fixture, sample.name).toBeTruthy();
      const duration = parseBodyDuration(fixture!.profile.bodyDuration)!;
      expect(duration.certainty).toBe(sample.certainty);
      expect(duration.frequencyImplication.length).toBeGreaterThan(20);
      if (sample.minHalfLife !== undefined) {
        expect(duration.halfLifeHours).toBeGreaterThanOrEqual(sample.minHalfLife);
      }
      expect(fixture!.citations!.length).toBeGreaterThan(0);
    }
  });

  it('parseBodyDuration rejects empty objects and accepts valid JSON strings', () => {
    expect(parseBodyDuration(null)).toBeNull();
    expect(parseBodyDuration({})).toBeNull();
    expect(
      parseBodyDuration(
        JSON.stringify({
          halfLifeHours: 2,
          halfLifeHoursMax: null,
          effectiveDurationHours: null,
          effectiveDurationHoursMax: null,
          certainty: 'ESTIMATED',
          frequencyImplication: 'Twice daily research dosing.',
        })
      )
    ).toMatchObject({ halfLifeHours: 2, certainty: 'ESTIMATED' });
  });

  it('does not break existing dose amount parsing used on the same profile path', () => {
    const dose = parseCompoundDosing({ amount: '250', unit: 'mcg' });
    expect(dose.amount).toBe('250');
    expect(dose.unit).toBe('mcg');
  });
});
