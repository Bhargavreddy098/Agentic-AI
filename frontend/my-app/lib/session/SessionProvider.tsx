"use client";

import { createContext, useContext, useEffect, useState } from 'react';
import { createSessionStore, type SessionView } from './session-store';

type SessionState = { session: SessionView | null; status: 'unknown' | 'connected' | 'disconnected' };

const SessionContext = createContext<ReturnType<typeof createSessionStore> | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createSessionStore());
  const [state, setState] = useState<SessionState>(store.get());

  useEffect(() => {
    store.recover().then(() => setState(store.get()));
  }, [store]);

  return <SessionContext.Provider value={store}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const store = useContext(SessionContext);
  if (!store) throw new Error('useSession must be used within SessionProvider');
  const [state, setState] = useState(store.get());
  useEffect(() => {
    const interval = setInterval(() => setState(store.get()), 1000);
    return () => clearInterval(interval);
  }, [store]);
  return { session: state.session, status: state.status, ...store };
}
