'use client';

import { useCallback, useEffect, useState } from 'react';
import { registerPushSubscriptionAction } from '@/app/actions/notifications/register-push-subscription';
import { removePushSubscriptionAction } from '@/app/actions/notifications/remove-push-subscription';
import { setPushPermissionStateAction } from '@/app/actions/notifications/set-push-permission-state';
import type { PushPermissionState } from '@/lib/notifications/domain/types';

type SubscriptionState =
  | { kind: 'loading' }
  | { kind: 'unsupported' }
  | { kind: 'ios-install-required' }
  | { kind: 'vapid-missing' }
  | { kind: 'ready'; permission: PushPermissionState; subscribed: boolean };

function detectIosNeedsInstall(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  if (!isIos) return false;
  const standalone =
    'standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone;
  return !standalone;
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function PushSubscriptionPanel() {
  const [state, setState] = useState<SubscriptionState>({ kind: 'loading' });
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState({ kind: 'unsupported' });
      return;
    }
    if (detectIosNeedsInstall()) {
      setState({ kind: 'ios-install-required' });
      return;
    }
    let key = vapidKey;
    if (!key) {
      try {
        const res = await fetch('/api/notifications/vapid-public-key');
        if (!res.ok) {
          setState({ kind: 'vapid-missing' });
          return;
        }
        const data = (await res.json()) as { publicKey?: string };
        if (!data.publicKey) {
          setState({ kind: 'vapid-missing' });
          return;
        }
        key = data.publicKey;
        setVapidKey(key);
      } catch {
        setState({ kind: 'vapid-missing' });
        return;
      }
    }
    const permission = (Notification.permission === 'granted'
      ? 'GRANTED'
      : Notification.permission === 'denied'
        ? 'DENIED'
        : 'NOT_PROMPTED') as PushPermissionState;
    let subscribed = false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      subscribed = sub !== null;
    } catch {
      subscribed = false;
    }
    setState({ kind: 'ready', permission, subscribed });
  }, [vapidKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enablePush = useCallback(async () => {
    setError(null);
    setWorking(true);
    try {
      if (!vapidKey) throw new Error('vapid_missing');
      const permission = await Notification.requestPermission();
      const stateValue: PushPermissionState =
        permission === 'granted' ? 'GRANTED' : permission === 'denied' ? 'DENIED' : 'NOT_PROMPTED';
      const stateRes = await setPushPermissionStateAction(stateValue);
      if (!stateRes.ok) throw new Error(stateRes.error ?? 'state_failed');
      if (permission !== 'granted') {
        await refresh();
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      // Allocate a fresh ArrayBuffer-backed Uint8Array so the type matches
      // PushManager.subscribe()'s BufferSource expectation (some TS lib
      // versions reject Uint8Array<ArrayBufferLike>).
      const keyBytes = base64UrlToUint8Array(vapidKey);
      const keyBuffer = new ArrayBuffer(keyBytes.byteLength);
      new Uint8Array(keyBuffer).set(keyBytes);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBuffer,
      });
      const p256dhBuf = sub.getKey('p256dh');
      const authBuf = sub.getKey('auth');
      if (!p256dhBuf || !authBuf) throw new Error('keys_missing');
      const result = await registerPushSubscriptionAction({
        endpoint: sub.endpoint,
        p256dh: arrayBufferToBase64Url(p256dhBuf),
        auth: arrayBufferToBase64Url(authBuf),
      });
      if (!result.ok) throw new Error(result.error ?? 'register_failed');
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      setError(translateError(msg));
    } finally {
      setWorking(false);
    }
  }, [refresh, vapidKey]);

  const disablePush = useCallback(async () => {
    setError(null);
    setWorking(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      setError(translateError(msg));
    } finally {
      setWorking(false);
    }
  }, [refresh]);

  if (state.kind === 'loading') {
    return <p className="text-sm text-gray-500">Checking push notification support…</p>;
  }
  if (state.kind === 'unsupported') {
    return (
      <p className="text-sm text-gray-600">
        Your browser doesn&apos;t support web push. Email reminders will be used.
      </p>
    );
  }
  if (state.kind === 'ios-install-required') {
    return (
      <p className="text-sm text-gray-600">
        Web push on iOS requires installing the app to your home screen first. Open the share menu in Safari and tap &quot;Add to Home Screen&quot;.
      </p>
    );
  }
  if (state.kind === 'vapid-missing') {
    return (
      <p className="text-sm text-gray-600">
        Web push is not configured on this server. Reminders will be delivered by email.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-700">
        Push permission: <strong className="text-gray-900">{state.permission}</strong>
      </p>
      {state.subscribed ? (
        <button
          type="button"
          onClick={disablePush}
          disabled={working}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {working ? 'Disabling…' : 'Disable push on this device'}
        </button>
      ) : (
        <button
          type="button"
          onClick={enablePush}
          disabled={working || state.permission === 'DENIED'}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {working ? 'Enabling…' : 'Enable push on this device'}
        </button>
      )}
      {state.permission === 'DENIED' && (
        <p className="text-xs text-gray-500">
          Notifications were blocked in your browser settings. Re-enable them there to use push.
        </p>
      )}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}
    </div>
  );
}

function translateError(code: string): string {
  switch (code) {
    case 'endpoint_owned_by_another_user':
      return 'This device is registered to a different account. Sign out there first.';
    case 'invalid_subscription':
      return 'The subscription details from your browser were invalid. Try refreshing the page.';
    case 'unauthorized':
      return 'Your session expired. Please sign in again.';
    default:
      return 'Could not change push subscription. Please try again.';
  }
}
