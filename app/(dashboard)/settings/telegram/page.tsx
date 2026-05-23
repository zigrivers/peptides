import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getSessionStatus } from '@/lib/ordering/application/TelegramAuthService';
import { isOrderingDisabled } from '@/lib/shared/featureFlags';
import { TelegramSetupForm } from './_components/TelegramSetupForm';

export default async function TelegramSettingsPage() {
  // ADR-015 / US-ORD-08: Telegram setup is exclusively the ordering-message
  // transport. When ordering is disabled, this route should not exist.
  if (isOrderingDisabled()) notFound();

  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { linked } = await getSessionStatus(session.user.id);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Telegram Setup</h1>
        <p className="text-sm text-gray-500 mt-1">
          Link your Telegram account so the app can send order messages directly to vendors.
        </p>
      </div>

      <TelegramSetupForm linked={linked} />

      <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-xs font-medium text-gray-700 mb-1">Manual fallback — always available</p>
        <p className="text-xs text-gray-500">
          Every order generates a composed message you can copy and paste into Telegram manually.
          Automation is optional — you can always order without linking your account.
        </p>
      </div>
    </main>
  );
}
