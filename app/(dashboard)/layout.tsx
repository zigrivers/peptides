'use client';

import { useEffect } from 'react';
import { SyncIndicator } from './_components/SyncIndicator';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="fixed bottom-4 right-4 z-50">
        <SyncIndicator />
      </div>
      {children}
    </div>
  );
}
