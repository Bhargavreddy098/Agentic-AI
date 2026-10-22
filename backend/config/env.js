// @ts-check
import { z } from 'zod';

const ALLOWED_LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

const Environment = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url().refine(value => /^postgres(?:ql)?:\/\//.test(value)),
    PORT: z.coerce.number().int().min(0).max(65535).default(3000),
    HOST: z.string().trim().min(1).default('127.0.0.1'),
    ASI_ALLOW_REMOTE_BIND: z.enum(['true', 'false']).default('false'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(30).default(5),
    DATABASE_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).max(120000).default(15000),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),
    ASI_ALLOWED_ORIGINS: z.string().default('http://127.0.0.1:3200,http://127.0.0.1:3000,http://127.0.0.1:3100'),
});

/**
 * Resolve and validate backend configuration.
 * Canonical host/port keys are ASI_HOST and ASI_PORT; legacy HOST and PORT
 * remain supported as explicit fallback aliases when ASI_HOST / ASI_PORT are unset.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
export function loadConfig(env = process.env) {
    if (!env || typeof env !== 'object') {
        throw new Error('Invalid backend configuration: environment source required');
    }

    if (env.ASI_HOST && env.HOST && env.ASI_HOST !== env.HOST) {
        throw new Error('Invalid backend configuration: conflicting ASI_HOST and HOST');
    }

    const effectiveHost = env.ASI_HOST ?? env.HOST ?? '127.0.0.1';
    const effectivePort =
        env.ASI_PORT ??
        (env === process.env && env.DEFAULT_APP_PORT && env.PORT === env.NGINX_PORT
            ? env.DEFAULT_APP_PORT
            : env.PORT) ??
        3000;

    const normalizedInput = {
        ...env,
        HOST: effectiveHost,
        PORT: effectivePort,
    };

    const parsed = Environment.safeParse(normalizedInput);
    if (!parsed.success) {
        const fields = [...new Set(parsed.error.issues.map(issue => issue.path.join('.') || 'root'))];
        throw new Error('Invalid backend configuration: ' + fields.join(', '));
    }

    const value = parsed.data;
    if (!ALLOWED_LOOPBACK_HOSTS.has(value.HOST) && value.ASI_ALLOW_REMOTE_BIND !== 'true') {
        throw new Error('Invalid backend configuration: non-loopback ASI_HOST/HOST requires ASI_ALLOW_REMOTE_BIND=true');
    }

    if (value.NODE_ENV === 'production' && value.PORT === 0) {
        throw new Error('Invalid backend configuration: ephemeral PORT=0 is not allowed in production');
    }

    const allowedOrigins = value.ASI_ALLOWED_ORIGINS
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);

    if (allowedOrigins.length === 0) {
        throw new Error('Invalid backend configuration: ASI_ALLOWED_ORIGINS must not be empty');
    }

    for (const origin of allowedOrigins) {
        let url;
        try {
            url = new URL(origin);
        } catch {
            throw new Error('Invalid allowed origin');
        }
        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
            throw new Error('Invalid allowed origin');
        }
    }

    return Object.freeze({
        NODE_ENV: value.NODE_ENV ?? 'development',
        DATABASE_URL: String(value.DATABASE_URL),
        PORT: Number(value.PORT),
        HOST: String(value.HOST),
        ASI_HOST: String(value.HOST),
        ASI_PORT: Number(value.PORT),
        ASI_ALLOW_REMOTE_BIND: value.ASI_ALLOW_REMOTE_BIND ?? 'false',
        DATABASE_POOL_MAX: Number(value.DATABASE_POOL_MAX),
        DATABASE_TIMEOUT_MS: Number(value.DATABASE_TIMEOUT_MS),
        DATABASE_STATEMENT_TIMEOUT_MS: Number(value.DATABASE_STATEMENT_TIMEOUT_MS),
        SHUTDOWN_TIMEOUT_MS: Number(value.SHUTDOWN_TIMEOUT_MS),
        ASI_ALLOWED_ORIGINS: String(value.ASI_ALLOWED_ORIGINS),
        allowedOrigins: Object.freeze(allowedOrigins),
    });
}


