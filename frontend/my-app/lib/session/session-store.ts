export type SessionView = { principalId: string; workspaceId: string; expiresAt: string; csrfToken: string };

type SessionState = { session: SessionView | null; status: 'unknown' | 'connected' | 'disconnected' };

export function createSessionStore({ transport = fetch }: { transport?: typeof fetch; storage?: Storage } = {}) {
  let state: SessionState = { session: null, status: 'unknown' };

  const listeners=new Set<()=>void>();
  const publish=(next:SessionState)=>{state=next;for(const listener of listeners)listener();};
  return {
    subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    get() {
      return state;
    },
    async recover() {
      try {
        const res = await transport('/api/v1/session', { credentials: 'include', cache: 'no-store' });
        if (res.status === 401) {
          publish({ session: null, status: 'disconnected' });
          return;
        }
        if (!res.ok) {
          publish({ session: null, status: 'disconnected' });
          return;
        }
        const body = await res.json();
        const data = body?.data || body;
        publish({ session: data as SessionView, status: 'connected' });
      } catch {
        publish({ session: null, status: 'disconnected' });
      }
    },
    async bootstrap(challenge: string, clientNonce: string) {
      const res = await transport('/api/v1/session/bootstrap', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge, clientNonce })
      });
      if (!res.ok) throw new Error('bootstrap failed');
      const body = await res.json();
      const data = body?.data || body;
      publish({ session: data as SessionView, status: 'connected' });
    },
    async revoke() {
      if (!state.session) return;
      const res = await transport('/api/v1/session', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRF-Token': state.session.csrfToken, 'Idempotency-Key': crypto.randomUUID() }
      });
      if (!res.ok && res.status !== 401) throw new Error('Session revocation failed');
      publish({ session: null, status: 'disconnected' });
    },
    handleUnauthorized() {
      publish({ session: null, status: 'disconnected' });
    }
  };
}
