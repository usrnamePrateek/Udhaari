import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useSession } from './hooks/useSession';
import { useRealtime } from './hooks/useRealtime';
import { supabaseConfigured } from './lib/supabase';
import { Spinner } from './components/Layout';
import { UpdateBanner } from './components/Pwa';
import Login from './screens/Login';
import Home from './screens/Home';
import LedgerView from './screens/LedgerView';
import EntryForm from './screens/EntryForm';
import InviteAccept from './screens/InviteAccept';
import Profile from './screens/Profile';

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}

export default function App() {
  useRealtime();
  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-md p-6 text-sm">
        <h1 className="mb-2 text-xl font-bold">Setup needed</h1>
        Copy <code>.env.example</code> to <code>.env</code>, fill in your Supabase URL and anon key, then restart <code>npm run dev</code>.
      </div>
    );
  }
  return (
    <>
    <UpdateBanner />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
      <Route path="/me" element={<RequireAuth><Profile /></RequireAuth>} />
      <Route path="/l/:id" element={<RequireAuth><LedgerView /></RequireAuth>} />
      <Route path="/l/:id/new" element={<RequireAuth><EntryForm /></RequireAuth>} />
      <Route path="/l/:id/e/:entryId" element={<RequireAuth><EntryForm /></RequireAuth>} />
      <Route path="/invite/:token" element={<RequireAuth><InviteAccept /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
