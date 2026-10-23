// @ts-check
import { createHash } from 'node:crypto';

/** Canonical JSON for durable digests. Only lossless plain JSON values are accepted. */
export function canonicalJson(value) {
    const encode = entry => {
        if (entry === null || typeof entry !== 'object') {
            if (typeof entry === 'number' && !Number.isFinite(entry)) throw new Error('Invalid JSON number');
            const text = JSON.stringify(entry);
            if (text === undefined) throw new Error('Lossless JSON input is required');
            return text;
        }
        if (Array.isArray(entry)) return '[' + entry.map(encode).join(',') + ']';
        if (Object.getPrototypeOf(entry) !== Object.prototype && Object.getPrototypeOf(entry) !== null) throw new Error('Plain JSON input is required');
        return '{' + Object.keys(entry).sort().map(key => JSON.stringify(key) + ':' + encode(entry[key])).join(',') + '}';
    };
    return encode(value);
}

/** Domain-separated SHA-256 digest bytes for canonical JSON. */
export function digestFor(domain, value) {
    if (typeof domain !== 'string' || !/^[a-z][a-z0-9.-]{2,63}$/.test(domain)) throw new Error('Invalid digest domain');
    return createHash('sha256').update(domain + '\n' + canonicalJson(value)).digest();
}

export function digestHexFor(domain, value) {
    return digestFor(domain, value).toString('hex');
}

/** Canonical JSON for HTTP command replay, distinct from future Build Contract formats. */
export function commandDigest(value) {
    return digestHexFor('asi-http-command-v1', value);
}
