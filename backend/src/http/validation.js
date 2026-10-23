// @ts-check
import { z } from 'zod';
import { apiError } from '../../middlewares/error-handler.js';
export const uuid = z.string().uuid().transform(value => value.toLowerCase());
export function parse(schema, input) {
    const result = schema.safeParse(input);
    if (!result.success) throw apiError('INVALID_INPUT', 'Input does not match the API contract.');
    return result.data;
}
export function page(query, extra = {}, sequence = false) {
    const value = parse(z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().min(1).max(128).optional(), ...extra }).strict(), query);
    const after = value.cursor ? Buffer.from(value.cursor, 'base64url').toString() : null;
    if (after && (!(sequence ? /^[1-9]\d{0,18}$/.test(after) : uuid.safeParse(after).success) || Buffer.from(after).toString('base64url') !== value.cursor)) throw apiError('INVALID_INPUT', 'Invalid page cursor.');
    return { ...value, after };
}
export function sendResponse(res, response, location) {
    if (response.data.version) res.set('etag', '"' + response.data.version + '"');
    if (location) res.set('location', location);
    res.status(response.status).json({ data: response.data, meta: { requestId: res.locals.requestId, ...(response.data.version ? { version: response.data.version } : {}) } });
}
