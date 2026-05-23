import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { isOrderingDisabled } from '@/lib/shared/featureFlags';
import { requestExportAction } from '@/app/actions/account/request-export';
import { RequestExportButton } from './_components/RequestExportButton';

/**
 * Account settings index. Surfaces the data-export request button (Task 6.2,
 * Phase 2 Legal Gate item 3) and links to other settings sub-pages.
 */
export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>

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
    </main>
  );
}
