import { test } from 'node:test';
import assert from 'node:assert';
import { probeHealth, healthLabel, healthDotClass, healthAriaLabel, healthRetryable } from '../lib/api/health.ts';

test('health probe — unreachable backend', async () => {
  const probe = await probeHealth(async () => { throw new Error('DNS resolution failed'); });
  assert.strictEqual(probe.state, 'backend-unreachable');
  assert.ok(probe.timestamp);
});

test('health probe — live but not ready', async () => {
  let calls = 0;
  const transport = async (url, opts) => {
    calls++;
    if (url === '/health/live') {
      return { ok: true, status: 200, json: async () => ({ status: 'live' }) };
    }
    return { ok: false, status: 503, json: async () => ({ ready: false, dependencies: { postgres: false } }) };
  };
  const probe = await probeHealth(transport);
  assert.strictEqual(probe.state, 'backend-degraded');
  assert.strictEqual(probe.live?.status, 'live');
  assert.strictEqual(probe.ready?.ready, false);
  assert.strictEqual(calls, 2);
});

test('health probe — fully ready', async () => {
  const transport = async (url) => {
    if (url === '/health/live') {
      return { ok: true, status: 200, json: async () => ({ status: 'live' }) };
    }
    return { ok: true, status: 200, json: async () => ({ ready: true, dependencies: { postgres: true, pgvector: true } }) };
  };
  const probe = await probeHealth(transport);
  assert.strictEqual(probe.state, 'backend-ready');
  assert.ok(probe.latencyMs !== undefined);
});

test('health probe — malformed liveness body', async () => {
  const transport = async () => ({ ok: true, status: 200, json: async () => ({}) });
  const probe = await probeHealth(transport);
  assert.strictEqual(probe.state, 'backend-unknown');
});

test('health labels', () => {
  assert.strictEqual(healthLabel('backend-ready'), 'Backend ready');
  assert.strictEqual(healthLabel('backend-unreachable'), 'Backend unreachable');
  assert.strictEqual(healthLabel('frontend-loaded'), 'Frontend loaded');
});

test('health dot classes', () => {
  assert.ok(healthDotClass('backend-ready').includes('emerald'));
  assert.ok(healthDotClass('backend-unreachable').includes('red'));
  assert.ok(healthDotClass('backend-live').includes('amber'));
});

test('health retryable', () => {
  assert.strictEqual(healthRetryable('backend-unreachable'), true);
  assert.strictEqual(healthRetryable('backend-degraded'), true);
  assert.strictEqual(healthRetryable('backend-ready'), false);
});

test('health aria labels', () => {
  assert.ok(healthAriaLabel('backend-ready').includes('ready'));
  assert.ok(healthAriaLabel('backend-unreachable').includes('unreachable'));
  assert.ok(healthAriaLabel('frontend-loaded').includes('unknown'));
});