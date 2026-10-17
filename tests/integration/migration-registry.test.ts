import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, realpathSync } from "node:fs";
import { resolve, join, sep, basename } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import type { ControlServices } from "../../packages/control/src/index.js";

type Pool = ControlServices["pool"];
type Client = Pick<Pool, "query">;
const root = resolve(import.meta.dirname, "../..");
const { Pool: DatabasePool } = createRequire(join(root, "packages/control/package.json"))("pg") as { Pool: new (config: Record<string, unknown>) => Pool };
const url = process.env.M04_TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:60637/asi_m04_qualification";
if (!new URL(url).pathname.endsWith("_qualification")) throw new Error("Disposable database required");
const pool = new DatabasePool({ connectionString: url, max: 3, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
let schema = "", fixtureRoot = "";
let apply: (client: Client, options: { schema: string; target: string; root?: string }) => Promise<string[]>;
function fixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "asi-m04-migrations-"));
  mkdirSync(join(directory, "docs"), { recursive: true }); mkdirSync(join(directory, "db/postgres/migrations"), { recursive: true });
  for (const file of ["docs/v2-task-ledger.json", "docs/task-ledger.json", "db/postgres/migrations/001-control.sql", "db/postgres/migrations/009-identity-grants.sql", "db/postgres/migrations/010-control-qualification.sql"]) copyFileSync(join(root, file), join(directory, file));
  return directory;
}
async function run(directory = root): Promise<string[]> {
  const client = await pool.connect();
  try { return await apply(client, { schema, target: "M04", root: directory }); } finally { client.release(); }
}
describe("M04 reviewed migration DAG and immutable journal", () => {
  beforeAll(async () => {
    const module = await import(pathToFileURL(join(root, "scripts/apply-migrations.mjs")).href) as { applyReviewedMigrations: typeof apply };
    apply = module.applyReviewedMigrations;
  });
  afterAll(async () => { await pool.end(); });
  beforeEach(async () => {
    schema = `m04_registry_${randomBytes(6).toString("hex")}`;
    await pool.query(`CREATE SCHEMA ${schema}`);
    fixtureRoot = fixture();
  });
  afterEach(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    const actual = realpathSync(fixtureRoot), temporaryBase = realpathSync(tmpdir());
    if (!actual.startsWith(temporaryBase + sep) || !basename(actual).startsWith("asi-m04-migrations-")) throw new Error("Refusing fixture cleanup outside owned temporary directory");
    rmSync(actual, { recursive: true, force: true });
  });
  it("applies exactly the reviewed prerequisite closure and idempotently records three checksums", async () => {
    expect(await run()).toEqual(["001-control.sql", "009-identity-grants.sql", "010-control-qualification.sql"]);
    const exists = await pool.query("SELECT to_regclass($1) AS journal", [schema + ".schema_migrations"]);
    expect(exists.rows[0].journal).not.toBeNull();
    expect(await run()).toEqual([]);
    const records = await pool.query(`SELECT migration_id,checksum FROM ${schema}.schema_migrations ORDER BY migration_id`);
    expect(records.rows).toHaveLength(3);
    expect(records.rows.every(row => /^[a-f0-9]{64}$/.test(row.checksum))).toBe(true);
    expect((await pool.query("SELECT to_regclass($1) AS pending", [schema + ".skills"])).rows[0].pending).toBeNull();
  });
  it("changed applied source bytes are rejected without changing the journal", async () => {
    await run(fixtureRoot);
    const file = join(fixtureRoot, "db/postgres/migrations/001-control.sql");
    writeFileSync(file, readFileSync(file, "utf8") + "\n-- fixture checksum drift\n");
    await expect(run(fixtureRoot)).rejects.toThrow("checksum");
    expect((await pool.query(`SELECT * FROM ${schema}.schema_migrations`)).rows).toHaveLength(3);
  });
  it("missing prerequisite in the registry is rejected before applying any schema", async () => {
    const file = join(fixtureRoot, "docs/v2-task-ledger.json");
    const ledger = JSON.parse(readFileSync(file, "utf8"));
    ledger.migrationRegistry.reservedInherited = ledger.migrationRegistry.reservedInherited.filter((id: string) => id !== "001-control.sql");
    writeFileSync(file, JSON.stringify(ledger));
    await expect(run(fixtureRoot)).rejects.toThrow();
    expect((await pool.query("SELECT to_regclass($1) AS table", [schema + ".sessions"])).rows[0].table).toBeNull();
  });
  it("an unreviewed target cannot apply migrations", async () => {
    const file = join(fixtureRoot, "docs/v2-task-ledger.json"); const ledger = JSON.parse(readFileSync(file, "utf8"));
    ledger.tasks.find((task: { id: string }) => task.id === "M04").reviewStatus = "pending";
    writeFileSync(file, JSON.stringify(ledger));
    await expect(run(fixtureRoot)).rejects.toThrow();
  });
  it("failure in forward migration rolls back every schema and journal write in the chain", async () => {
    const file = join(fixtureRoot, "db/postgres/migrations/010-control-qualification.sql");
    writeFileSync(file, readFileSync(file, "utf8") + "\nSELECT m04_deliberate_missing_function();\n");
    await expect(run(fixtureRoot)).rejects.toThrow();
    expect((await pool.query("SELECT to_regclass($1) AS table", [schema + ".sessions"])).rows[0].table).toBeNull();
    expect((await pool.query("SELECT to_regclass($1) AS journal", [schema + ".schema_migrations"])).rows[0].journal).toBeNull();
  });
  it("competing runners serialize and leave one applied closure", async () => {
    const results = await Promise.all([run(), run()]);
    expect(results.map(result => result.length).sort()).toEqual([0, 3]);
    expect((await pool.query(`SELECT * FROM ${schema}.schema_migrations`)).rows).toHaveLength(3);
  });
  it("journal update and physical deletion are denied", async () => {
    expect(await run()).toHaveLength(3);
    await expect(pool.query(`UPDATE ${schema}.schema_migrations SET checksum=$1`, ["a".repeat(64)])).rejects.toThrow();
    await expect(pool.query(`DELETE FROM ${schema}.schema_migrations`)).rejects.toThrow();
  });
  it("forward conversion preserves already-journaled UUID identities as text", async () => {
    const client = await pool.connect();
    try {
      await apply(client, { schema, target: "M03" });
      const id = "99999999-9999-4999-8999-999999999999";
      await client.query(`INSERT INTO ${schema}.tenants(tenant_id,display_name) VALUES ('legacy','Legacy')`);
      await client.query(`INSERT INTO ${schema}.sessions(session_id,tenant_id,principal_id) VALUES ($1,'legacy','user')`, [id]);
      expect(await apply(client, { schema, target: "M04" })).toEqual(["010-control-qualification.sql"]);
      const row = (await client.query(`SELECT session_id,pg_typeof(session_id)::text AS type FROM ${schema}.sessions`)).rows[0];
      expect(row).toEqual({ session_id: id, type: "text" });
    } finally { client.release(); }
  });
  it("a nonexistent target schema cannot silently apply into public", async () => {
    const client = await pool.connect();
    try {
      await expect(apply(client, { schema: schema + "_missing", target: "M04" })).rejects.toThrow("schema");
    } finally { client.release(); }
  });
  it("unqualified legacy run dispatch halts forward migration without losing its record", async () => {
    const client = await pool.connect();
    try {
      await apply(client, { schema, target: "M03" });
      const session = "88888888-8888-4888-8888-888888888888", runId = "77777777-7777-4777-8777-777777777777";
      await client.query(`INSERT INTO ${schema}.tenants(tenant_id,display_name) VALUES ('legacy','Legacy')`);
      await client.query(`INSERT INTO ${schema}.sessions(session_id,tenant_id,principal_id) VALUES ($1,'legacy','user')`, [session]);
      await client.query(`INSERT INTO ${schema}.runs(run_id,session_id,tenant_id,deadline_at) VALUES ($1,$2,'legacy',clock_timestamp()+interval '1hour')`, [runId, session]);
      await client.query(`INSERT INTO ${schema}.outbox(tenant_id,run_id,payload_type,payload_json,idempotency_key) VALUES ('legacy',$1,'task','{}','legacy-task')`, [runId]);
      await expect(apply(client, { schema, target: "M04" })).rejects.toThrow();
      expect((await client.query(`SELECT * FROM ${schema}.outbox`)).rows).toHaveLength(1);
      expect((await client.query(`SELECT * FROM ${schema}.schema_migrations`)).rows).toHaveLength(2);
    } finally { client.release(); }
  });
});
