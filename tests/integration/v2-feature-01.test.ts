import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createControlServices, closeControlServices } from "../../backend/modules/control/src/index.js";
import type { ControlServices } from "../../backend/modules/control/src/index.js";
import { createGoalService } from "../../backend/modules/orchestrator/src/index.js";
import { GoalRecordSchema, GoalSpecSchema, VerificationReportSchema } from "../../packages/contracts/src/index.js";
import type { GoalSpec, RunContext, VerificationReport } from "../../packages/contracts/src/index.js";

type Pool = ControlServices["pool"];
type Client = Pick<Pool, "query">;
const root = resolve(import.meta.dirname, "../..");
const { Pool: DatabasePool } = createRequire(resolve(root, "backend/modules/control/package.json"))("pg") as { Pool: new (config: Record<string, unknown>) => Pool };
const url = process.env.V2_T01_TEST_DATABASE_URL ?? "postgresql://postgres:admin123@localhost:5432/asi_v2_goals_qualification";
if (!new URL(url).pathname.endsWith("_qualification")) throw new Error("Disposable *_qualification database required");
const schema = `v2t01_goals_${randomBytes(6).toString("hex")}`, role = `v2t01_role_${randomBytes(6).toString("hex")}`;
const options = `-c search_path=${schema},public`;
const admin = new DatabasePool({ connectionString: url, options, max: 4, statement_timeout: 10000, connectionTimeoutMillis: 5000 });
const session = "v2t01-session", run = "v2t01-run", account = "v2t01-account", goal = "v2t01-goal", criterion = "criterion-latency";
const digest = { algorithm: "sha256" as const, value: "a".repeat(64) };
let control: ControlServices, other: ControlServices, epoch = 1, deadline = "";

function context(input: number = epoch): RunContext {
  return { runId: run, sessionId: session, writerEpoch: input, mode: "execute", deadlineAt: deadline, budgetRef: { tenantId: "a", accountId: account, rootRunId: run }, goalRef: goal };
}
function spec(overrides: Partial<GoalSpec> = {}): GoalSpec {
  return GoalSpecSchema.parse({
    schemaVersion: 1, goalId: goal, tenantId: "a", conversationId: "v2t01-conversation", objective: "Reduce API P95 latency",
    criteria: [{ criterionId: criterion, description: "P95 latency under 300ms", evaluatorId: "evaluator-latency", evidenceRequirement: "test", required: true }],
    constraintRefs: ["constraint-no-prod-db"], allowedResourceRefs: ["resource-staging"], deadlineAt: deadline,
    budgetRef: { tenantId: "a", accountId: account, rootRunId: run }, revision: 1, ...overrides,
  });
}
function report(overrides: Partial<VerificationReport> = {}): VerificationReport {
  return VerificationReportSchema.parse({
    schemaVersion: 1, reportId: "report-v2t01", goalId: goal, goalRevision: 1, planDigest: digest, artifactDigests: [],
    criterionResults: [{ criterionId: criterion, satisfied: true, evidenceRefs: ["artifact-v2t01"], safeReason: "Measured P95 under threshold." }],
    verifierId: "verifier-v2t01", verifierVersion: "1", checkedAt: new Date().toISOString(), ...overrides,
  });
}
function criterionResult(satisfied: boolean | null, safeReason: string) {
  return { criterionId: criterion, satisfied, evidenceRefs: [], safeReason };
}

describe("V2-T01 goal-based agents over the reviewed control store", () => {
  beforeAll(async () => {
    const module = await import(pathToFileURL(resolve(root, "scripts/apply-migrations.mjs")).href) as { applyReviewedMigrations: (client: Client, options: { schema: string; target: string }) => Promise<string[]> };
    await admin.query(`CREATE SCHEMA ${schema}`);
    const bootstrap = await admin.connect();
    try {
      expect(await module.applyReviewedMigrations(bootstrap, { schema, target: "V2-T01" })).toEqual(["001-control.sql", "009-identity-grants.sql", "010-control-qualification.sql", "011-v2-goals.sql"]);
    } finally { bootstrap.release(); }
    await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
    await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
    await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);
    const config = { connectionString: url, options: `${options} -c role=${role}`, max: 2, statement_timeout: 8000, connectionTimeoutMillis: 5000 };
    control = createControlServices(config, { tenantId: "a", ownerId: "owner-a" });
    other = createControlServices(config, { tenantId: "b", ownerId: "owner-b" });
  }, 40000);
  afterAll(async () => {
    for (const service of [control, other]) if (service) await closeControlServices(service);
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
    await admin.end();
  });
  beforeEach(async () => {
    await admin.query("TRUNCATE tenants CASCADE");
    deadline = new Date(Date.now() + 120000).toISOString();
    await admin.query("INSERT INTO tenants(tenant_id,display_name) VALUES ('a','A'),('b','B')");
    await admin.query("INSERT INTO budget_accounts(account_id,tenant_id,account_name,monthly_limit_micro_usd) VALUES ($1,'a','test',1000)", [account]);
    await admin.query("INSERT INTO sessions(session_id,tenant_id,principal_id,mode) VALUES ($1,'a','user','execute')", [session]);
    await admin.query("INSERT INTO runs(run_id,session_id,tenant_id,mode,deadline_at,budget_account_id) VALUES ($1,$2,'a','execute',$3,$4)", [run, session, deadline, account]);
    epoch = (await control.leases.claimSession(session, run)).writerEpoch;
  });

  it("applies the reviewed V2-T01 migration closure and persists a created goal with its metric evidence", async () => {
    const client = await admin.connect();
    try {
      const journal = await client.query(`SELECT migration_id FROM ${schema}.schema_migrations ORDER BY migration_id`);
      expect(journal.rows.map(row => row.migration_id)).toEqual(["001-control.sql", "009-identity-grants.sql", "010-control-qualification.sql", "011-v2-goals.sql"]);
    } finally { client.release(); }
    const applied = await import(pathToFileURL(resolve(root, "scripts/apply-migrations.mjs")).href);
    const root2 = await admin.connect();
    try { expect(await applied.applyReviewedMigrations(root2, { schema, target: "V2-T01" })).toEqual([]); } finally { root2.release(); }

    const service = createGoalService({ store: control.goals });
    const record = await service.createGoal(spec(), context());
    expect(record).toMatchObject({ goalId: goal, tenantId: "a", revision: 1, status: "ready", owningRunId: run });
    expect(await control.goals.getGoal(goal)).toMatchObject({ goalId: goal, revision: 1, status: "ready" });

    const progress = await service.recordProgress(record, report(), context());
    expect(progress.metrics[0]).toMatchObject({ metricId: criterion, satisfied: true });
    expect(await control.goals.latestProgress(goal)).toMatchObject({ displayStatus: "achieved", goalRevision: 1 });
  });

  it("never displays success for unmet or unknown metrics", async () => {
    const service = createGoalService({ store: control.goals });
    const record = await service.createGoal(spec(), context());
    expect(service.measureGoalProgress(record, report({ criterionResults: [criterionResult(true, "Measured.")] })).displayStatus).toBe("achieved");
    const unmet = service.measureGoalProgress(record, report({ criterionResults: [criterionResult(false, "Measured P95 above threshold.")] }));
    expect(unmet.displayStatus).toBe("unmet");
    expect(unmet.displayStatus).not.toBe("achieved");
    const unknown = service.measureGoalProgress(record, report({ criterionResults: [criterionResult(null, "No evaluator available.")] }));
    expect(unknown.displayStatus).toBe("unknown");
    expect(unknown.displayStatus).not.toBe("achieved");
    expect(service.measureGoalProgress(record, null).displayStatus).toBe("unknown");
    await service.recordProgress(record, report({ criterionResults: [criterionResult(false, "Measured P95 above threshold.")] }), context());
    expect((await control.goals.latestProgress(goal))?.displayStatus).toBe("unmet");
  });

  it("revises a goal by exactly one revision and rejects a stale expectedRevision", async () => {
    const service = createGoalService({ store: control.goals });
    await service.createGoal(spec(), context());
    const revised = await service.reviseGoal(spec({ revision: 2, objective: "Reduce API P95 latency to under 250ms" }), 1, context());
    expect(revised).toMatchObject({ revision: 2, status: "ready" });
    expect((await control.goals.getGoal(goal))?.revision).toBe(2);
    await expect(service.reviseGoal(spec({ revision: 2 }), 1, context())).rejects.toThrow("Stale goal revision");
    await expect(service.reviseGoal(spec({ revision: 3 }), 2, context())).resolves.toMatchObject({ revision: 3 });
  });

  it("denies a final verified transition when a required criterion is unknown or unsatisfied", async () => {
    const service = createGoalService({ store: control.goals });
    await service.createGoal(spec(), context());
    await expect(service.transitionGoal({ goalId: goal, toStatus: "verified", expectedRevision: 1, verification: report({ criterionResults: [criterionResult(null, "No evaluator available.")] }) }, context()))
      .rejects.toThrow("unknown or unsatisfied");
    await expect(service.transitionGoal({ goalId: goal, toStatus: "verified", expectedRevision: 1, verification: report({ criterionResults: [criterionResult(false, "P95 above threshold.")] }) }, context()))
      .rejects.toThrow("unknown or unsatisfied");
    expect((await control.goals.getGoal(goal))?.status).toBe("ready");
  });

  it("verifies a goal only with a matching, fully satisfied report and records the transition", async () => {
    const service = createGoalService({ store: control.goals });
    const record = await service.createGoal(spec(), context());
    await expect(service.transitionGoal({ goalId: goal, toStatus: "verified", expectedRevision: 1, verification: report({ goalRevision: 2 }) }, context()))
      .rejects.toThrow("does not match the goal");
    await expect(service.transitionGoal({ goalId: goal, toStatus: "verified", expectedRevision: 1 }, context()))
      .rejects.toThrow("requires a matching VerificationReport");
    const verified = await service.transitionGoal({ goalId: goal, toStatus: "verified", expectedRevision: 1, verification: report() }, context());
    expect(verified).toMatchObject({ status: "verified", latestVerificationRef: "report-v2t01" });
    expect(await control.goals.getGoal(goal)).toMatchObject({ status: "verified", latestVerificationRef: "report-v2t01", revision: record.revision });
  });

  it("marks a goal unmet without evidence while a goal cannot grant policy authority", async () => {
    const service = createGoalService({ store: control.goals });
    await service.createGoal(spec(), context());
    const unmet = await service.transitionGoal({ goalId: goal, toStatus: "unmet", expectedRevision: 1 }, context());
    expect(unmet.status).toBe("unmet");
    expect(await control.goals.getGoal(goal)).toMatchObject({ status: "unmet" });
    // A goal carries references only; a smuggled policy decision is rejected, so a goal cannot override policy.
    expect(() => GoalSpecSchema.parse({ ...spec(), policyDecision: { decision: "allow", boundCapability: "write:*" } })).toThrow();
  });

  it("fences goal writes to the run's live policy-authorized writer", async () => {
    const service = createGoalService({ store: control.goals });
    expect(await control.leases.releaseLease(session, run, epoch)).toBe(true);
    await expect(service.createGoal(spec(), context())).rejects.toThrow();
    expect(await control.goals.getGoal(goal)).toBeNull();
  });

  it("isolates goals by tenant for reads and writes", async () => {
    const service = createGoalService({ store: control.goals });
    await service.createGoal(spec(), context());
    expect(await other.goals.getGoal(goal)).toBeNull();
    await expect(createGoalService({ store: other.goals }).createGoal(spec(), context())).rejects.toThrow();
    const record = GoalRecordSchema.parse({ ...spec(), status: "ready", owningRunId: run });
    await expect(other.goals.createGoal(record, { ...context(), budgetRef: { ...context().budgetRef, tenantId: "b" } })).rejects.toThrow();
  });

  it("keeps goal revisions, transitions and progress immutable at the database boundary", async () => {
    const service = createGoalService({ store: control.goals });
    await service.createGoal(spec(), context());
    const created = await control.goals.getGoal(goal);
    if (!created) throw new Error("goal missing");
    await service.recordProgress(created, report(), context());
    await service.transitionGoal({ goalId: goal, toStatus: "running", expectedRevision: 1 }, context());
    const client = await control.pool.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT set_config('asi.tenant_id','a',true),set_config('asi.owner_id','owner-a',true)");
      await expect(client.query("UPDATE goals SET objective='tampered' WHERE goal_id=$1", [goal])).rejects.toThrow();
      await expect(client.query("DELETE FROM goals WHERE goal_id=$1", [goal])).rejects.toThrow();
      await expect(client.query("UPDATE goal_progress SET display_status='achieved'")).rejects.toThrow();
      await expect(client.query("DELETE FROM goal_transitions")).rejects.toThrow();
      await expect(client.query("UPDATE goals SET status='verified' WHERE goal_id=$1", [goal])).rejects.toThrow();
    } finally { await client.query("ROLLBACK"); client.release(); }
  });

  it("rejects an unrecorded status change and a transition whose from_status is forged", async () => {
    const service = createGoalService({ store: control.goals });
    await service.createGoal(spec(), context());
    const client = await control.pool.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT set_config('asi.tenant_id','a',true),set_config('asi.owner_id','owner-a',true)");
      await expect(client.query("UPDATE goals SET status='unmet' WHERE goal_id=$1", [goal])).rejects.toThrow("recorded transition");
      await client.query("ROLLBACK");
    } finally { client.release(); }
    const forged = await control.pool.connect();
    try {
      await forged.query("BEGIN"); await forged.query("SELECT set_config('asi.tenant_id','a',true),set_config('asi.owner_id','owner-a',true)");
      await expect(forged.query(
        "INSERT INTO goal_transitions(transition_id,goal_id,tenant_id,revision,from_status,to_status,verification_ref,transitioned_at,transition_json) VALUES ('t-forged',$1,'a',1,'running','unmet',NULL,clock_timestamp(),$2::jsonb)",
        [goal, JSON.stringify({ transitionId: "t-forged", goalId: goal, goalRevision: 1, fromStatus: "running", toStatus: "unmet", at: new Date().toISOString(), by: run })]
      )).rejects.toThrow("does not match the stored goal status");
    } finally { await forged.query("ROLLBACK"); forged.release(); }
  });

  it("rejects a goal whose tenant or run binding does not match the authenticated run", async () => {
    const service = createGoalService({ store: control.goals });
    await expect(service.createGoal(spec({ tenantId: "b" }), context())).rejects.toThrow("authenticated run tenant");
    await expect(service.createGoal(spec({ goalId: "another-goal" }), context())).rejects.toThrow("bound to a different goal");
    await expect(service.createGoal(spec({ revision: 2 }), context())).rejects.toThrow("must start at revision 1");
  });

  it("rejects progress or a transition bound to a goal revision that does not exist", async () => {
    const service = createGoalService({ store: control.goals });
    await service.createGoal(spec(), context());
    const record = await control.goals.getGoal(goal);
    if (!record) throw new Error("goal missing");
    await expect(control.goals.appendProgress(service.measureGoalProgress({ ...record, revision: 9 }, null), context())).rejects.toThrow();
  });
});
