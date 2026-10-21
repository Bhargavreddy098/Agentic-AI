import { SESSION_COOKIE, projectSession } from '@asi/gateway/ui';
import { apiError } from '../middlewares/error-handler.js';
export function sessionController({ services, sessions, config, limits }) {
    return {
        async create(req, res) {
            const assertion = req.body?.assertion;
            if (typeof assertion !== 'string' || !assertion || assertion.length > 8192)
                throw apiError('INVALID_INPUT', 'A session assertion is required.');
            const principal = await services.auth?.verifyAssertion(assertion);
            if (!principal)
                throw apiError('UNAUTHENTICATED', 'Session assertion was rejected.', 401);
            const session = sessions.create(principal);
            res.cookie(SESSION_COOKIE, session.sessionId, { httpOnly: true, sameSite: 'lax', secure: config.secureCookies ?? false, path: '/' });
            res.json({ workspaceId: principal.workspaceId, subjectId: principal.subjectId, csrfToken: session.csrfToken });
        },
        remove(req, res) { sessions.revoke(req.cookies?.[SESSION_COOKIE]); res.clearCookie(SESSION_COOKIE, { path: '/' }); res.json({ ok: true }); },
        me(_req, res) { const { principal, csrfToken } = res.locals.session; res.json(projectSession(principal, csrfToken, limits)); },
    };
}
