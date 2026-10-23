export function healthController(readiness) {
    return {
        live: (_req, res) => res.json({ status: 'ok', service: 'asi-express-backend' }),
        ready: async (_req, res) => { let state = { postgres: false, vector: false }; try {
            state = await readiness();
        }
        catch { /* Readiness never leaks driver errors. */ }
            const ready = state.postgres === true && state.vector === true && state.schemas === true
                && state.migrations === true && state.runtimeRole === true;
            res.status(ready ? 200 : 503).json({ ...state, status: ready ? 'ready' : 'unavailable' });
        },
    };
}
