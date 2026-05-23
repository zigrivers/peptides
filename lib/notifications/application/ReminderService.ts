import { withAudit } from '@/lib/audit/application/withAudit';
import { ReminderRepo } from '../infrastructure/ReminderRepo';
import { PushSubscriptionRepo } from '../infrastructure/PushSubscriptionRepo';
import {
  reminderPreferenceSchema,
  pushSubscriptionSchema,
  pushPermissionStateSchema,
} from '../domain/validation';
import type {
  PushPermissionState,
  PushSubscriptionInput,
  ReminderPreferenceInput,
  ReminderPreferenceRecord,
} from '../domain/types';

export async function getReminderPreference(
  userId: string
): Promise<ReminderPreferenceRecord | null> {
  return ReminderRepo.findByUserId(userId);
}

export async function upsertReminderPreference(
  userId: string,
  raw: ReminderPreferenceInput
): Promise<ReminderPreferenceRecord> {
  const input = reminderPreferenceSchema.parse(raw);
  const prior = await ReminderRepo.findByUserId(userId);

  return withAudit(
    (tx) =>
      ReminderRepo.upsert(
        userId,
        {
          reminderTime: input.reminderTime,
          timezone: input.timezone,
          channel: input.channel,
          enabled: input.enabled,
          emailFallbackEnabled: input.emailFallbackEnabled,
        },
        tx
      ),
    (result) => ({
      actorUserId: userId,
      subjectUserId: userId,
      category: 'Notification',
      action: 'REMINDER_PREFERENCE_UPDATED',
      resourceId: result.id,
      resourceType: 'ReminderPreference',
      oldValues: prior
        ? {
            reminderTime: prior.reminderTime,
            timezone: prior.timezone,
            channel: prior.channel,
            enabled: prior.enabled,
            emailFallbackEnabled: prior.emailFallbackEnabled,
          }
        : null,
      newValues: {
        reminderTime: result.reminderTime,
        timezone: result.timezone,
        channel: result.channel,
        enabled: result.enabled,
        emailFallbackEnabled: result.emailFallbackEnabled,
      },
    })
  );
}

export async function setPushPermissionState(
  userId: string,
  raw: PushPermissionState
): Promise<ReminderPreferenceRecord> {
  const state = pushPermissionStateSchema.parse(raw);
  const prior = await ReminderRepo.findByUserId(userId);

  return withAudit(
    (tx) => ReminderRepo.setPushPermissionState(userId, state, tx),
    (result) => ({
      actorUserId: userId,
      subjectUserId: userId,
      category: 'Notification',
      action: 'PUSH_PERMISSION_STATE_CHANGED',
      resourceId: result.id,
      resourceType: 'ReminderPreference',
      oldValues: prior ? { pushPermissionState: prior.pushPermissionState } : null,
      newValues: { pushPermissionState: result.pushPermissionState },
    })
  );
}

export async function registerPushSubscription(
  userId: string,
  raw: PushSubscriptionInput
): Promise<{ id: string }> {
  const input = pushSubscriptionSchema.parse(raw);

  // Endpoint-uniqueness ownership check (see PushSubscriptionRepo JSDoc).
  // If another user already owns this endpoint, refuse — the device's prior
  // owner must explicitly unsubscribe first (a no-op for them if they no
  // longer use the device, but defends against push-hijack).
  const existing = await PushSubscriptionRepo.findByEndpoint(input.endpoint);
  if (existing && existing.userId !== userId) {
    throw new Error('push_subscription_endpoint_owned_by_another_user');
  }

  if (existing && existing.userId === userId) {
    return withAudit(
      async (tx) => {
        await PushSubscriptionRepo.updateKeys(existing.id, userId, input, tx);
        return { id: existing.id };
      },
      (result) => ({
        actorUserId: userId,
        subjectUserId: userId,
        category: 'Notification',
        action: 'PUSH_SUBSCRIPTION_REGISTERED',
        resourceId: result.id,
        resourceType: 'PushSubscription',
        metadata: { mode: 'refresh' },
      })
    );
  }

  return withAudit(
    (tx) => PushSubscriptionRepo.create(userId, input, tx),
    (result) => ({
      actorUserId: userId,
      subjectUserId: userId,
      category: 'Notification',
      action: 'PUSH_SUBSCRIPTION_REGISTERED',
      resourceId: result.id,
      resourceType: 'PushSubscription',
      metadata: { mode: 'create' },
    })
  );
}

export async function removePushSubscription(
  userId: string,
  endpoint: string
): Promise<{ removed: boolean }> {
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    throw new Error('invalid_endpoint');
  }
  // We always emit the audit event because the user-initiated intent ("stop
  // pushing to my device") is itself worth recording, even when nothing
  // matched (e.g. browser purged the subscription before the action ran).
  const result = await withAudit(
    (tx) => PushSubscriptionRepo.deleteByEndpoint(userId, endpoint, tx),
    () => ({
      actorUserId: userId,
      subjectUserId: userId,
      category: 'Notification',
      action: 'PUSH_SUBSCRIPTION_REMOVED',
      resourceId: endpoint,
      resourceType: 'PushSubscription',
    })
  );
  return { removed: result.count > 0 };
}
