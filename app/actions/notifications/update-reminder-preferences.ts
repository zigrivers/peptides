'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { upsertReminderPreference } from '@/lib/notifications/application/ReminderService';
import type { ChannelPreference } from '@/lib/notifications/domain/types';

export interface UpdateReminderPreferencesState {
  error?: string;
  success?: string;
}

const CHANNELS: ReadonlySet<ChannelPreference> = new Set(['PUSH', 'EMAIL', 'BOTH']);

export async function updateReminderPreferencesAction(
  _prev: UpdateReminderPreferencesState | null,
  formData: FormData
): Promise<UpdateReminderPreferencesState> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' };

  const reminderTime = String(formData.get('reminderTime') ?? '');
  const timezone = String(formData.get('timezone') ?? '');
  const channelRaw = String(formData.get('channel') ?? '');
  if (!CHANNELS.has(channelRaw as ChannelPreference)) {
    return { error: 'Please choose a delivery channel.' };
  }
  const enabled = formData.get('enabled') === 'on';
  const emailFallbackEnabled = formData.get('emailFallbackEnabled') === 'on';

  try {
    await upsertReminderPreference(session.user.id, {
      reminderTime,
      timezone,
      channel: channelRaw as ChannelPreference,
      enabled,
      emailFallbackEnabled,
    });
    revalidatePath('/settings');
    return { success: 'Saved.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown_error';
    if (msg.includes('invalid_reminder_time')) {
      return { error: 'Reminder time must be in 24h HH:MM format (e.g., 07:00).' };
    }
    if (msg.includes('invalid_timezone')) {
      return { error: 'Unrecognised time zone — please choose one from the list.' };
    }
    if (msg.includes('invalid_channel')) {
      return { error: 'Unsupported delivery channel.' };
    }
    return { error: 'Could not save preferences. Please try again.' };
  }
}
