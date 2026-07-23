import { describe, it, expect } from 'vitest';
import { getCompoundBySlug } from '@/lib/reference/application/CompoundService';
import {
  buildProtocolSnapshotLabels,
  formatBodyDurationLabel,
} from '@/lib/reference/domain/protocolLabels';

/**
 * Real profile path regression: seeded bodyDuration must survive
 * CompoundRepo map → CompoundService → Protocol Snapshot labels.
 * Fails loudly if the DB was migrated but never reseeded (all nulls)
 * or if mapping drops the field.
 */
describe('REF bodyDuration live profile path', () => {
  const cases = [
    { slug: 'bpc-157', name: 'BPC-157', expectUncertain: true },
    { slug: 'semaglutide', name: 'Semaglutide', expectUncertain: false },
    { slug: 'foxo4-dri', name: 'FOXO4-DRI', expectUncertain: true },
  ] as const;

  it('returns non-null bodyDuration and non-N/A labels for BPC-157, Semaglutide, FOXO4-DRI', async () => {
    const results: Array<Record<string, unknown>> = [];

    for (const c of cases) {
      const compound = await getCompoundBySlug(c.slug);
      expect(compound, c.slug).toBeTruthy();
      expect(compound!.name).toBe(c.name);

      const profile = compound!.profile;
      expect(profile, `${c.slug} profile`).toBeTruthy();
      expect(profile!.bodyDuration, `${c.slug} bodyDuration`).not.toBeNull();
      expect(profile!.bodyDuration!.frequencyImplication.trim().length).toBeGreaterThan(10);

      const labels = buildProtocolSnapshotLabels(profile!);
      expect(labels.bodyDurationLabel).not.toBe('N/A');
      expect(labels.bodyDurationLabel.length).toBeGreaterThan(3);
      expect(labels.bodyDurationLabel.startsWith('Lasts ')).toBe(true);
      expect(labels.bodyDurationLabel.toLowerCase().includes('half-life')).toBe(false);
      expect(labels.bodyDurationLabel.startsWith('t')).toBe(false);
      expect(formatBodyDurationLabel(profile!.bodyDuration)).toBe(labels.bodyDurationLabel);

      if (c.expectUncertain) {
        expect(profile!.bodyDuration!.certainty).toMatch(/UNCERTAIN|ESTIMATED/);
      } else {
        expect(profile!.bodyDuration!.certainty).toBe('ESTABLISHED');
        expect(profile!.bodyDuration!.halfLifeHours).toBeGreaterThan(100);
      }

      results.push({
        slug: c.slug,
        certainty: profile!.bodyDuration!.certainty,
        bodyDurationLabel: labels.bodyDurationLabel,
        frequencyImplication: profile!.bodyDuration!.frequencyImplication.slice(0, 80),
      });
    }

    // Durable assertion payload for humans reading test failure output
    expect(results).toHaveLength(3);
  });
});
