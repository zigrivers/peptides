import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { isOrderingDisabled } from '@/lib/shared/featureFlags';
import { requestExportAction } from '@/app/actions/account/request-export';
import { RequestExportButton } from './_components/RequestExportButton';
import { getReminderPreference } from '@/lib/notifications/application/ReminderService';
import { updateReminderPreferencesAction } from '@/app/actions/notifications/update-reminder-preferences';
import { RemindersForm } from './_components/RemindersForm';
import { PushSubscriptionPanel } from './_components/PushSubscriptionPanel';
import { SyringePreferencesForm } from './_components/SyringePreferencesForm';
import { buildTimezoneSuggestions } from '@/lib/notifications/domain/timezones';
import { prisma } from '@/lib/shared/prisma';
import {
  scheduleDeletionAction,
  deleteImmediatelyAction,
} from '@/app/actions/account/schedule-deletion';
import { cancelDeletionAction } from '@/app/actions/account/cancel-deletion';
import { DeleteAccountSection } from './_components/DeleteAccountSection';
import { CancelDeletionBanner } from './_components/CancelDeletionBanner';

/**
 * Account settings index. Surfaces the data-export request button (Task 6.2,
 * Phase 2 Legal Gate item 3) and links to other settings sub-pages.
 */
export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const reminderPreference = await getReminderPreference(session.user.id);
  const syringePrefs = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { syringeStandard: true, syringeSize: true },
  });
  const syringeStandard = (syringePrefs?.syringeStandard ?? 'U100') as 'U100' | 'U40';
  const syringeSize = (syringePrefs?.syringeSize ?? '1.0') as '0.3' | '0.5' | '1.0';
  // Server-side default timezone falls back to the deployment's TZ env (or 'UTC'
  // when unset) so first-time users get a sensible non-empty value to edit.
  const defaultTimezone = process.env.TZ || 'UTC';
  const timezoneSuggestions = buildTimezoneSuggestions(reminderPreference?.timezone);

  const pendingDeletion = await prisma.accountDeletionRequest.findUnique({
    where: { userId: session.user.id },
    select: { scheduledFor: true, status: true },
  });
  const isDeletionPending = pendingDeletion?.status === 'PENDING';

  // DELETION_PENDING users see ONLY the cancel banner — every other
  // settings surface is hidden so they cannot create or mutate data
  // post-export that the cron would later silently delete. Mutation
  // server actions still have their own DB-driven status guards (the
  // service layer rejects on next jwt-callback refresh), but hiding
  // the UI is the more defensive layer.
  if (isDeletionPending && pendingDeletion) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6 animate-page-enter">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Settings</h1>
        <CancelDeletionBanner
          action={cancelDeletionAction}
          scheduledForISO={pendingDeletion.scheduledFor.toISOString()}
        />
        <p className="text-sm text-muted-foreground">
          Other settings are temporarily disabled while your account is scheduled for deletion. Cancel the deletion above to restore full access.
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-8 animate-page-enter">
      <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Settings</h1>

      <section aria-labelledby="reminders-heading" className="rounded-xl border border-border bg-card text-card-foreground p-6 shadow-sm">
        <h2 id="reminders-heading" className="text-base font-semibold text-foreground mb-1">Dose reminders</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Choose when to be reminded about today&apos;s doses and how the reminder reaches you.
        </p>
        <RemindersForm
          action={updateReminderPreferencesAction}
          initial={reminderPreference}
          defaultTimezone={defaultTimezone}
          timezoneSuggestions={timezoneSuggestions}
        />
        <div className="mt-6 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-foreground/90 mb-2">Web push on this device</h3>
          <PushSubscriptionPanel />
        </div>
      </section>

      <section aria-labelledby="syringe-prefs-heading" className="rounded-xl border border-border bg-card text-card-foreground p-6 shadow-sm">
        <h2 id="syringe-prefs-heading" className="text-base font-semibold text-foreground mb-1">Syringe preferences</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Set the default syringe used to calculate dose units across the app.
        </p>
        <SyringePreferencesForm
          initialSyringeStandard={syringeStandard}
          initialSyringeSize={syringeSize}
        />
      </section>

      <section aria-labelledby="data-export-heading" className="rounded-xl border border-border bg-card text-card-foreground p-6 shadow-sm">
        <h2 id="data-export-heading" className="text-base font-semibold text-foreground mb-1">Your data</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Request a full JSON export of your account data — protocols, dose logs, vials, orders, outcomes, and your full audit history. The export is emailed to you as an attachment.
        </p>
        <RequestExportButton action={requestExportAction} userEmail={session.user.email ?? ''} />
      </section>

      {!isOrderingDisabled() && (
        <section aria-labelledby="ordering-heading" className="rounded-xl border border-border bg-card text-card-foreground p-6 shadow-sm">
          <h2 id="ordering-heading" className="text-base font-semibold text-foreground mb-1">Ordering</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Connect your Telegram account to automate vendor ordering.
          </p>
          <Link
            href="/settings/telegram"
            className="inline-flex min-h-9 items-center rounded-md px-1 text-sm text-primary hover:bg-primary/10"
          >
            Manage Telegram setup →
          </Link>
        </section>
      )}

      <section
        aria-labelledby="delete-account-heading"
        className="rounded-lg border border-destructive/30 bg-destructive/10 p-5"
      >
        <h2 id="delete-account-heading" className="text-sm font-semibold text-destructive mb-1">
          Danger zone
        </h2>
        <DeleteAccountSection
          scheduleAction={scheduleDeletionAction}
          immediateAction={deleteImmediatelyAction}
          userEmail={session.user.email ?? ''}
        />
      </section>
    </main>
  );
}
