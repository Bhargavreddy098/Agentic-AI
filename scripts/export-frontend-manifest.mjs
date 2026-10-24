// @ts-check
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { LOCAL_SESSION_COOKIE } from '../backend/src/http/identity.routes.js';

const sourceFiles = { 'backend/src/http/identity.routes.js': 3, 'backend/src/http/product.routes.js': 4,
    'backend/src/http/content.routes.js': 4, 'backend/src/http/governance.routes.js': 5, 'backend/src/http/provider.routes.js': 6 };
const read = path => readFileSync(path, 'utf8');
const clean = text => text.replaceAll('`', '').replaceAll('\\|', '|').trim();
export function buildFrontendManifest() {
    const canonical = new Map();
    for (const line of read('docs/backend/05-API-CONTRACTS.md').split('\n')) {
        const match = line.match(/^\| (GET|POST|PATCH|PUT|DELETE) `([^`]+)`/);
        if (!match) continue;
        const fields = line.split(/(?<!\\)\|/).slice(1, -1).map(clean);
        canonical.set(match[1] + ' ' + match[2], { requestDto: fields[1], responseDto: fields[2], authProfile: fields[3].split(',')[0], contractErrors: fields[4] });
    }
    const routes = [];
    for (const [file, stage] of Object.entries(sourceFiles)) {
        const source = read(file);
        for (const match of source.matchAll(/router\.(get|post|put|patch|delete)\('([^']+)'/g)) {
            const method = match[1].toUpperCase(), path = match[2], contract = canonical.get(method + ' ' + path);
            if (!contract) throw new Error('Implemented route missing from canonical contract: ' + method + ' ' + path);
            const mutation = !['GET', 'HEAD'].includes(method), bootstrap = path === '/session/bootstrap', upload = method === 'PUT';
            let successStatus = method === 'DELETE' ? 204 : method === 'POST' ? 201 : 200;
            if (method === 'POST' && /\/activate$|\/decisions$|\/revoke$|\/archive$|\/routing\/preview$|\/session\/bootstrap$/.test(path)) successStatus = 200;
            if (method === 'POST' && /\/snapshots$|\/export$|\/complete$|\/discovery$/.test(path)) successStatus = 202;
            const limitations = [];
            if (path.includes('discovery')) limitations.push('probe=false discovers models; probe=true fails closed (503 after required budget validation). Paid HTTP probing has no project/grant binding.');
            if (path === '/projects/:projectId/artifacts') limitations.push('Only limit/cursor are supported. Owner-approved clarification reserves kind until a taxonomy is approved and defers runId to Stage 07 ownership; both are strictly rejected now.');
            if (path === '/settings') limitations.push('Privacy/limits project active policy; conflicting PATCH returns 409. Retention/defaultAutonomy are preferences, not purge or execution authorization.');
            if (path.includes('snapshots')) limitations.push('Requires a native-authorized Git root. 202 result is polled through operations. Snapshot artifact is quarantined; knowledge indexing is deferred.');
            if (path.includes('/export')) limitations.push('Exact destinationRef must be registered by native owner command. No overwrite. Replay never dispatches again; blocked/uncertain effects require reconciliation.');
            if (path.includes('approval')) limitations.push('Real contract creation workflows are Stage 09; Stage 05 uses immutable contract fixtures for qualification.');
            if (contract.authProfile === 'Owner-H') limitations.push('Owner session only; no extra human-presence provider is currently configured.');
            routes.push({ stage, canonicalRoute: '/api/v1' + path, implemented: true, method, ...contract,
                csrfRequired: mutation && !bootstrap, idempotencyKeyRequired: mutation && !bootstrap && !upload,
                idempotencyMechanism: upload ? 'Upload ID plus expected digest' : bootstrap ? 'Single-use native challenge' : mutation ? 'Scoped durable response replay' : 'Read-only',
                ifMatchRequired: method === 'PATCH', successStatus,
                responseEnvelope: method === 'DELETE' ? 'No body' : path.endsWith('/content') && method === 'GET' ? 'Raw bytes' : '{data:responseDto,meta:{requestId,version?,nextCursor?}}',
                implementationFile: file, implementationLine: source.slice(0, match.index).split('\n').length,
                frontendReady: 'yes', limitations });
        }
    }
    for (const path of ['/health/live', '/health/ready']) routes.unshift({ stage: 1, canonicalRoute: path, implemented: true, method: 'GET',
        ...canonical.get('GET ' + path), csrfRequired: false, idempotencyKeyRequired: false, ifMatchRequired: false,
        successStatus: 200, responseEnvelope: 'Unwrapped JSON', implementationFile: 'backend/controllers/health.controller.js', frontendReady: 'yes', limitations: path.endsWith('ready') ? ['503 and {ready:false} when required dependencies fail.'] : [] });
    // Check from the canonical side too: deleting an implementation must not silently
    // delete its requirement from the generated inventory.
    const stageFor = path => {
        if (/^\/health\/(live|ready)$/.test(path)) return 1;
        if (/^\/(session(?:\/bootstrap)?|workspaces|capabilities)$/.test(path)) return 3;
        if (/^\/(providers(?:\/[^/]+(?:\/discovery)?)?|models|routing\/preview)$/.test(path)) return 6;
        if (/^\/(settings|policies\/.+|approvals(?:\/.+)?|grants\/[^/]+\/revoke|budgets\/[^/]+|usage|contract-revisions\/[^/]+\/approval-requests)$/.test(path)
            || /^\/projects\/[^/]+\/(budgets|grants)$/.test(path)) return 5;
        if (/^\/projects(?:\/[^/]+(?:\/(archive|snapshots|conversations|artifacts|uploads))?)?$/.test(path)
            || /^\/conversations\/[^/]+(?:\/messages)?$/.test(path)
            || /^\/(uploads\/[^/]+\/(content|complete)|artifacts\/[^/]+(?:\/(content|export))?|operations\/[^/]+)$/.test(path)) return 4;
        return null;
    };
    for (const [key, contract] of canonical) {
        const [method, path] = key.split(' '), stage = stageFor(path);
        if (!stage) continue;
        const canonicalRoute = stage === 1 ? path : '/api/v1' + path;
        if (!routes.some(route => route.method === method && route.canonicalRoute === canonicalRoute)) {
            routes.push({ stage, canonicalRoute, method, ...contract, implemented: false,
                csrfRequired: contract.authProfile !== 'Public' && method !== 'GET', idempotencyKeyRequired: method !== 'GET',
                ifMatchRequired: method === 'PATCH', successStatus: null, implementationFile: null, frontendReady: 'no', limitations: ['Required canonical route has no registered implementation.'] });
        }
    }
    const definitions = [...read('docs/backend/05-API-CONTRACTS.md').matchAll(/`([A-Z][A-Za-z]+)=([^`]+)`/g)].map(m => ({ name: m[1], shape: m[2] }));
    const schemas = {};
    for (const stage of ['03','04','06']) {
        const spec = JSON.parse(read(`docs/backend/api/stage${stage}.openapi.json`));
        schemas['stage' + stage] = spec.components?.schemas ?? {};
    }
    return { schemaVersion: 1, verifiedOn: '2026-10-23', authority: 'docs/backend/05-API-CONTRACTS.md',
        baseUrl: 'http://127.0.0.1:<ASI_PORT>', authentication: { cookieName: LOCAL_SESSION_COOKIE, httpOnly: true, sameSite: 'strict', path: '/api/v1', browserFetchCredentials: 'include', csrfHeader: 'X-CSRF-Token', origin: 'Exact operator-allowed frontend origin; never infer arbitrary localhost ports' },
        stage02: 'No public database/SQL endpoint. Readiness uses canonical /health/ready.', routes,
        compatibilityAliases: ['/health', '/api/v1/health', '/api/v1/health/live', '/api/v1/health/ready'].map(path => ({ method: 'GET', path, canonical: path.endsWith('ready') ? '/health/ready' : '/health/live', implementationFile: 'backend/routes/health.routes.js', useForNewFrontend: false })),
        excluded: ['Legacy /api/ui/v1 routes are a separate adapter, not automatic canonical aliases.', 'Frontend /api/chat is separate pre-existing UI code, not a governed Stage 06 generation API.', 'Stages 07–18, including goal inference, runs/SSE, memory and deployment, are not exposed by this manifest.'],
        dtoDefinitions: definitions, schemaReferences: schemas,
        dtoNotes: ['Request/response DTO columns quote the authoritative contract. Read schemaReferences and linked validators for bounds and implemented extensions.', 'PolicyRules runtime schema: backend/src/modules/governance/policy.js; governance input schemas: backend/src/http/governance.routes.js.', 'Settings runtime DTO: backend/src/modules/operations/settings.js, approved refinement in 05-API-CONTRACTS.md.', 'Identifiers are UUIDs; digests are lowercase SHA-256 hex; versions, sequences, byte counts and money use decimal strings where defined.', 'Lists use limit/cursor (default 50, maximum 100) and only supported filters; loaded rows are not a global count.'] };
}
export function renderFrontendManifest(manifest) {
    const value = text => String(text).replaceAll('|','\\|').replaceAll('\n',' ');
    const lines = ['# Verified frontend API manifest — Stage 01–06', '', 'Generated by `npm run api:frontend` from canonical contract rows and registered route source. See the JSON manifest for DTO definitions, schema references, limitations, cookie attributes and compatibility aliases.', '',
        '| Stage | Canonical route | Implemented | Method | Auth | CSRF | Idempotency-Key | If-Match | Request DTO | Response DTO | Success | Implementation | Frontend ready |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
    for (const r of manifest.routes) lines.push('| ' + [r.stage,r.canonicalRoute,r.implemented?'yes':'no',r.method,r.authProfile,r.csrfRequired?'yes':'no',r.idempotencyKeyRequired?'yes':'no',r.ifMatchRequired?'yes':'no',r.requestDto,r.responseDto,r.successStatus,r.implementationFile,r.frontendReady].map(value).join(' | ') + ' |');
    lines.push('', '## Route limitations', '');
    for (const r of manifest.routes) for (const limitation of r.limitations) lines.push('- `' + r.method + ' ' + r.canonicalRoute + '`: ' + limitation);
    lines.push('', '## Compatibility and exclusions', '', 'Canonical health is `/health/live` and `/health/ready`. `/api/v1/health/*` is compatibility-only and retains its older diagnostic DTO. Cookie name is imported from the implementation: `' + manifest.authentication.cookieName + '`.', '', ...manifest.excluded.map(x=>'- '+x), '', 'Stage 02 exposes no database API. No arbitrary SQL, host path, credential retrieval, shell, or direct generation endpoint is added.', '');
    return lines.join('\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const manifest = buildFrontendManifest();
    writeFileSync('docs/backend/api/frontend-stage01-06.manifest.json', JSON.stringify(manifest, null, 2) + '\n');
    writeFileSync('docs/backend/22-FRONTEND-API-RECONCILIATION.md', renderFrontendManifest(manifest));
    console.log('FRONTEND_MANIFEST_GENERATED: ' + manifest.routes.length + ' canonical routes.');
}
