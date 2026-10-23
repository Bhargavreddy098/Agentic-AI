import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MANIFEST_ROUTES } from '../lib/api/manifest.ts';
import { SURFACES, validateCoverage } from '../lib/api/surfaces.ts';

test('every manifest route has exactly one owning surface', () => {
  const v = validateCoverage();
  assert.deepEqual(v.missing.map(r => r.method + ' ' + r.path), []);
  assert.deepEqual(v.duplicated, []);
});

test('coverage counts match the manifest', () => {
  const owned = SURFACES.reduce((n, s) => n + s.owns.length, 0);
  assert.equal(owned, MANIFEST_ROUTES.length);
});
