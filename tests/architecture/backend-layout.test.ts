import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

function inspect() {
  const target = resolve('tests/fixtures/architecture/backend-layout');
  try { return JSON.parse(execFileSync(process.execPath, ['scripts/verify-architecture.mjs', target], { encoding: 'utf8' })); }
  catch (error) { return JSON.parse(String((error as {stdout: string}).stdout)); }
}
describe('backend folder enforcement', () => {
  it('rejects unmapped backend source', () => {
    expect(inspect().violations).toEqual(expect.arrayContaining([expect.objectContaining({code:'UNMAPPED_COMPONENT_PATH',file:'backend/unknown.js'})]));
  });
  it('rejects controller SQL and worker provider bypasses', () => {
    const violations = inspect().violations;
    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({code:'STORE_DRIVER_BYPASS',file:'backend/controllers/leak.js'}),
      expect.objectContaining({code:'PROVIDER_SDK_BYPASS',file:'backend/workers/tool-engine/src/leak.js'}),
    ]));
  });
  it('rejects relative cross-worker imports and production fixture imports', () => {
    expect(inspect().violations).toEqual(expect.arrayContaining([
      expect.objectContaining({code:'CROSS_APP_IMPORT'}),
      expect.objectContaining({code:'PRODUCTION_IMPORTS_TEST'}),
    ]));
  });
});
