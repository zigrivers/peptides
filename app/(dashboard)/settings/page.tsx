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
  // Server-side default timezone falls back to the deployment's TZ env (or 'UTC'
  // when unset) so first-time users get a sensible non-empty value to edit.
  const defaultTimezone = process.env.TZ || 'UTC';
  const timezoneSuggestions = buildTimezoneSuggestions(reminderPreference?.timezone);

  const pendingDeletion = await prisma.accountDeletionRequest.findUnique({
    where: { userId: session.user.id },
    select: { scheduledFor: true, status: true },
  });
  const isDeletionPending = pendingDeletion?.status === 'PENDING';

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>

      {isDeletionPending && pendingDeletion && (
        <CancelDeletionBanner
          action={cancelDeletionAction}
          scheduledFor={pendingDeletion.scheduledFor}
        />
      )}

      <section aria-labelledby="reminders-heading" className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 id="reminders-heading" className="text-sm font-semibold text-gray-900 mb-1">Dose reminders</h2>
        <p className="text-sm text-gray-600 mb-4">
          Choose when to be reminded about today&apos;s doses and how the reminder reaches you.
        </p>
        <RemindersForm
          action={updateReminderPreferencesAction}
          initial={reminderPreference}
          defaultTimezone={defaultTimezone}
          timezoneSuggestions={timezoneSuggestions}
        />
        <div className="mt-6 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Web push on this device</h3>
          <PushSubscriptionPanel />
        </div>
      </section>

      <section aria-labelledby="data-export-heading" className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 id="data-export-heading" className="text-sm font-semibold text-gray-900 mb-1">Your data</h2>
        <p className="text-sm text-gray-600 mb-4">
          Request a full JSON export of your account data — protocols, dose logs, vials, orders, outcomes, and your full audit history. The export is emailed to you as an attachment.
        </p>
        <RequestExportButton action={requestExportAction} userEmail={session.user.email ?? ''} />
      </section>

      {!isOrderingDisabled() && (
        <section aria-labelledby="ordering-heading" className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 id="ordering-heading" className="text-sm font-semibold text-gray-900 mb-1">Ordering</h2>
          <p className="text-sm text-gray-600 mb-4">
            Connect your Telegram account to automate vendor ordering.
          </p>
          <Link href="/settings/telegram" className="text-sm text-indigo-600 hover:underline">
            Manage Telegram setup →
          </Link>
        </section>
      )}

      {!isDeletionPending && (
        <section
          aria-labelledby="delete-account-heading"
          className="rounded-lg border border-red-200 bg-red-50/30 p-5"
        >
          <h2 id="delete-account-heading" className="text-sm font-semibold text-red-900 mb-1">
            Danger zone
          </h2>
          <DeleteAccountSection
            scheduleAction={scheduleDeletionAction}
            immediateAction={deleteImmediatelyAction}
            userEmail={session.user.email ?? ''}
          />
        </section>
      )}
    </main>
  );
}
