import { PWARegistry } from './_components/PWARegistry';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // DELETION_PENDING users are redirected to /settings by middleware
  // (which reads `status` from the JWT) before this layout renders.
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="fixed bottom-4 right-4 z-50">
        <PWARegistry />
      </div>
      {children}
    </div>
  );
}
