import { isOrderingDisabled } from '@/lib/shared/featureFlags';
import { DashboardNav } from './_components/DashboardNav';
import { PWARegistry } from './_components/PWARegistry';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const orderingEnabled = !isOrderingDisabled();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col sm:flex-row">
      <DashboardNav orderingEnabled={orderingEnabled} />
      
      <div className="flex-1 flex flex-col min-w-0 pb-16 sm:pb-0 sm:pl-16 lg:pl-64">
        <div className="fixed bottom-20 sm:bottom-4 right-4 z-50">
          <PWARegistry />
        </div>
        <div className="flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
