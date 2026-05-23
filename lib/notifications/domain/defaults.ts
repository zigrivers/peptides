/**
 * Single source of truth for ReminderPreference defaults. Used by both the
 * UI's "first-time user" defaults and the infrastructure layer's
 * `setPushPermissionState` fallback row creation, so they cannot drift.
 *
 * Note that the form-side default channel is 'PUSH' (the user is explicitly
 * configuring reminders) while the silent-bootstrap channel is 'EMAIL' (we
 * created the row to record a permission decision, so we don't assume the
 * user wants push if they haven't opted in yet).
 */
export const DEFAULT_REMINDER_TIME = '07:00';
export const DEFAULT_TIMEZONE = 'UTC';
export const DEFAULT_BOOTSTRAP_CHANNEL = 'EMAIL' as const;
export const DEFAULT_FORM_CHANNEL = 'PUSH' as const;
