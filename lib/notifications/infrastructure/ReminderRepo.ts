import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/shared/prisma';
import type {
  ChannelPreference,
  PushPermissionState,
  ReminderPreferenceInput,
  ReminderPreferenceRecord,
} from '../domain/types';

type TxOrPrisma = Prisma.TransactionClient | typeof prisma;

function mapRow(row: {
  id: string;
  userId: string;
  reminderTime: string;
  timezone: string;
  channel: string;
  enabled: boolean;
  pushPermissionState: string;
  emailFallbackEnabled: boolean;
  updatedAt: Date;
}): ReminderPreferenceRecord {
  return {
    id: row.id,
    userId: row.userId,
    reminderTime: row.reminderTime,
    timezone: row.timezone,
    channel: row.channel as ChannelPreference,
    enabled: row.enabled,
    pushPermissionState: row.pushPermissionState as PushPermissionState,
    emailFallbackEnabled: row.emailFallbackEnabled,
    updatedAt: row.updatedAt,
  };
}

export const ReminderRepo = {
  async findByUserId(
    userId: string,
    client: TxOrPrisma = prisma
  ): Promise<ReminderPreferenceRecord | null> {
    const row = await client.reminderPreference.findUnique({ where: { userId } });
    return row ? mapRow(row) : null;
  },

  async upsert(
    userId: string,
    input: ReminderPreferenceInput,
    client: TxOrPrisma = prisma
  ): Promise<ReminderPreferenceRecord> {
    const row = await client.reminderPreference.upsert({
      where: { userId },
      create: {
        userId,
        reminderTime: input.reminderTime,
        timezone: input.timezone,
        channel: input.channel,
        enabled: input.enabled ?? true,
        emailFallbackEnabled: input.emailFallbackEnabled ?? true,
      },
      update: {
        reminderTime: input.reminderTime,
        timezone: input.timezone,
        channel: input.channel,
        enabled: input.enabled ?? true,
        emailFallbackEnabled: input.emailFallbackEnabled ?? true,
      },
    });
    return mapRow(row);
  },

  async setPushPermissionState(
    userId: string,
    state: PushPermissionState,
    client: TxOrPrisma = prisma
  ): Promise<ReminderPreferenceRecord> {
    // updateMany so we can scope by userId in the predicate; returns count.
    // If no row exists we create one with safe defaults — keeps the audit
    // event meaningful for "user denied push before configuring reminders".
    const existing = await client.reminderPreference.findUnique({ where: { userId } });
    if (!existing) {
      const row = await client.reminderPreference.create({
        data: {
          userId,
          reminderTime: '08:00',
          timezone: 'UTC',
          channel: 'EMAIL',
          enabled: true,
          pushPermissionState: state,
          emailFallbackEnabled: true,
        },
      });
      return mapRow(row);
    }
    const row = await client.reminderPreference.update({
      where: { userId },
      data: { pushPermissionState: state },
    });
    return mapRow(row);
  },
};
