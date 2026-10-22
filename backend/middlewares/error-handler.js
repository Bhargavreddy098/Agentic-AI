// @ts-check

/**
 * Create a safe API error with explicit status and machine code.
 * @param {string} code
 * @param {string} safeMessage
 * @param {number} [status=400]
 */
export function apiError(code, safeMessage, status = 400) {
    return Object.assign(new Error(safeMessage), { code, status, safeMessage });
}

/**
 * @param {any} error
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(error, _req, res, _next) {
    void _next;
    if (res.headersSent) {
        res.end();
        return;
    }
    const rawStatus =
        error?.type === 'entity.too.large'
            ? 413
            : error?.type === 'entity.parse.failed'
              ? 400
              : error?.status ?? 500;
    const status = rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
    const code =
        error?.type === 'entity.too.large' || error?.type === 'entity.parse.failed'
            ? 'INVALID_INPUT'
            : error?.code ?? 'DEPENDENCY_UNAVAILABLE';
    const safeMessage =
        error?.safeMessage ??
        (status === 500 ? 'Backend operation failed.' : 'Request was invalid.');
    const requestId = String(res.getHeader('x-request-id') ?? '');

    res
        .status(status)
        .type('application/problem+json')
        .json({
            type: `https://asi.local/problems/${String(code).toLowerCase().replace(/_/g, '-')}`,
            title: String(code),
            status,
            detail: safeMessage,
            code,
            safeMessage,
            retryable: status >= 500,
            requestId,
        });
}

