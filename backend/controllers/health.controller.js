export function healthController(readiness, compatibility = false) {
    return {
        live: (_req, res) => res.json(compatibility ? { status: 'ok', service: 'asi-express-backend' } : { status: 'live' }),
        ready: async (_req, res) => { let state = { postgres: false, vector: false }; try {
            state = await readiness();
        }
        catch { /* Readiness never leaks driver errors. */ }
            const ready = state.postgres === true && state.vector === true && state.schemas === true
                && state.migrations === true && state.runtimeRole === true && res.app?.locals?.shuttingDown !== true;
            res.status(ready ? 200 : 503).json(compatibility ? { ...state, status: ready ? 'ready' : 'unavailable' } : { ready });
        },
    };
}
