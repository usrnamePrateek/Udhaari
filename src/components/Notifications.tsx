import { useState } from 'react';
import { usePush } from '../lib/push';
import { dismiss, wasDismissed } from '../lib/install';
import { ErrorBox } from './Layout';
import { InstallButton } from './Pwa';

const DISMISS_KEY = 'udhaari-push-dismissed';

const BellIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 003.4 0" />
  </svg>
);

/** Settings block for the Profile screen. */
export function NotificationsToggle() {
  const push = usePush();
  if (push.support === 'not-configured') return null;

  let body;
  if (push.support === 'needs-install') {
    body = (
      <>
        <p className="text-sm text-slate-500">On iPhone, notifications only work after you add Udhaari to your home screen.</p>
        <InstallButton label="Install Udhaari" subtle />
      </>
    );
  } else if (push.support === 'unsupported') {
    body = <p className="text-sm text-slate-500">This browser doesn't support notifications.</p>;
  } else if (push.state === 'denied') {
    body = (
      <p className="text-sm text-slate-500">
        Notifications are blocked. Allow them for this site in your browser or phone settings, then come back here.
      </p>
    );
  } else if (push.state === 'on') {
    body = (
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm text-emerald-700">On for this device</p>
        <button className="btn-ghost py-2" onClick={push.disable} disabled={push.busy}>
          {push.busy ? 'Turning off…' : 'Turn off'}
        </button>
      </div>
    );
  } else {
    body = (
      <button className="btn-primary w-full" onClick={push.enable} disabled={push.busy || push.state === 'loading'}>
        {push.busy ? 'Turning on…' : 'Turn on notifications'}
      </button>
    );
  }

  return (
    <div className="card mt-6 flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2 font-semibold"><BellIcon /> Notifications</div>
      <p className="text-sm text-slate-500">Get a notification when the other person adds, edits or deletes an entry.</p>
      {body}
      <ErrorBox error={push.error} />
    </div>
  );
}

/** Dismissible nudge on the Home screen, shown only when push can be turned on right now. */
export function NotificationsCard() {
  const push = usePush();
  const [hidden, setHidden] = useState(() => wasDismissed(DISMISS_KEY));
  if (hidden || push.support !== 'supported' || push.state !== 'off') return null;

  return (
    <div className="card mb-4 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-800"><BellIcon /></div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Turn on notifications</div>
          <div className="text-xs text-slate-500">Know when someone adds or changes an entry.</div>
        </div>
        <button className="text-sm text-slate-400" onClick={() => { dismiss(DISMISS_KEY); setHidden(true); }}>Not now</button>
        <button className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white" onClick={push.enable} disabled={push.busy}>
          {push.busy ? '…' : 'Turn on'}
        </button>
      </div>
      <ErrorBox error={push.error} />
    </div>
  );
}
