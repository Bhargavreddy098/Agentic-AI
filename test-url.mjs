process.env.M03_TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/asi_m03_qualification";
process.env.M04_TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/asi_m04_qualification";

// Now import the test module
await import('./tests/integration/identity-v2-restart.test.ts');
console.log("Test module loaded");