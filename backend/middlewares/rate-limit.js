import { rateLimit } from 'express-rate-limit';
import { apiError } from './error-handler.js';
export function requestRateLimit() { return rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, _res, next) => next(apiError('RATE_LIMITED', 'Too many requests.', 429)) }); }
