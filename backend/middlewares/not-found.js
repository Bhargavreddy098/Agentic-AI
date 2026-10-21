export function notFound(_req, res) { res.status(404).json({ code: 'NOT_FOUND', safeMessage: 'Route not found.', retryable: false }); }
