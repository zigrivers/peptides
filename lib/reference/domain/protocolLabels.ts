import type { BodyDuration, CompoundProfile, SupplementProfile } from './types';

/** Human-readable dosing frequency enum labels (Catalog + Reconstitute). */
export function formatFrequency(freq: string | null | undefined): string {
  if (!freq) return 'Not Specified';
  switch (freq) {
    case 'DAILY':
      return 'Daily';
    case 'EOD':
      return 'Every Other Day';
    case 'THRICE_WEEKLY':
      return 'Thrice Weekly';
    case 'WEEKLY':
      return 'Once Weekly';
    case 'TWICE_WEEKLY':
      return 'Twice Weekly';
    case 'EVERY_TWO_WEEKS':
      return 'Every Two Weeks';
    case 'EVERY_FOUR_WEEKS':
      return 'Every Four Weeks';
    case 'AS_NEEDED':
      return 'As Needed';
    case 'CUSTOM':
      return 'Custom Protocol';
    default:
      return freq;
  }
}

/** Human-readable preferred-time enum labels (Catalog + Reconstitute). */
export function formatPreferredTime(time: string | null | undefined): string {
  if (!time) return 'N/A';
  switch (time) {
    case 'MORNING':
      return 'Morning';
    case 'AFTERNOON':
      return 'Afternoon';
    case 'NIGHT':
      return 'Nighttime';
    case 'PRE_WORKOUT':
      return 'Pre-Workout';
    case 'POST_WORKOUT':
      return 'Post-Workout';
    case 'MORNING_AND_NIGHT':
      return 'Morning and Night';
    case 'MORNING_AFTERNOON_NIGHT':
      return 'Morning, Afternoon, and Night';
    case 'PRE_AND_POST_WORKOUT':
      return 'Pre and Post-Workout';
    case 'ANYTIME':
      return 'Anytime';
    case 'AS_NEEDED':
      return 'As Needed';
    default:
      return time;
  }
}

type ProtocolScheduleSource = Pick<
  CompoundProfile,
  'dosingFrequency' | 'customFrequencyDescription' | 'daysOn' | 'daysOff' | 'dosesPerDay'
>;

/** Catalog Protocol Snapshot "Schedule" string for a peptide profile. */
export function formatProtocolSchedule(profile: ProtocolScheduleSource): string {
  if (profile.dosingFrequency === 'CUSTOM') {
    return profile.customFrequencyDescription || 'Custom Protocol';
  }

  if (profile.dosingFrequency === 'DAILY') {
    if (profile.daysOn && profile.daysOff) {
      return `${profile.dosesPerDay && profile.dosesPerDay > 1 ? `${profile.dosesPerDay}x Daily: ` : ''}${profile.daysOn} Days On / ${profile.daysOff} Off`;
    }
    return `${profile.dosesPerDay && profile.dosesPerDay > 1 ? `${profile.dosesPerDay}x ` : ''}Daily`;
  }

  return `${formatFrequency(profile.dosingFrequency)}${
    profile.dosesPerDay && profile.dosesPerDay > 1 ? ` (${profile.dosesPerDay}x per admin day)` : ''
  }`;
}

/** Schedule string for a supplement profile. */
export function formatSupplementSchedule(
  profile: Pick<SupplementProfile, 'dosingFrequency' | 'dosesPerDay'>
): string {
  return `${formatFrequency(profile.dosingFrequency)}${
    profile.dosesPerDay && profile.dosesPerDay > 1 ? ` (${profile.dosesPerDay}x daily)` : ''
  }`;
}

export type ProtocolSnapshotLabels = {
  cycleLabel: string;
  restLabel: string;
  scheduleLabel: string;
  preferredTimeLabel: string;
  /** Compact half-life / effective duration label (hours), or N/A. */
  bodyDurationLabel: string;
};

/**
 * Format a duration in hours as plain language for non-technical readers
 * (e.g. 0.5 → "30 min", 2 → "2 hours", 168 → "7 days").
 */
export function formatDurationHours(hours: number): string {
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return `${minutes} min`;
  }
  if (hours < 48) {
    const h =
      hours >= 10 || Number.isInteger(hours)
        ? Math.round(hours)
        : Number(hours.toFixed(1).replace(/\.0$/, ''));
    return h === 1 ? '1 hour' : `${h} hours`;
  }
  const days = hours / 24;
  const d = Number.isInteger(days) ? days : Number(days.toFixed(1).replace(/\.0$/, ''));
  return d === 1 ? '1 day' : `${d} days`;
}

/**
 * Format a low–high duration range in consistent plain units when possible.
 */
export function formatDurationRange(low: number, high: number | null): string {
  if (high === null || high === low) {
    return formatDurationHours(low);
  }

  // Prefer a single unit for the range so labels stay scannable.
  if (low < 1 && high < 1) {
    const lo = Math.max(1, Math.round(low * 60));
    const hi = Math.max(lo, Math.round(high * 60));
    return `${lo}–${hi} min`;
  }
  // Multi-day spans (or low near a day and high multi-day): use days
  if (high >= 48) {
    const loDays = low / 24;
    const hiDays = high / 24;
    const lo = Number.isInteger(loDays) ? loDays : Number(loDays.toFixed(1).replace(/\.0$/, ''));
    const hi = Number.isInteger(hiDays) ? hiDays : Number(hiDays.toFixed(1).replace(/\.0$/, ''));
    return `${lo}–${hi} days`;
  }
  if (low >= 1) {
    const lo =
      low >= 10 || Number.isInteger(low)
        ? Math.round(low)
        : Number(low.toFixed(1).replace(/\.0$/, ''));
    const hi =
      high >= 10 || Number.isInteger(high)
        ? Math.round(high)
        : Number(high.toFixed(1).replace(/\.0$/, ''));
    return `${lo}–${hi} hours`;
  }

  // Sub-hour low with multi-hour high: format each side
  return `${formatDurationHours(low)}–${formatDurationHours(high)}`;
}

function certaintySuffix(certainty: BodyDuration['certainty']): string {
  if (certainty === 'ESTABLISHED') return '';
  if (certainty === 'ESTIMATED') return ' (estimate)';
  return ' (uncertain)';
}

/**
 * Compact Protocol Snapshot label for body duration — plain language first.
 * Prefers practical “how long it lasts” (effective duration), then half-life as a
 * stand-in for body stay, without leading “t½” / half-life jargon.
 */
export function formatBodyDurationLabel(bodyDuration: BodyDuration | null | undefined): string {
  if (!bodyDuration) return 'N/A';

  const certainty = certaintySuffix(bodyDuration.certainty);

  // Prefer effective duration: “how long it lasts” is what users need for dosing intuition.
  if (bodyDuration.effectiveDurationHours !== null) {
    const span = formatDurationRange(
      bodyDuration.effectiveDurationHours,
      bodyDuration.effectiveDurationHoursMax
    );
    return `Lasts ${span}${certainty}`;
  }

  if (bodyDuration.halfLifeHours !== null) {
    const span = formatDurationRange(
      bodyDuration.halfLifeHours,
      bodyDuration.halfLifeHoursMax
    );
    return `Lasts ${span}${certainty}`;
  }

  return 'N/A';
}

/**
 * Catalog-equivalent Protocol Snapshot labels for a compound profile.
 * Uses the same defaults Catalog uses when fields are absent.
 */
export function buildProtocolSnapshotLabels(
  profile: ProtocolScheduleSource &
    Pick<CompoundProfile, 'cycleLengthWeeks' | 'restPeriodWeeks' | 'preferredTime'> & {
      bodyDuration?: CompoundProfile['bodyDuration'];
    }
): ProtocolSnapshotLabels {
  return {
    cycleLabel: profile.cycleLengthWeeks ? `${profile.cycleLengthWeeks} Weeks` : 'Continuous',
    restLabel: profile.restPeriodWeeks ? `${profile.restPeriodWeeks} Weeks Washout` : 'N/A',
    scheduleLabel: formatProtocolSchedule(profile),
    preferredTimeLabel: formatPreferredTime(profile.preferredTime),
    bodyDurationLabel: formatBodyDurationLabel(profile.bodyDuration ?? null),
  };
}

/** True when a per-tier recommended frequency should be shown (Catalog parity). */
export function hasDisplayFrequency(frequency: string | null | undefined): boolean {
  return Boolean(frequency && frequency !== 'N/A');
}
