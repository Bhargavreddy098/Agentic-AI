// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildProviderOpenApi } from '../../scripts/export-provider-openapi.mjs';

test('Stage 06 OpenAPI matches runtime schemas and every local reference resolves', async () => {
    const spec = JSON.parse(await readFile(new URL('../../docs/backend/api/stage06.openapi.json', import.meta.url), 'utf8'));
    assert.deepEqual(spec, buildProviderOpenApi(), 'Run npm run api:providers after changing runtime schemas');
    assert.equal(spec.openapi, '3.1.0');
    const visit = value => {
        if (!value || typeof value !== 'object') return;
        if (value.$ref) assert.ok(value.$ref.startsWith('#/') && value.$ref.slice(2).split('/').reduce((node, key) => node?.[key], spec));
        for (const child of Object.values(value)) visit(child);
    };
    visit(spec);
    assert.equal(spec.components.schemas.CreateProvider.additionalProperties, false);
    assert.equal(spec.components.schemas.PatchProvider.minProperties, 1);
    assert.equal(spec.components.schemas.CreateProvider.properties.apiKey, undefined);
    assert.equal(spec.components.schemas.Provider.properties.apiKey, undefined);
    assert.deepEqual(Object.values(spec.paths).flatMap(path => Object.keys(path).filter(method => ['get', 'post', 'patch'].includes(method))).sort(), ['get', 'get', 'get', 'patch', 'post', 'post', 'post']);
});
