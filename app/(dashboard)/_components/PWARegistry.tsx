'use client';

import React, { useEffect } from 'react';
import { SyncIndicator } from './SyncIndicator';

export function PWARegistry() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'development') {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister().then((success) => {
              if (success) {
                console.log('[PWARegistry] Unregistered service worker in development');
                window.location.reload();
              }
            });
          }
        });
      } else {
        navigator.serviceWorker.register('/sw.js').catch(console.error);
      }
    }
  }, []);

  return <SyncIndicator />;
}
