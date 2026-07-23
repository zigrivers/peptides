import type { CompoundProfile, SupplementProfile } from './types';

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
};

/**
 * Catalog-equivalent Protocol Snapshot labels for a compound profile.
 * Uses the same defaults Catalog uses when fields are absent.
 */
export function buildProtocolSnapshotLabels(
  profile: ProtocolScheduleSource &
    Pick<CompoundProfile, 'cycleLengthWeeks' | 'restPeriodWeeks' | 'preferredTime'>
): ProtocolSnapshotLabels {
  return {
    cycleLabel: profile.cycleLengthWeeks ? `${profile.cycleLengthWeeks} Weeks` : 'Continuous',
    restLabel: profile.restPeriodWeeks ? `${profile.restPeriodWeeks} Weeks Washout` : 'N/A',
    scheduleLabel: formatProtocolSchedule(profile),
    preferredTimeLabel: formatPreferredTime(profile.preferredTime),
  };
}

/** True when a per-tier recommended frequency should be shown (Catalog parity). */
export function hasDisplayFrequency(frequency: string | null | undefined): boolean {
  return Boolean(frequency && frequency !== 'N/A');
}
