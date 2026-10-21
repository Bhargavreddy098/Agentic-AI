import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

process.env.M03_TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/asi_m03_qualification";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

// Mock the modules that the test imports
import Module from 'node:module';
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (request === '@asi/contracts') {
    return resolve(root, 'packages/contracts/src/index.ts');
  }
  if (request === '@asi/identity') {
    return resolve(root, 'backend/modules/identity/src/index.ts');
  }
  if (request === '@asi/control') {
    return resolve(root, 'backend/modules/control/src/index.ts');
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// Now import the test module
await import('./tests/integration/identity-v2-restart.test.ts');
console.log("Test module loaded");