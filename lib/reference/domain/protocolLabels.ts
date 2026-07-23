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
 * Format a hours value for display (e.g. 0.5 → "0.5 h", 168 → "168 h (~7 d)").
 */
export function formatDurationHours(hours: number): string {
  if (hours >= 48) {
    const days = hours / 24;
    const dayStr = Number.isInteger(days) ? `${days}` : days.toFixed(1).replace(/\.0$/, '');
    return `${hours} h (~${dayStr} d)`;
  }
  if (hours >= 1) {
    const hStr = Number.isInteger(hours) ? `${hours}` : hours.toFixed(1).replace(/\.0$/, '');
    return `${hStr} h`;
  }
  const minutes = Math.round(hours * 60);
  return `${hours} h (~${minutes} min)`;
}

/**
 * Compact Protocol Snapshot label for body duration (prefers half-life, else effective duration).
 */
export function formatBodyDurationLabel(bodyDuration: BodyDuration | null | undefined): string {
  if (!bodyDuration) return 'N/A';

  const pickRange = (
    low: number | null,
    high: number | null
  ): string | null => {
    if (low === null) return null;
    if (high !== null && high !== low) {
      return `${formatDurationHours(low)}–${formatDurationHours(high)}`;
    }
    return formatDurationHours(low);
  };

  const halfLife = pickRange(bodyDuration.halfLifeHours, bodyDuration.halfLifeHoursMax);
  if (halfLife) {
    const certainty =
      bodyDuration.certainty === 'ESTABLISHED'
        ? ''
        : bodyDuration.certainty === 'ESTIMATED'
          ? ' (est.)'
          : ' (uncertain)';
    return `t½ ${halfLife}${certainty}`;
  }

  const effective = pickRange(
    bodyDuration.effectiveDurationHours,
    bodyDuration.effectiveDurationHoursMax
  );
  if (effective) {
    const certainty =
      bodyDuration.certainty === 'ESTABLISHED'
        ? ''
        : bodyDuration.certainty === 'ESTIMATED'
          ? ' (est.)'
          : ' (uncertain)';
    return `~${effective} effect${certainty}`;
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
