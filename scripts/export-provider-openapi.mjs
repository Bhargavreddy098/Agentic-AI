// @ts-check
import { z } from 'zod/v4';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { providerInputSchemas, providerOutputSchemas } from '../backend/src/http/provider.schemas.js';

const ref = name => ({ $ref: '#/components/schemas/' + name });
const parameter = name => ({ $ref: '#/components/parameters/' + name });
const json = name => ({ 'application/json': { schema: ref(name) } });
const body = name => ({ required: true, content: json(name) });
const response = (name, description, headers = {}) => ({ description, content: json(name), ...(Object.keys(headers).length ? { headers } : {}) });
const header = description => ({ description, schema: { type: 'string' } });
const errors = { default: { description: 'Correlated safe error; provider credentials and raw upstream errors are never returned.',
    content: { 'application/problem+json': { schema: ref('Problem') } } } };
const ownerWrite = [parameter('Origin'), parameter('Csrf'), parameter('Idempotency')];
const page = [parameter('Limit'), parameter('Cursor')];

export function buildProviderOpenApi() {
    const schemas = {};
    for (const [name, schema] of Object.entries({ ...providerInputSchemas, ...providerOutputSchemas })) {
        const { $schema: _dialect, ...definition } = z.toJSONSchema(schema, { target: 'draft-2020-12' });
        void _dialect;
        schemas[name] = definition;
    }
    schemas.PatchProvider.minProperties = 1;
    schemas.CreateProvider.description = 'Only official OpenAI or the exact operator-allowlisted compatible endpoint. secretReferenceId is recognized but rejected until a qualified provider reference store exists. Never send API keys in this body.';
    schemas.Discovery.description = 'probe:false performs bounded model discovery. probe:true requires a ceiling, then fails closed with CAPABILITY_UNAVAILABLE: HTTP lacks a project budget/grant binding. Project-scoped inference qualification uses the trusted provider:verify command.';
    return {
        openapi: '3.1.0', info: { title: 'ASI Stage 06 Providers and Routing', version: '1.0.0',
            description: 'Local owner API. Host and exact allowed Origin are validated; cookie-authenticated mutations require CSRF and durable idempotency. HEAD follows GET authentication. Credentialed OPTIONS preflight does not authorize operations. No public arbitrary inference or credential-read endpoint.' },
        servers: [{ url: 'http://127.0.0.1:3000/api/v1' }], security: [{ localSession: [] }],
        paths: {
            '/providers': {
                post: { operationId: 'createProvider', parameters: ownerWrite, requestBody: body('CreateProvider'),
                    responses: { 201: response('ProviderResponse', 'Created or exact durable replay', { Location: header('Provider URL'), ETag: header('Quoted version') }), ...errors } },
                get: { operationId: 'listProviders', parameters: page, responses: { 200: response('ProviderListResponse', 'Workspace-scoped provider catalog; descending UUID keyset pagination'), ...errors } },
            },
            '/providers/{providerId}': {
                parameters: [parameter('ProviderId')],
                get: { operationId: 'getProvider', responses: { 200: response('ProviderResponse', 'Safe provider configuration and health; inaccessible IDs return 404'), ...errors } },
                patch: { operationId: 'updateProvider', parameters: [...ownerWrite, parameter('IfMatch')], requestBody: body('PatchProvider'),
                    responses: { 200: response('ProviderResponse', 'Version-checked update or exact durable replay', { ETag: header('New quoted version') }), ...errors } },
            },
            '/providers/{providerId}/discovery': {
                parameters: [parameter('ProviderId')],
                post: { operationId: 'discoverProviderModels', parameters: ownerWrite, requestBody: body('Discovery'),
                    description: 'Completed operation points to the provider. Retrieve its models using GET /models?providerId=... or poll GET /operations/{id}. Unknown models remain unroutable. Completed replay does not redispatch discovery.',
                    responses: { 202: response('OperationResponse', 'Durable discovery operation', { Location: header('Operation URL') }), ...errors } },
            },
            '/models': {
                get: { operationId: 'listModels', parameters: [...page,
                    { name: 'providerId', in: 'query', schema: { type: 'string', format: 'uuid' } },
                    { name: 'capability', in: 'query', schema: { type: 'string', pattern: '^[a-z][a-z0-9_.:-]{2,127}$' } }],
                responses: { 200: response('ModelListResponse', 'Workspace-scoped models; unknown qualification/pricing never grants inference eligibility'), ...errors } },
            },
            '/routing/preview': {
                post: { operationId: 'previewModelRouting', parameters: ownerWrite, requestBody: body('RoutingPreview'),
                    description: 'No model call or spend. Pins the active policy and returns the same stored decision for the same key/body; a changed body returns 409. No eligible model returns NO_ELIGIBLE_MODEL.',
                    responses: { 200: response('RoutingResponse', 'Durably replayable hard-filter routing decision'), ...errors } },
            },
        },
        components: {
            securitySchemes: { localSession: { type: 'apiKey', in: 'cookie', name: 'asi_local_session', description: 'Opaque HttpOnly SameSite=Strict local session. Workers are not human owners.' } },
            parameters: {
                Origin: { name: 'Origin', in: 'header', required: true, schema: { type: 'string' }, description: 'Exact configured allowed browser Origin' },
                Csrf: { name: 'x-csrf-token', in: 'header', required: true, schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' } },
                Idempotency: { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', pattern: '^[!-~]{1,128}$' } },
                IfMatch: { name: 'If-Match', in: 'header', required: true, schema: { type: 'string', pattern: '^"[1-9]\\d*"$' }, description: 'Missing: 428; stale: 412; same key with changed version/body: 409' },
                ProviderId: { name: 'providerId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
                Limit: { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
                Cursor: { name: 'cursor', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 128 }, description: 'Canonical opaque base64url keyset cursor' },
            }, schemas,
        },
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const path = fileURLToPath(new URL('../docs/backend/api/stage06.openapi.json', import.meta.url));
    await writeFile(path, JSON.stringify(buildProviderOpenApi(), null, 2) + '\n');
    process.stdout.write('Exported docs/backend/api/stage06.openapi.json from the provider runtime schemas.\n');
}
