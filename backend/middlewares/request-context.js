import { randomUUID } from 'node:crypto';
export function requestContext(req, res, next) {
    res.locals.requestId = randomUUID();
    res.setHeader('x-request-id', res.locals.requestId);
    next();
}
