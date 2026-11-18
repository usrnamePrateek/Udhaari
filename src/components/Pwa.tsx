import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { dismiss, useInstall, wasDismissed } from '../lib/install';

/** Bottom banner shown when a new version has been downloaded. */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Check for a new version every hour and whenever the app comes back to the foreground.
      if (!reg) return;
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    },
  });

  if (!needRefresh) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-slate-900 p-3 pl-4 text-white shadow-xl">
        <span className="flex-1 text-sm">A new version of Udhaari is available.</span>
        <button className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white" onClick={() => setNeedRefresh(false)}>
          Later
        </button>
        <button className="rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-teal-400" onClick={() => updateServiceWorker(true)}>
          Update
        </button>
      </div>
    </div>
  );
}

/** Card on the home screen inviting the user to install. Dismissable for 2 weeks. */
export function InstallCard() {
  const inst = useInstall();
  const [hidden, setHidden] = useState(wasDismissed);
  if (!inst.available || hidden) return null;
  return (
    <div className="card mb-4 flex items-center gap-3 p-4">
      <img src="/icon-192.png" alt="" className="h-11 w-11 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Install Udhaari</div>
        <div className="text-xs text-slate-500">Open it from your home screen, even offline.</div>
      </div>
      <button className="text-sm text-slate-400" onClick={() => { dismiss(); setHidden(true); }}>Not now</button>
      <InstallButton compact />
    </div>
  );
}

/** Install button: native prompt where supported, instructions sheet on iOS. */
export function InstallButton({ compact = false }: { compact?: boolean }) {
  const inst = useInstall();
  const [showIOS, setShowIOS] = useState(false);
  if (!inst.available) return null;

  return (
    <>
      <button
        className={compact ? 'rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white' : 'btn-primary w-full'}
        onClick={() => (inst.canPrompt ? inst.install() : setShowIOS(true))}
      >
        Install{compact ? '' : ' app'}
      </button>
      {showIOS && <IOSInstructions onClose={() => setShowIOS(false)} />}
    </>
  );
}

function IOSInstructions({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div className="mx-auto w-full max-w-xl rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-slate-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-bold">Install on iPhone / iPad</h2>
        <ol className="flex flex-col gap-4 text-sm">
          <li className="flex items-center gap-3">
            <Step n={1} />
            <span>
              Open this page in <b>Safari</b>, then tap the <b>Share</b> button
              <svg className="mx-1 inline align-text-bottom text-sky-600" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v13M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>
              in the toolbar.
            </span>
          </li>
          <li className="flex items-center gap-3"><Step n={2} /><span>Scroll down and tap <b>Add to Home Screen</b>.</span></li>
          <li className="flex items-center gap-3"><Step n={3} /><span>Tap <b>Add</b>. Udhaari now opens from your home screen like an app.</span></li>
        </ol>
        <button className="btn-ghost mt-6 w-full" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

const Step = ({ n }: { n: number }) => (
  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-100 font-bold text-teal-800">{n}</span>
);
