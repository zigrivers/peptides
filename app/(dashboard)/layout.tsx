import { PWARegistry } from './_components/PWARegistry';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="fixed bottom-4 right-4 z-50">
        <PWARegistry />
      </div>
      {children}
    </div>
  );
}
