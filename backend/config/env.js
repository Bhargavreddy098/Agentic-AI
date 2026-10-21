import { z } from 'zod';
const Environment = z.object({
    DATABASE_URL: z.string().url().refine(value => /^postgres(?:ql)?:/.test(value)),
    PORT: z.coerce.number().int().min(1).max(65535).default(4400),
    HOST: z.enum(['127.0.0.1', '::1']).default('127.0.0.1'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(30).default(5),
    DATABASE_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),
    ASI_ALLOWED_ORIGINS: z.string().default('http://127.0.0.1:3200,http://127.0.0.1:3000,http://127.0.0.1:3100'),
});
/** @param {NodeJS.ProcessEnv} env */
export function loadConfig(env = process.env) {
    const parsed = Environment.safeParse(env);
    if (!parsed.success)
        throw new Error('Invalid backend configuration: ' + parsed.error.issues.map(issue => issue.path.join('.')).join(', '));
    const value = parsed.data;
    const allowedOrigins = value.ASI_ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean);
    for (const origin of allowedOrigins) {
        const url = new URL(origin);
        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin)
            throw new Error('Invalid allowed origin');
    }
    return { ...value, allowedOrigins };
}
