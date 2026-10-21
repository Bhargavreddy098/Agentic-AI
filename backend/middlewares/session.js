import { SESSION_COOKIE } from '@asi/gateway/ui';
import { apiError } from './error-handler.js';
export function requireSession(sessions) {
    return (req, res, next) => {
        const session = sessions.get(req.cookies?.[SESSION_COOKIE]);
        if (!session)
            return next(apiError('UNAUTHENTICATED', 'A local application session is required.', 401));
        res.locals.session = session;
        next();
    };
}
