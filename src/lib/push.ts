import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { isIOS, isStandalone } from './install';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushSupport = 'supported' | 'needs-install' | 'unsupported' | 'not-configured';
export type PushState = 'on' | 'off' | 'denied';

export function pushSupport(): PushSupport {
  if (!VAPID_PUBLIC_KEY) return 'not-configured';
  // iOS only allows web push for apps added to the home screen (iOS 16.4+).
  if (isIOS && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'supported';
}

/** The active service worker registration, or null if none shows up (e.g. `vite dev`). */
async function registration(timeoutMs = 4000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

export async function getPushState(): Promise<PushState> {
  if (pushSupport() !== 'supported') return 'off';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

async function saveSubscription(sub: PushSubscription) {
  const j = sub.toJSON();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: j.endpoint,
    p_p256dh: j.keys?.p256dh,
    p_auth: j.keys?.auth,
    p_user_agent: navigator.userAgent.slice(0, 300),
  });
  if (error) throw error;
}

export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'off';

  const reg = await registration();
  if (!reg) throw new Error('The app is still setting up offline support. Reload and try again.');

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY!),
    });
  }
  await saveSubscription(sub);
  return 'on';
}

export async function disablePush(): Promise<void> {
  const reg = await registration(1500);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

/** On app start: re-save this device's subscription so the server always has the current one. */
export async function syncPushSubscription(): Promise<void> {
  if (pushSupport() !== 'supported' || Notification.permission !== 'granted') return;
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await saveSubscription(sub);
}

export function usePush() {
  const support = pushSupport();
  const [state, setState] = useState<PushState | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    getPushState().then(setState, () => setState('off'));
  }, []);

  const run = useCallback(async (fn: () => Promise<PushState | void>, after?: PushState) => {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      setState(result ?? after ?? 'off');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    support,
    state,
    busy,
    error,
    enable: () => run(enablePush),
    disable: () => run(disablePush, 'off'),
  };
}

function base64UrlToBytes(base64Url: string): ArrayBuffer {
  const padded = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}
