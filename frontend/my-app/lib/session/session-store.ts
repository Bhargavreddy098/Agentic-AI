export type SessionView = { principalId: string; workspaceId: string; expiresAt: string; csrfToken: string };

type SessionState = { session: SessionView | null; status: 'unknown' | 'connected' | 'disconnected' };

export function createSessionStore({ transport = fetch, storage }: { transport?: typeof fetch; storage?: Storage } = {}) {
  let state: SessionState = { session: null, status: 'unknown' };

  return {
    get() {
      return state;
    },
    async recover() {
      try {
        const res = await transport('/api/v1/session', { credentials: 'include', cache: 'no-store' });
        if (res.status === 401) {
          state = { session: null, status: 'disconnected' };
          return;
        }
        if (!res.ok) {
          state = { session: null, status: 'disconnected' };
          return;
        }
        const body = await res.json();
        const data = body?.data || body;
        state = { session: data as SessionView, status: 'connected' };
      } catch {
        state = { session: null, status: 'disconnected' };
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
      state = { session: data as SessionView, status: 'connected' };
    },
    async revoke() {
      if (!state.session) return;
      await transport('/api/v1/session', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRF-Token': state.session.csrfToken }
      });
      state = { session: null, status: 'disconnected' };
    },
    handleUnauthorized() {
      state = { session: null, status: 'disconnected' };
    }
  };
}
