import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiOrigin } from '../lib/api/config.ts';

test('explicit origin wins', () => {
  assert.equal(resolveApiOrigin({ ASI_API_ORIGIN: 'http://127.0.0.1:4400' }), 'http://127.0.0.1:4400');
});
test('defaults to 4400 when unset', () => {
  assert.equal(resolveApiOrigin({}), 'http://127.0.0.1:4400');
});
test('ignores generic PORT for backend selection', () => {
  assert.equal(resolveApiOrigin({ PORT: '3000' }), 'http://127.0.0.1:4400');
  assert.equal(resolveApiOrigin({ PORT: '3000', ASI_API_ORIGIN: 'http://127.0.0.1:4400' }), 'http://127.0.0.1:4400');
});
