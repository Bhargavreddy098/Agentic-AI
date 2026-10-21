export function healthController(readiness) {
    return {
        live: (_req, res) => res.json({ status: 'ok', service: 'asi-express-backend' }),
        ready: async (_req, res) => { let state = { postgres: false, vector: false }; try {
            state = await readiness();
        }
        catch { /* Readiness never leaks driver errors. */ } res.status(state.postgres && state.vector ? 200 : 503).json({ status: state.postgres && state.vector ? 'ready' : 'unavailable', ...state }); },
    };
}
