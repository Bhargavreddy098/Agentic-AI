// @ts-check
import { apiError } from '../../../middlewares/error-handler.js';

const SUPPORTED = Object.freeze({ openai: 'OPENAI_API_KEY', openai_compatible: 'OPENAI_COMPATIBLE_API_KEY' });

/**
 * Local-first secret adapter. Credentials remain in the ignored process environment;
 * they are never written to the database, audit records, prompts, or logs.
 * Provider rows with an unqualified secret reference fail closed.
 */
export function createEnvironmentSecrets({ env = process.env } = {}) {
    const valueFor = kind => {
        const name = SUPPORTED[kind];
        const value = name ? env[name] : undefined;
        return typeof value === 'string' && value.trim().length >= 20 ? value.trim() : null;
    };
    return {
        configured(kind) {
            return Boolean(valueFor(kind)) && (kind !== 'openai_compatible' || Boolean(this.compatibleBaseUrl()));
        },
        compatibleBaseUrl() {
            const value = env.OPENAI_COMPATIBLE_BASE_URL;
            return typeof value === 'string' && value.trim() ? value.trim() : null;
        },
        resolve(kind, secretReferenceId = null) {
            if (secretReferenceId) throw apiError('AUTH_METHOD_UNSUPPORTED', 'This installation has no qualified provider secret store for that reference.', 400);
            const value = valueFor(kind);
            if (!value) throw apiError('CREDENTIAL_UNAVAILABLE', 'Provider credentials are not configured.', 503);
            return value;
        },
    };
}
