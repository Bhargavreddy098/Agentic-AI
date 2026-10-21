import { csrfMatches } from '@asi/gateway/ui';
import { apiError } from './error-handler.js';
export function originCsrf(config) {
    return (req, res, next) => {
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method))
            return next();
        const origin = req.get('origin');
        if (!origin || !config.allowedOrigins.includes(origin))
            return next(apiError('POLICY_DENIED', 'Request origin is not allowed.', 403));
        if (!csrfMatches(req.get('x-csrf-token'), res.locals.session.csrfToken))
            return next(apiError('POLICY_DENIED', 'CSRF token is missing or invalid.', 403));
        next();
    };
}
