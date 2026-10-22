// @ts-check
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import pg from "pg";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const validName = /^\d{3}-[a-z0-9-]+\.sql$/;

/**
 * Explicit, code-owned migration checksum manifest for retained historical migrations.
 * Replaces obsolete external JSON ledger files while preserving exact byte verification.
 */
export const MIGRATION_CHECKSUM_MANIFEST = Object.freeze({
  "backend/database/migrations/postgres/001-control.sql":
    "3dd2cf65867ccb4ab0f42f3c7a3ee465cf0374c469873d0d033e903ab2b3044d",
  "backend/database/migrations/postgres/002-audit.sql":
    "326f42c0ff8530b7bb4fb610faaf6172a9566550a542afee2d48c4d8cada905e",
  "backend/database/migrations/postgres/003-budgets.sql":
    "7134fc00a6ad993b37394fbd097391cadf8ea3f551bfdbe7a7cf294889ef9126",
  "backend/database/migrations/postgres/004-memory-rls.sql":
    "9174101effa242d062abe16b90ed112eb28cbe8924dfb470d01a3543fd2521a1",
  "backend/database/migrations/postgres/005-skills.sql":
    "35c27b00f4bb8b708f1204b9f95ebee2c98190a19c6f2688551b9d87e1d123e7",
  "backend/database/migrations/postgres/006-schedules.sql":
    "969810d19ed552f2eeff226b234ed8fba8653364902bf8dab2ebdd3df7d10236",
  "backend/database/migrations/postgres/007-learning.sql":
    "12bea0e4e6a79a81fe128d035243f669d72babfa0335999422945cda501d34a0",
  "backend/database/migrations/postgres/008-observations.sql":
    "f48c52c1879e5dfc5c031fc62f5f59711e65041a14e7a3ecbab664f5b169e664",
  "backend/database/migrations/postgres/009-identity-grants.sql":
    "a37ccf06555c57bc7b012b753aff37068af918d52e0fe25ac97ca9bcbfae8dc6",
  "backend/database/migrations/postgres/010-control-qualification.sql":
    "0f40be2210725c473a57293eac51df2318805ed53c8f3d9f3ac59b3f028c86fe",
  "backend/database/migrations/postgres/011-v2-goals.sql":
    "fb29cd90b92a1a097fc72db05238b86cff3a6eff55430502186306ebf0180fee",
  "backend/database/migrations/postgres/014-audit-qualification.sql":
    "6a15900b311326137a8df4854183b53012170adad6ebb7888c4711456e848f1b",
  "backend/database/migrations/postgres/015-budget-qualification.sql":
    "2caf051b683a47553a1e16b062f4dc64f89264db8b345eaef0ee4eb2f830fbd0",
  "backend/database/migrations/postgres/016-policy-qualification.sql":
    "c90e70b6186e20e4ce21a0cbab68c5deec19ee363aa97575a9140f11550ed3eb",
  "backend/database/migrations/sqlite/001-episodes.sql":
    "529e4dfab7dd57c50779ca0e1be001061e83ee20811dd46c179d042daf9f6d38",
});

/**
 * Explicit reviewed migration DAG replacing obsolete task-ledger JSON files.
 */
const REVIEWED_MIGRATION_NODES = Object.freeze([
  { file: "001-control.sql", owner: "04", requires: [], reviewed: true, qualified: true },
  { file: "002-audit.sql", owner: "04", requires: [], reviewed: true, qualified: true },
  { file: "003-budgets.sql", owner: "06", requires: [], reviewed: true, qualified: true },
  { file: "004-memory-rls.sql", owner: "09", requires: [], reviewed: true, qualified: true },
  { file: "005-skills.sql", owner: "18", requires: [], reviewed: true, qualified: true },
  { file: "006-schedules.sql", owner: "21", requires: [], reviewed: true, qualified: true },
  { file: "007-learning.sql", owner: "10", requires: [], reviewed: true, qualified: true },
  { file: "008-observations.sql", owner: "28", requires: [], reviewed: true, qualified: true },
  { file: "009-identity-grants.sql", owner: "02", requires: [], reviewed: true, qualified: true },
  {
    file: "010-control-qualification.sql",
    owner: "M04",
    requires: ["001-control.sql", "009-identity-grants.sql"],
    reviewed: true,
    qualified: true,
  },
  {
    file: "011-v2-goals.sql",
    owner: "M05",
    requires: ["010-control-qualification.sql"],
    reviewed: true,
    qualified: true,
  },
  {
    file: "014-audit-qualification.sql",
    owner: "M09",
    requires: ["002-audit.sql"],
    reviewed: true,
    qualified: true,
  },
  {
    file: "015-budget-qualification.sql",
    owner: "M10",
    requires: ["003-budgets.sql"],
    reviewed: true,
    qualified: true,
  },
  {
    file: "016-policy-qualification.sql",
    owner: "M11",
    requires: ["009-identity-grants.sql"],
    reviewed: true,
    qualified: true,
  },
]);

/**
 * Resolve the reviewed migration plan for a given target closure.
 * @param {{ root?: string, target?: string }} options
 */
export function reviewedMigrationPlan({ root = repositoryRoot, target }) {
  if (!target || typeof target !== "string") {
    throw new Error("Target has no explicit reviewed migration closure");
  }
  const nodes = new Map();
  for (const node of REVIEWED_MIGRATION_NODES) {
    if (nodes.has(node.file) || !validName.test(node.file) || !Array.isArray(node.requires)) {
      throw new Error("Invalid migration registry");
    }
    nodes.set(node.file, node);
  }
  const roots = [...nodes.values()].filter((node) => node.owner === target);
  if (roots.length === 0) {
    throw new Error("Target has no explicit reviewed migration closure");
  }
  const seen = new Set();
  const active = new Set();
  /** @type {Array<{file: string, checksum: string, sql: string}>} */
  const plan = [];

  /** @param {string} file */
  function visit(file) {
    if (!validName.test(file)) throw new Error("Invalid migration identity");
    if (active.has(file)) throw new Error("Migration dependency cycle");
    if (seen.has(file)) return;
    const node = nodes.get(file);
    if (!node) throw new Error("Missing migration prerequisite");
    if (!node.reviewed) throw new Error("Migration owner has no boundary review");
    if (node.owner !== target && !node.qualified) {
      throw new Error("Migration prerequisite is not qualified");
    }
    active.add(file);
    for (const dependency of node.requires) visit(dependency);
    active.delete(file);
    seen.add(file);

    const relativePath = `backend/database/migrations/postgres/${file}`;
    const bytes = readFileSync(resolve(root, relativePath));
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const expectedChecksum = MIGRATION_CHECKSUM_MANIFEST[relativePath];
    if (expectedChecksum && checksum !== expectedChecksum) {
      throw new Error(`Migration file checksum mismatch for ${file}`);
    }
    plan.push({ file, checksum, sql: bytes.toString("utf8") });
  }

  for (const node of roots) visit(node.file);
  return plan;
}

/**
 * Apply reviewed migrations inside a dedicated PostgreSQL client transaction with advisory lock.
 * @param {import('pg').Client | import('pg').PoolClient} client
 * @param {{ schema: string, target: string, root?: string }} options
 */
export async function applyReviewedMigrations(client, { schema, target, root = repositoryRoot }) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error("Invalid trusted schema identifier");
  if (!Number.isInteger(/** @type {any} */ (client).processID)) {
    throw new Error("A connected dedicated PostgreSQL client is required");
  }
  const plan = reviewedMigrationPlan({ root, target });
  const applied = [];
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["asi-migrations:" + schema]);
    const namespace = await client.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [schema]);
    if (namespace.rows.length !== 1) throw new Error("Target schema does not exist");
    await client.query('SET LOCAL search_path TO "' + schema + '",public');
    const current = await client.query("SELECT current_schema() AS name");
    if (current.rows[0].name !== schema) throw new Error("Target schema is not active");
    const exists = await client.query("SELECT to_regclass($1) AS journal", [schema + ".schema_migrations"]);
    if (!exists.rows[0].journal) {
      await client.query(
        "CREATE TABLE schema_migrations(migration_id text PRIMARY KEY,checksum text NOT NULL CHECK(checksum~'^[0-9a-f]{64}$'),applied_at timestamptz NOT NULL DEFAULT clock_timestamp())"
      );
      await client.query(
        "CREATE FUNCTION m04_protect_migration_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Migration journal is immutable'; END $$"
      );
      await client.query(
        "CREATE TRIGGER migration_journal_guard BEFORE UPDATE OR DELETE ON schema_migrations FOR EACH ROW EXECUTE FUNCTION m04_protect_migration_journal()"
      );
      await client.query("REVOKE ALL ON schema_migrations FROM PUBLIC");
    } else {
      const protection = await client.query(
        "SELECT 1 FROM pg_trigger WHERE tgrelid=$1::regclass AND tgname='migration_journal_guard' AND tgenabled<>'D'",
        [schema + ".schema_migrations"]
      );
      if (protection.rows.length !== 1) throw new Error("Migration journal protection missing");
    }
    for (const migration of plan) {
      const found = await client.query("SELECT checksum FROM schema_migrations WHERE migration_id=$1", [
        migration.file,
      ]);
      if (found.rows.length) {
        if (found.rows[0].checksum !== migration.checksum) throw new Error("Applied migration checksum drift");
        continue;
      }
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations(migration_id,checksum) VALUES ($1,$2)", [
        migration.file,
        migration.checksum,
      ]);
      applied.push(migration.file);
    }
    await client.query("COMMIT");
    return applied;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const argument = (/** @type {string} */ name) => process.argv[process.argv.indexOf(name) + 1];
  const target = process.argv.includes("--target") ? argument("--target") : "M04";
  const schema = process.argv.includes("--schema") ? argument("--schema") : undefined;
  try {
    const plan = reviewedMigrationPlan({ target });
    if (!process.argv.includes("--apply-reviewed")) {
      process.stdout.write(
        JSON.stringify(
          {
            mode: "plan-only",
            target,
            migrations: plan.map(({ file, checksum }) => ({ file, checksum })),
          },
          null,
          2
        ) + "\n"
      );
    } else {
      if (!schema || !process.env.DATABASE_URL) {
        throw new Error("Trusted schema and private DATABASE_URL are required");
      }
      const { Client } = pg;
      const client = new Client({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 5000,
        statement_timeout: 30000,
      });
      try {
        await client.connect();
        const applied = await applyReviewedMigrations(client, { schema, target });
        process.stdout.write(JSON.stringify({ applied }) + "\n");
      } finally {
        await client.end();
      }
    }
  } catch {
    process.stderr.write("Reviewed migration plan/application failed; no successful application is claimed.\n");
    process.exitCode = 1;
  }
}

