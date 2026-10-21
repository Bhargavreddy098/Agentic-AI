import { apiError } from './error-handler.js';
export function validate(schema, value) { const parsed = schema.safeParse(value); if (!parsed.success)
    throw apiError('INVALID_INPUT', 'Request was invalid.'); return parsed.data; }
