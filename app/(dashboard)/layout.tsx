import { auth } from '@/lib/auth';
import { getDueTodayForBatch } from '@/lib/tracker/application/BatchLogService';
import { isOrderingDisabled } from '@/lib/shared/featureFlags';
import { DashboardNav } from './_components/DashboardNav';
import { PWARegistry } from './_components/PWARegistry';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = session?.user?.id;

  let hasUnloggedDoses = false;
  if (userId) {
    try {
      const dueToday = await getDueTodayForBatch(userId);
      hasUnloggedDoses = dueToday.some((item) => !item.existingLog);
    } catch (e) {
      console.error('Failed to get due doses for navbar pulse:', e);
    }
  }

  const orderingEnabled = !isOrderingDisabled();

  return (
    <div
      className="min-h-screen bg-background text-foreground flex flex-col sm:flex-row"
      style={{ '--mobile-header-height': '3.5rem' } as React.CSSProperties}
    >
      <DashboardNav orderingEnabled={orderingEnabled} hasUnloggedDoses={hasUnloggedDoses} />
      
      <div className="flex-1 flex flex-col min-w-0 pt-[var(--mobile-header-height)] pb-24 sm:pt-0 sm:pb-0 sm:pl-16 lg:pl-64">
        <div className="fixed bottom-20 right-4 z-50 sm:hidden">
          <PWARegistry />
        </div>
        <div className="flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
