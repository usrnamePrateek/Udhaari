import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import './lib/install'; // capture beforeinstallprompt before React mounts
import { persister, queryClient } from './lib/queryClient';
import { SessionProvider } from './hooks/useSession';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 7 }}
      // Replay any entries saved while offline (restored from IndexedDB).
      onSuccess={() => queryClient.resumePausedMutations()}
    >
      <SessionProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </SessionProvider>
    </PersistQueryClientProvider>
  </React.StrictMode>,
);
