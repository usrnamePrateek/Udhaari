import { useSyncExternalStore } from 'react';

/** Chrome/Edge/Android fire this when the app is installable. Captured as early as possible. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // keep it for our own button
  deferred = e as BeforeInstallPromptEvent;
  emit();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  installed = true;
  emit();
});

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const ua = navigator.userAgent;
// iPadOS reports itself as Mac; detect touch to tell them apart.
export const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

type State = { canPrompt: boolean; isInstalled: boolean };
let snapshot: State = { canPrompt: false, isInstalled: isStandalone() };
function getSnapshot(): State {
  const next = { canPrompt: deferred !== null, isInstalled: installed || isStandalone() };
  if (next.canPrompt !== snapshot.canPrompt || next.isInstalled !== snapshot.isInstalled) snapshot = next;
  return snapshot;
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useInstall() {
  const { canPrompt, isInstalled } = useSyncExternalStore(subscribe, getSnapshot);
  return {
    isInstalled,
    /** Native install dialog available (Android / desktop Chrome, Edge). */
    canPrompt,
    /** iOS has no prompt; we show Add-to-Home-Screen instructions instead. */
    needsIOSInstructions: isIOS && !isInstalled,
    available: !isInstalled && (canPrompt || isIOS),
    async install() {
      if (!deferred) return false;
      const e = deferred;
      deferred = null;
      emit();
      await e.prompt();
      const { outcome } = await e.userChoice;
      return outcome === 'accepted';
    },
  };
}

const DISMISS_KEY = 'udhaari-install-dismissed';
/** Was this prompt dismissed in the last 2 weeks? `key` lets other prompts reuse this. */
export function wasDismissed(key = DISMISS_KEY): boolean {
  try {
    const t = Number(localStorage.getItem(key) || 0);
    return Date.now() - t < 1000 * 60 * 60 * 24 * 14; // hide for 2 weeks
  } catch {
    return false;
  }
}
export function dismiss(key = DISMISS_KEY) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* storage unavailable: fine, it'll just show again */
  }
}
