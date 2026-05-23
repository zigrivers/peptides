import { prisma } from '@/lib/shared/prisma';
import { PrismaAuditRepo } from '@/lib/audit/infrastructure/PrismaAuditRepo';
import {
  alreadyDispatchedToday,
  isInDispatchWindow,
  localPartsOf,
  parseHHMM,
} from '../domain/dispatchWindow';
import { isValidTimezone } from '../domain/validation';
import { sendWebPush, type WebPushTarget } from '../infrastructure/webPush';
import { sendReminderEmail } from '../infrastructure/reminderEmail';
import { listProtocolsForUser } from '@/lib/tracker/infrastructure/ProtocolRepo';
import { isScheduledOn } from '@/lib/tracker/domain/ScheduleGenerator';

/**
 * Reminder dispatcher (Task 5.2). System-level cron handler invoked every
 * 15 minutes by Railway Cron (ADR-012). Global scan of `ReminderPreference`
 * is an approved exception documented in CLAUDE.md / AGENTS.md.
 */

export interface DispatchSummary {
  examined: number;
  dispatched: number;
  /** Subset of `dispatched` where at least one configured channel did not deliver. */
  partialDeliveries: number;
  pushSent: number;
  pushExpired: number;
  emailSent: number;
  emailFailed: number;
  skippedNoDoses: number;
  errors: number;
}

const REMINDER_PAYLOAD = {
  title: 'Time to log today’s doses',
  body: 'Open your tracker to confirm or skip today’s scheduled doses.',
  url: '/tracker',
  tag: 'peptides-dose-reminder',
};

function emptySummary(): DispatchSummary {
  return {
    examined: 0,
    dispatched: 0,
    partialDeliveries: 0,
    pushSent: 0,
    pushExpired: 0,
    emailSent: 0,
    emailFailed: 0,
    skippedNoDoses: 0,
    errors: 0,
  };
}

async function userHasScheduledDosesToday(
  userId: string,
  localYYYYMMDD: string
): Promise<boolean> {
  // Treat the user's local calendar date as a UTC midnight for ScheduleGenerator
  // (it compares UTC midnight values against the protocol's startDate / endDate,
  // both of which are stored at UTC midnight).
  const [yearStr, monthStr, dayStr] = localYYYYMMDD.split('-');
  const target = new Date(
    Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr))
  );
  const protocols = await listProtocolsForUser(prisma, userId);
  return protocols.some(
    (p) =>
      p.userId === userId &&
      p.status === 'ACTIVE' &&
      isScheduledOn(p.schedule, p.startDate, p.endDate, target)
  );
}

interface CandidatePref {
  id: string;
  userId: string;
  reminderTime: string;
  timezone: string;
  channel: string;
  emailFallbackEnabled: boolean;
  pushPermissionState: string;
  lastDispatchedAt: Date | null;
  user: { email: string };
}

async function loadCandidatePreferences(): Promise<CandidatePref[]> {
  return prisma.reminderPreference.findMany({
    where: { enabled: true },
    select: {
      id: true,
      userId: true,
      reminderTime: true,
      timezone: true,
      channel: true,
      emailFallbackEnabled: true,
      pushPermissionState: true,
      lastDispatchedAt: true,
      user: { select: { email: true } },
    },
  });
}

async function loadPushTargets(userId: string): Promise<WebPushTarget[]> {
  const rows = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { endpoint: true, p256dh: true, auth: true },
  });
  return rows;
}

async function pruneExpiredSubscription(userId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

/**
 * Drives one cron tick. `now` is parameterised so tests can freeze time
 * without `vi.useFakeTimers`.
 */
export async function dispatchDoseReminders(now: Date): Promise<DispatchSummary> {
  const summary = emptySummary();
  const candidates = await loadCandidatePreferences();
  summary.examined = candidates.length;

  for (const pref of candidates) {
    try {
      if (!isValidTimezone(pref.timezone)) {
        // Misconfigured row — log once and continue. Not an audit-worthy event;
        // the user can fix from /settings.
        summary.errors += 1;
        continue;
      }
      const prefMinutes = parseHHMM(pref.reminderTime);
      const local = localPartsOf(now, pref.timezone);
      const localMinutes = local.hh * 60 + local.mm;
      if (!isInDispatchWindow(localMinutes, prefMinutes)) continue;
      if (alreadyDispatchedToday(now, pref.lastDispatchedAt, pref.timezone)) continue;

      const hasDoses = await userHasScheduledDosesToday(pref.userId, local.yyyymmdd);
      if (!hasDoses) {
        summary.skippedNoDoses += 1;
        continue;
      }

      let pushSentCount = 0;
      let pushAttemptCount = 0;
      const channel = pref.channel;
      const wantsPush = channel === 'PUSH' || channel === 'BOTH';
      const wantsEmail = channel === 'EMAIL' || channel === 'BOTH';

      if (wantsPush && pref.pushPermissionState === 'GRANTED') {
        const targets = await loadPushTargets(pref.userId);
        for (const target of targets) {
          pushAttemptCount += 1;
          const result = await sendWebPush(target, REMINDER_PAYLOAD);
          if (result.ok) {
            pushSentCount += 1;
          } else if (result.expired) {
            summary.pushExpired += 1;
            await pruneExpiredSubscription(pref.userId, target.endpoint);
          }
        }
        summary.pushSent += pushSentCount;
      }

      let emailAttempted = false;
      let emailSent = false;
      let emailError: string | undefined;
      // Email semantics: explicit EMAIL/BOTH channel always emails. For
      // PUSH-only, the fallback fires when *any* push attempt failed to
      // deliver OR when the user has no active push subscriptions —
      // otherwise a single successful stale/secondary device could mask
      // a primary-device failure and silently miss the user.
      const pushHasGap =
        wantsPush && (pushAttemptCount === 0 || pushSentCount < pushAttemptCount);
      const pushDeliveredAny = wantsPush && pushSentCount > 0;
      const shouldEmail =
        wantsEmail || (pushHasGap && pref.emailFallbackEnabled);

      if (shouldEmail && pref.user.email) {
        emailAttempted = true;
        const result = await sendReminderEmail(pref.user.email);
        if (result.ok) {
          emailSent = true;
          summary.emailSent += 1;
        } else {
          summary.emailFailed += 1;
          summary.errors += 1;
          emailError = result.error;
        }
      }

      const anyDelivered = pushDeliveredAny || emailSent;
      if (!anyDelivered) {
        // Nothing was delivered (e.g. permission GRANTED but no subscriptions,
        // and channel was PUSH-only with email-fallback off). Skip the audit
        // and the lastDispatchedAt update so the user gets another chance
        // next tick.
        continue;
      }

      // Partial delivery semantics: when a channel was configured (or required
      // as a fallback) AND its delivery failed, classify the dispatch as
      // partial. We still update lastDispatchedAt — the user did get one of
      // the configured channels, and retrying would re-send the successful
      // channel and produce a duplicate notification. The partial state is
      // surfaced in both the summary and the audit metadata so ops can review.
      const pushPartialFailure = wantsPush && pushHasGap;
      const emailPartialFailure = emailAttempted && !emailSent;
      const partialDelivery = pushPartialFailure || emailPartialFailure;
      if (partialDelivery) summary.partialDeliveries += 1;

      await prisma.$transaction(async (tx) => {
        await tx.reminderPreference.update({
          where: { userId: pref.userId },
          data: { lastDispatchedAt: now },
        });
        await PrismaAuditRepo.create(tx, {
          actorUserId: 'SYSTEM',
          subjectUserId: pref.userId,
          category: 'Notification',
          action: 'REMINDER_DISPATCHED',
          resourceId: pref.id,
          resourceType: 'ReminderPreference',
          metadata: {
            channel,
            pushAttempted: pushAttemptCount,
            pushDelivered: pushSentCount,
            emailAttempted,
            emailDelivered: emailSent,
            emailError: emailError ?? null,
            partialDelivery,
          },
        });
      });
      summary.dispatched += 1;
    } catch (err) {
      // One user's failure must not stop the loop.
      summary.errors += 1;
      // eslint-disable-next-line no-console
      console.error('[ReminderDispatcher] per-user dispatch failed', {
        userId: pref.userId,
        message: (err as Error).message,
      });
    }
  }

  return summary;
}
