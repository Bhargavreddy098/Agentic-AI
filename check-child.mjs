import { execSync } from 'node:child_process';

process.env.M03_TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/asi_m03_qualification";

execSync('node -e "console.log(process.env.M03_TEST_DATABASE_URL)"', { stdio: 'inherit', env: process.env });