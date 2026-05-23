export type ChannelPreference = 'PUSH' | 'EMAIL' | 'BOTH';
export type PushPermissionState = 'NOT_PROMPTED' | 'GRANTED' | 'DENIED';

export interface ReminderPreferenceInput {
  reminderTime: string;
  timezone: string;
  channel: ChannelPreference;
  enabled?: boolean;
  emailFallbackEnabled?: boolean;
}

export interface ReminderPreferenceRecord {
  id: string;
  userId: string;
  reminderTime: string;
  timezone: string;
  channel: ChannelPreference;
  enabled: boolean;
  pushPermissionState: PushPermissionState;
  emailFallbackEnabled: boolean;
  updatedAt: Date;
}

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}
