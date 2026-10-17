import { execSync } from 'node:child_process';

process.env.M03_TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/asi_m03_qualification";
process.env.M04_TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/asi_m04_qualification";

console.log("M03_TEST_DATABASE_URL:", process.env.M03_TEST_DATABASE_URL);
console.log("M04_TEST_DATABASE_URL:", process.env.M04_TEST_DATABASE_URL);

try {
  execSync('node -e "console.log(process.env.M03_TEST_DATABASE_URL)"', { 
    stdio: 'inherit',
    env: process.env 
  });
} catch (e) {
  console.error("Failed:", e.message);
  process.exit(1);
}