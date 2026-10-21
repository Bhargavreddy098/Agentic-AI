import { rateLimit } from 'express-rate-limit';
export function requestRateLimit() { return rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => res.status(429).json({ code: 'RATE_LIMITED', safeMessage: 'Too many requests.', retryable: true }) }); }
