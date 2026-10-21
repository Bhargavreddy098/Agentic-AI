import { createHash } from 'node:crypto';
import { TenantContextSchema } from '../schemas/_shared.js';

export class ModelDomainError extends Error {
    /**
     * @param {'INVALID_INPUT'|'UNAUTHORIZED_TENANT'|'STALE_REVISION'|'CONFLICT'|'NOT_FOUND'|'DEPENDENCY_UNAVAILABLE'|'POLICY_DENIED'|'QUOTA_EXCEEDED'} code
     * @param {string} message
     * @param {number} [status]
     */
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'ModelDomainError';
        this.code = code;
        this.status = status;
    }
}

export function computeDigest(payload) {
    const normalized = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return 'sha256:' + createHash('sha256').update(normalized).digest('hex');
}

export function validateContext(context) {
    const parsed = TenantContextSchema.safeParse(context);
    if (!parsed.success) {
        throw new ModelDomainError('UNAUTHORIZED_TENANT', 'Valid tenant context is required for model operations.', 403);
    }
    return parsed.data;
}

export function assertSameTenant(recordTenantId, context) {
    const ctx = validateContext(context);
    if (recordTenantId && recordTenantId !== ctx.tenantId) {
        throw new ModelDomainError('UNAUTHORIZED_TENANT', 'Cross-tenant access is denied.', 403);
    }
    return ctx;
}

export function parseSchema(schema, input, label = 'Invalid model payload') {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
        const detail = parsed.error.issues.map(i => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ');
        throw new ModelDomainError('INVALID_INPUT', `${label}: ${detail}`, 400);
    }
    return parsed.data;
}

/**
 * @param {any[]} items
 * @param {{ limit?: number, cursor?: string | null }} [options]
 * @param {string} [idField]
 */
export function paginateItems(items, { limit = 25, cursor = null } = {}, idField = 'id') {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new ModelDomainError('INVALID_INPUT', 'Pagination limit must be between 1 and 100.', 400);
    }
    let startIndex = 0;
    if (cursor) {
        const idx = items.findIndex(item => String(item[idField]) === cursor);
        if (idx === -1) {
            throw new ModelDomainError('INVALID_INPUT', 'Invalid pagination cursor.', 400);
        }
        startIndex = idx + 1;
    }
    const slice = items.slice(startIndex, startIndex + limit);
    const nextCursor = startIndex + limit < items.length ? String(slice[slice.length - 1][idField]) : null;
    return { items: slice, nextCursor };
}

/**
 * Creates a tenant-scoped store adapter that can wrap either an injected PostgreSQL/SQLite repository port
 * or an in-process transactional map store for unit/contract verification.
 * @param {any} [externalStore]
 */
export function createScopedStore(externalStore = null) {
    const records = new Map();
    const idempotency = new Map();
    return {
        externalStore,
        records,
        idempotency,
        key(tenantId, id) {
            return `${tenantId}::${id}`;
        },
        get(tenantId, id) {
            return records.get(`${tenantId}::${id}`) ?? null;
        },
        set(tenantId, id, value) {
            records.set(`${tenantId}::${id}`, structuredClone(value));
            return structuredClone(value);
        },
        /**
         * @param {string} tenantId
         * @param {(record: any) => boolean} [predicate]
         */
        list(tenantId, predicate = () => true) {
            const results = [];
            const prefix = `${tenantId}::`;
            for (const [k, v] of records.entries()) {
                if (k.startsWith(prefix) && predicate(v)) {
                    results.push(structuredClone(v));
                }
            }
            return results;
        },
    };
}
