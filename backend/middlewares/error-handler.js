export function apiError(code, safeMessage, status = 400) { return Object.assign(new Error(safeMessage), { code, status, safeMessage }); }
export function errorHandler(error, req, res, _next) {
    void _next;
    if (res.headersSent) {
        res.end();
        return;
    }
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : error.status ?? 500;
    const code = error.type === 'entity.too.large' || error.type === 'entity.parse.failed' ? 'INVALID_INPUT' : error.code ?? 'DEPENDENCY_UNAVAILABLE';
    res.status(status >= 400 && status < 600 ? status : 500).json({ code, safeMessage: error.safeMessage ?? (status === 500 ? 'Backend operation failed.' : 'Request was invalid.'), retryable: status >= 500 });
}
