// @ts-check

/**
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 */
export function notFound(_req, res) {
    const requestId = String(res.getHeader('x-request-id') ?? '');
    res
        .status(404)
        .type('application/problem+json')
        .json({
            type: 'https://asi.local/problems/not-found',
            title: 'NOT_FOUND',
            status: 404,
            detail: 'Route not found.',
            code: 'NOT_FOUND',
            safeMessage: 'Route not found.',
            retryable: false,
            requestId,
        });
}

