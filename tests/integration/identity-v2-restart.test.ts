import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PostgresGrantStore } from "../../packages/identity/src/postgres-grant-store.js";
import type { GrantQueryClient } from "../../packages/identity/src/postgres-grant-store.js";
import { configureIdentity, resetIdentity, generateSigningKey, getConfig } from "../../packages/identity/src/config.js";
import { setGrantStore, resetGrantStore, getGrantStore, revokeGrant } from "../../packages/identity/src/revoke.js";
import { createPrincipalToken, delegatePrincipal } from "../../packages/identity/src/delegate.js";
import { verifyPrincipal, parseGrantId } from "../../packages/identity/src/verify.js";
import type { Principal } from "../../packages/contracts/src/identity.js";

interface DatabaseClient extends GrantQueryClient { connect(): Promise<void>; end(): Promise<void> }
const root = resolve(import.meta.dirname, "../..");
// Use the already-qualified pg driver through its owning workspace, not another dependency.
const { Client } = createRequire(resolve(root, "packages/control/package.json"))("pg") as {
  Client: new (options: { connectionString: string; connectionTimeoutMillis: number; statement_timeout: number }) => DatabaseClient;
};
let url: string;
let schema: string;
let runtimeRole: string;
let client: DatabaseClient;
const connected: DatabaseClient[] = [];

async function connect(runtime = false): Promise<DatabaseClient> {
  const db = new Client({ connectionString: url, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  await db.connect(); connected.push(db);
  await db.query(`SET search_path TO ${schema}, public`);
  if (runtime) await db.query(`SET ROLE ${runtimeRole}`);
  return db;
}
function principal(tenantId = "tenant-a"): Principal {
  return { tenantId, subjectId: "subject-a", agentId: "worker-a", roles: ["specialist"], capabilities: ["read", "write"], audience: "parent", expiresAt: new Date(Date.now() + 3600000).toISOString().replace(/\.\d{3}Z$/, "Z"), authenticatedSource: "asi-identity" };
}

describe("M03 actual PostgreSQL durability and revocation", () => {
  beforeAll(async () => {
    url = process.env.M03_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/asi_m03_qualification";
    if (!new URL(url).pathname.endsWith("_qualification")) throw new Error("M03 requires a disposable *_qualification database");
    schema = `identity_m03_${randomBytes(8).toString("hex")}`;
    runtimeRole = `m03_runtime_${randomBytes(8).toString("hex")}`;

    client = await connect();
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(readFileSync(resolve(root, "db/postgres/migrations/001-control.sql"), "utf8"));
    await client.query(readFileSync(resolve(root, "db/postgres/migrations/009-identity-grants.sql"), "utf8"));
    await client.query(`INSERT INTO tenants(tenant_id,display_name) VALUES ('tenant-a','A'),('tenant-b','B')`);
    await client.query(`CREATE ROLE ${runtimeRole} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
    await client.query(`GRANT USAGE ON SCHEMA ${schema} TO ${runtimeRole}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON identity_grants TO ${runtimeRole}`);
  }, 20000);

  beforeEach(async () => {
    await client.query("TRUNCATE identity_grants");
    configureIdentity({ keys: [generateSigningKey("m03-test")], defaultKid: "m03-test" });
    setGrantStore(new PostgresGrantStore(await connect(true)));
  });

  afterAll(async () => {
    resetIdentity(); resetGrantStore();
    await Promise.all(connected.filter(db => db !== client).map(db => db.end()));
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
      await client.end();
    }
  });

  it("fresh connections recover roles, agent identity and persistent parent revocation", async () => {
    const token = await createPrincipalToken(principal());
    const parent = await verifyPrincipal(token, "parent");
    const child = await delegatePrincipal(parent, ["read"], "child", new Date(Date.now() + 600000).toISOString().replace(/\.\d{3}Z$/, "Z"));
    setGrantStore(new PostgresGrantStore(await connect(true)));
    expect((await verifyPrincipal(token, "parent")).roles).toEqual(["specialist"]);
    expect((await verifyPrincipal(token, "parent")).agentId).toBe("worker-a");
    expect((await verifyPrincipal(child, "child")).capabilities).toEqual(["read"]);
    await revokeGrant(parseGrantId(token));
    setGrantStore(new PostgresGrantStore(await connect(true)));
    await expect(verifyPrincipal(token, "parent")).rejects.toThrow("revoked");
    await expect(verifyPrincipal(child, "child")).rejects.toThrow("revoked");
  });

  it("concurrent stale writers never clear revocation or widen claims", async () => {
    const token = await createPrincipalToken(principal()), id = parseGrantId(token);
    const original = (await getGrantStore().get(id))!;
    const stores = await Promise.all(Array.from({ length: 6 }, async () => new PostgresGrantStore(await connect(true))));
    await Promise.all(stores.map((store, index) => store.set(index % 2 ? original : { ...original, revokedAt: Date.now(), revokedReason: "cancelled" })));
    await expect(verifyPrincipal(token, "parent")).rejects.toThrow("revoked");
    await expect(stores[0]!.set({ ...original, capabilities: ["admin"] })).rejects.toThrow();
    await expect(client.query("UPDATE identity_grants SET claims = jsonb_set(claims, '{roles}', '[\"admin\"]') WHERE grant_id=$1", [id])).rejects.toThrow("immutable");
  });

  it("deleted grants cannot be resurrected by a delayed issuance write", async () => {
    const token = await createPrincipalToken(principal()), id = parseGrantId(token);
    const original = (await getGrantStore().get(id))!;
    await getGrantStore().delete(id);
    await expect(getGrantStore().set(original)).rejects.toThrow();
    await expect(verifyPrincipal(token, "parent")).rejects.toThrow();
  });

  it("SQL writers cannot physically delete the authority journal and resurrect a token", async () => {
    const token = await createPrincipalToken(principal()), id = parseGrantId(token);
    const runtime = await connect(true);
    await expect(runtime.query("DELETE FROM identity_grants WHERE grant_id=$1", [id])).rejects.toThrow();
    expect((await verifyPrincipal(token, "parent")).subjectId).toBe("subject-a");
  });

  it("tenant listing and parent scope cannot cross tenants or widen capabilities", async () => {
    const token = await createPrincipalToken(principal()), id = parseGrantId(token);
    const parent = (await getGrantStore().get(id))!;
    await createPrincipalToken(principal("tenant-b"));
    const listed = await getGrantStore().listByTenant!("tenant-a");
    expect(listed).toHaveLength(1); expect(listed[0]!.tenantId).toBe("tenant-a");
    await expect(getGrantStore().set({ ...parent, grantId: "wrong-tenant-child", parentGrantId: id, tenantId: "tenant-b" })).rejects.toThrow();
    await expect(getGrantStore().set({ ...parent, grantId: "widened-child", parentGrantId: id, capabilities: ["admin"] })).rejects.toThrow();
  });

  it("closed connections fail authorization and never select fixture storage", async () => {
    const token = await createPrincipalToken(principal());
    const db = await connect(true);
    setGrantStore(new PostgresGrantStore(db)); await db.end();
    await expect(verifyPrincipal(token, "parent")).rejects.toThrow("unavailable");
    await expect(createPrincipalToken(principal())).rejects.toThrow("unavailable");
  });

  it("independent native identity processes recover durable claims and deny revoked descendants", async () => {
    const token = await createPrincipalToken(principal());
    const parent = await verifyPrincipal(token, "parent");
    const child = await delegatePrincipal(parent, ["read"], "child", new Date(Date.now() + 600000).toISOString().replace(/\.\d{3}Z$/, "Z"));
    const script = `
      import {createRequire} from 'node:module';
      import * as identity from './packages/identity/dist/index.js';
      const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
      const input=JSON.parse(Buffer.concat(chunks).toString());
      const {Client}=createRequire(new URL('./packages/control/package.json', import.meta.url))('pg');
      const db=new Client({connectionString:input.url,connectionTimeoutMillis:5000,statement_timeout:5000});
      await db.connect();await db.query('SET search_path TO '+input.schema+',public');await db.query('SET ROLE '+input.role);
      identity.configureIdentity(input.keys);identity.setGrantStore(new identity.PostgresGrantStore(db));
      try{const principal=await identity.verifyPrincipal(input.token,input.audience);console.log(JSON.stringify({allowed:true,principal}));}
      catch{console.log(JSON.stringify({allowed:false}));}
      finally{await db.end();}`;
    function freshProcess(currentToken: string, audience: string) {
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
        encoding: "utf8", timeout: 30000, cwd: root,
        env: Object.fromEntries(["SystemRoot", "WINDIR", "TEMP", "TMP"].flatMap(name => process.env[name] === undefined ? [] : [[name, process.env[name]!] ])),
        // Private bootstrap of a trusted identity process, never an agent task payload.
        input: JSON.stringify({ url, schema, role: runtimeRole, keys: getConfig(), token: currentToken, audience }),
      });
      expect(result.error).toBeUndefined(); expect(result.status).toBe(0);
      expect(result.stdout).not.toContain(getConfig()!.keys[0]!.secret);
      return JSON.parse(result.stdout) as { allowed: boolean; principal?: Principal };
    }
    const restored = freshProcess(token, "parent");
    expect(restored.allowed).toBe(true); expect(restored.principal?.roles).toEqual(["specialist"]); expect(restored.principal?.agentId).toBe("worker-a");
    expect(freshProcess(child, "child").allowed).toBe(true);
    await revokeGrant(parseGrantId(token));
    expect(freshProcess(child, "child").allowed).toBe(false);
  }, 100000);
});
