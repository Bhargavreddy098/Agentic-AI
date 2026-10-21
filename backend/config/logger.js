import pino from 'pino';
export function createLogger(options = {}, destination = undefined) {
    return pino({ level: 'info', redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie', 'password', 'credential', 'apiKey', 'DATABASE_URL', 'body', 'req.body'], censor: '[REDACTED]' }, ...options }, destination);
}
