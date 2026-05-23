import { z } from 'zod';
import type { ChannelPreference, PushPermissionState } from './types';

// 24-hour HH:MM, e.g. "07:00", "23:59".
export const REMINDER_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const CHANNEL_VALUES = ['PUSH', 'EMAIL', 'BOTH'] as const satisfies readonly ChannelPreference[];

export const PUSH_PERMISSION_VALUES = [
  'NOT_PROMPTED',
  'GRANTED',
  'DENIED',
] as const satisfies readonly PushPermissionState[];

/**
 * Validates an IANA timezone identifier by attempting to format with it.
 * Returns true iff the runtime's Intl implementation recognises the zone.
 *
 * Intentionally narrow — wraps the cross-platform DateTimeFormat boundary
 * once so the dispatch cron (Task 5.2) can reuse the same predicate.
 */
export function isValidTimezone(tz: string): boolean {
  if (typeof tz !== 'string' || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const reminderPreferenceSchema = z.object({
  reminderTime: z
    .string()
    .regex(REMINDER_TIME_REGEX, { message: 'invalid_reminder_time' }),
  timezone: z
    .string()
    .refine(isValidTimezone, { message: 'invalid_timezone' }),
  channel: z.enum(CHANNEL_VALUES, { errorMap: () => ({ message: 'invalid_channel' }) }),
  enabled: z.boolean().optional(),
  emailFallbackEnabled: z.boolean().optional(),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url({ message: 'invalid_endpoint' }),
  p256dh: z.string().min(1, { message: 'invalid_p256dh' }),
  auth: z.string().min(1, { message: 'invalid_auth' }),
});

export const pushPermissionStateSchema = z.enum(PUSH_PERMISSION_VALUES, {
  errorMap: () => ({ message: 'invalid_push_permission_state' }),
});
