'use client';

import { useEffect } from 'react';
import { SyncIndicator } from './SyncIndicator';

export function PWARegistry() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
  }, []);

  return <SyncIndicator />;
}
