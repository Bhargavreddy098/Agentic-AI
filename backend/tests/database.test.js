import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTransaction } from '../database/transaction.js';
import { searchVectors } from '../models/vector.model.js';
test('transaction rolls back and releases the same client after failure', async () => {
    const calls = [], client = { query: async (sql) => calls.push(sql), release: () => calls.push('release') };
    await assert.rejects(withTransaction({ connect: async () => client }, async (held) => { assert.equal(held, client); throw new Error('failed'); }));
    assert.deepEqual(calls, ['BEGIN', 'ROLLBACK', 'release']);
});
test('invalid vector dimensions or nonfinite inputs never reach SQL', async () => {
    let queries = 0;
    const client = { query: async () => { queries++; return { rows: [] }; } };
    await assert.rejects(searchVectors(client, { embedding: [1, 2], tenantId: 'local', limit: 10, modelVersion: 'model' }));
    await assert.rejects(searchVectors(client, { embedding: Array(1536).fill(NaN), tenantId: 'local', limit: 10, modelVersion: 'model' }));
    assert.equal(queries, 0);
});
test('vector query filters scope and model with bound parameters', async () => {
    let seen;
    const client = { query: async (text, values) => { seen = { text, values }; return { rows: [] }; } };
    await searchVectors(client, { embedding: Array(1536).fill(0.1), tenantId: 'local', limit: 10, modelVersion: 'model' });
    assert.ok(seen.text.includes('tenant_id = $2'));
    assert.ok(seen.text.includes('deleted_at IS NULL'));
    assert.equal(seen.values[1], 'local');
    assert.equal(seen.values[2], 'model');
    assert.deepEqual(seen.values[6], ['Global']);
    assert.deepEqual(seen.values[5], []);
    assert.equal(seen.values[4], null);
    assert.ok(seen.text.includes('m.owner_agent_id = $5'));
    assert.ok(seen.text.includes('m.role_id = ANY($6::text[])'));
    assert.ok(seen.text.includes('m.scope = ANY($7::text[])'));
});
test('private vector visibility requires identity and binds trusted role context', async () => {
    let seen;
    const client = { query: async (text, values) => { seen = { text, values }; return { rows: [] }; } };
    const input = { embedding: Array(1536).fill(0), tenantId: 'tenant', modelVersion: 'model', requestedScopes: ['Private'] };
    await assert.rejects(searchVectors(client, input));
    assert.equal(seen, undefined);
    await searchVectors(client, { ...input, agentId: 'agent-a', roleIds: ['research'], requestedScopes: ['Private', 'Role'] });
    assert.equal(seen.values[4], 'agent-a');
    assert.deepEqual(seen.values[5], ['research']);
    assert.deepEqual(seen.values[6], ['Private', 'Role']);
});
