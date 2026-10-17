import { execSync } from 'node:child_process';

process.env.M03_TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/asi_m03_qualification";

execSync('pnpm exec vitest run --project integration tests/integration/identity-v2-restart.test.ts', { 
  stdio: 'inherit',
  env: process.env 
});