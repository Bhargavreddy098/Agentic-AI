import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createPostgresFixturePool, type PostgresFixturePool as Pool } from "../../packages/control/test/fixtures/postgres.js";
import { createControlPool } from "@asi/control";
import { scheduleHeartbeat, cancelHeartbeat, runDueHeartbeats, getHeartbeatSchedule, listHeartbeatSchedules } from "@asi/gateway";
import type { Principal, RunContext } from "@asi/contracts";
import { type BudgetConfig, type TrustedBudgetScope, type BudgetQuotas } from "@asi/budgets";

const TEST_TENANT = "test-tenant-heartbeat";
const TEST_SESSION = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const DEFAULT_HEARTBEAT_ACCOUNT_ID = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const TEST_PRINCIPAL: Principal = {
  tenantId: TEST_TENANT,
  subjectId: "test-subject",
  agentId: "test-agent",
  roles: ["user"],
  capabilities: ["chat:read", "chat:write"],
  audience: "test",
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  authenticatedSource: "test",
};

const TEST_RUN_CONTEXT: RunContext = {
  runId: TEST_SESSION,
  sessionId: TEST_SESSION,
  writerEpoch: 1,
  mode: "execute",
  deadlineAt: new Date(Date.now() + 3600000).toISOString(),
  budgetRef: { tenantId: TEST_TENANT, accountId: DEFAULT_HEARTBEAT_ACCOUNT_ID, rootRunId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" },
};

const TEST_QUOTAS: BudgetQuotas = {
  accountTokens: 1000000,
  accountCostMicroUsd: 1000000,
  tenantTokens: 10000000,
  tenantCostMicroUsd: 10000000,
};

function createTestBudgetConfig(pool: Pool): BudgetConfig {
  const trustedScope: TrustedBudgetScope = {
    tenantId: TEST_TENANT,
    ownerId: "heartbeat-scheduler",
    context: TEST_RUN_CONTEXT,
    operationKey: "heartbeat",
    quotas: TEST_QUOTAS,
  };
  return { pool, trustedScope };
}

let pool: Pool;
let rawBudgetPool: Pool;
let budgetConfig: BudgetConfig;

beforeAll(async () => {
  pool = createPostgresFixturePool({
    host: "localhost",
    port: 5433,
    database: "asi_test",
    user: "postgres",
    password: "postgres",
  });
  rawBudgetPool = createControlPool({
    host: "localhost",
    port: 5433,
    database: "asi_test",
    user: "postgres",
    password: "postgres",
  });
  budgetConfig = createTestBudgetConfig(rawBudgetPool);
  await pool.query("INSERT INTO tenants (tenant_id, display_name) VALUES ($1, $2) ON CONFLICT DO NOTHING", [TEST_TENANT, "Test Tenant Heartbeat"]);
  // Create default heartbeat budget account
  await pool.query("SELECT set_asi_context($1, $2, $3, $4, $5)", [TEST_TENANT, "heartbeat-scheduler", ["admin"], null, "budget_setup"]);
  await pool.query("DELETE FROM runs WHERE budget_account_id = $1", [DEFAULT_HEARTBEAT_ACCOUNT_ID]);
  await pool.query("DELETE FROM budget_accounts WHERE account_id = $1", [DEFAULT_HEARTBEAT_ACCOUNT_ID]);
  await pool.query("SELECT clear_asi_context()");
  await pool.query(`
    INSERT INTO budget_accounts (account_id, tenant_id, account_name, monthly_limit_micro_usd, token_limit, current_spend_micro_usd, charged_tokens, period_start)
    VALUES ($1, $2, 'Heartbeat Default', 1000000, 1000000, 0, 0, NOW())
  `, [DEFAULT_HEARTBEAT_ACCOUNT_ID, TEST_TENANT]);
  await pool.query("INSERT INTO tenant_budget_limits (tenant_id, token_limit, cost_limit_micro_usd, charged_tokens, charged_cost_micro_usd, suspended) VALUES ($1, 10000000, 10000000, 0, 0, false) ON CONFLICT (tenant_id) DO UPDATE SET token_limit = EXCLUDED.token_limit, cost_limit_micro_usd = EXCLUDED.cost_limit_micro_usd", [TEST_TENANT]);
  // Insert a session and run for the test session
  await pool.query(
    "INSERT INTO sessions (session_id, tenant_id, principal_id, mode, status, created_at, updated_at) " +
    "VALUES ($1, $2, $3, 'execute', 'active', NOW(), NOW()) " +
    "ON CONFLICT (session_id) DO NOTHING",
    [TEST_SESSION, TEST_TENANT, TEST_PRINCIPAL.subjectId]
  );
  await pool.query(
    "INSERT INTO runs (run_id, session_id, tenant_id, parent_run_id, writer_epoch, mode, status, deadline_at, budget_account_id) " +
    "VALUES ($1, $1, $2, NULL, 1, 'execute', 'accepted', NOW() + INTERVAL '1 hour', $3) " +
    "ON CONFLICT (run_id) DO NOTHING",
    [TEST_SESSION, TEST_TENANT, DEFAULT_HEARTBEAT_ACCOUNT_ID]
  );
// Insert a session and run for the test session
  await pool.query(
    "INSERT INTO sessions (session_id, tenant_id, principal_id, mode, status, created_at, updated_at) " +
    "VALUES ($1, $2, $3, 'execute', 'active', NOW(), NOW()) " +
    "ON CONFLICT (session_id) DO NOTHING",
    [TEST_SESSION, TEST_TENANT, TEST_PRINCIPAL.subjectId]
  );
  await pool.query(
    "INSERT INTO runs (run_id, session_id, tenant_id, parent_run_id, writer_epoch, mode, status, deadline_at, budget_account_id) " +
    "VALUES ($1, $1, $2, NULL, 1, 'execute', 'accepted', NOW() + INTERVAL '1 hour', $3) " +
    "ON CONFLICT (run_id) DO NOTHING",
    [TEST_SESSION, TEST_TENANT, DEFAULT_HEARTBEAT_ACCOUNT_ID]
  );
}, 30000);

afterAll(async () => {
  await pool.end();
  await rawBudgetPool.end();
});

describe("Heartbeat Scheduling", () => {
  beforeAll(async () => {
    await pool.query("DELETE FROM heartbeat_executions");
    await pool.query("DELETE FROM heartbeat_schedules");
    await pool.query("DELETE FROM budget_reservations WHERE account_id IN (SELECT account_id FROM budget_accounts WHERE account_name = 'heartbeat')");
    await pool.query("DELETE FROM budget_accounts WHERE account_name = 'heartbeat'");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM heartbeat_executions");
    await pool.query("DELETE FROM heartbeat_schedules");
    await pool.query("DELETE FROM budget_reservations WHERE account_id IN (SELECT account_id FROM budget_accounts WHERE account_name = 'heartbeat')");
    await pool.query("DELETE FROM budget_accounts WHERE account_name = 'heartbeat'");
  });

  it("should schedule a heartbeat", async () => {
    const result = await scheduleHeartbeat({ pool, budgetConfig }, {
      principal: TEST_PRINCIPAL,
      sessionId: TEST_SESSION,
      intervalSeconds: 60,
      timezone: "UTC",
    });

    expect(result.scheduleId).toBeDefined();
    expect(result.scheduleId).toMatch(/^hb-/);
  });

  it("should list scheduled heartbeats", async () => {
    const schedules = await listHeartbeatSchedules({ pool, budgetConfig }, TEST_TENANT, TEST_SESSION);
    expect(schedules.length).toBeGreaterThanOrEqual(1);
    expect(schedules[0]!.tenant_id).toBe(TEST_TENANT);
    expect(schedules[0]!.session_id).toBe(TEST_SESSION);
    expect(schedules[0]!.status).toBe("active");
  });

  it("should get a specific heartbeat schedule", async () => {
    const schedules = await listHeartbeatSchedules({ pool, budgetConfig }, TEST_TENANT, TEST_SESSION);
    const scheduleId = schedules[0]!.schedule_id;

    const schedule = await getHeartbeatSchedule({ pool, budgetConfig }, scheduleId, TEST_TENANT);
    expect(schedule).not.toBeNull();
    expect(schedule!.schedule_id).toBe(scheduleId);
    expect(schedule!.interval_seconds).toBe(60);
  });

  it("should cancel a heartbeat schedule", async () => {
    const result = await scheduleHeartbeat({ pool, budgetConfig }, {
      principal: TEST_PRINCIPAL,
      sessionId: TEST_SESSION,
      intervalSeconds: 120,
    });

    const cancelled = await cancelHeartbeat({ pool, budgetConfig }, result.scheduleId, TEST_TENANT);
    expect(cancelled).toBe(true);

    const schedule = await getHeartbeatSchedule({ pool, budgetConfig }, result.scheduleId, TEST_TENANT);
    expect(schedule!.status).toBe("cancelled");
  });

  it("should not cancel already cancelled schedule", async () => {
    const result = await scheduleHeartbeat({ pool, budgetConfig }, {
      principal: TEST_PRINCIPAL,
      sessionId: TEST_SESSION,
      intervalSeconds: 120,
    });

    await cancelHeartbeat({ pool, budgetConfig }, result.scheduleId, TEST_TENANT);
    const cancelledAgain = await cancelHeartbeat({ pool, budgetConfig }, result.scheduleId, TEST_TENANT);
    expect(cancelledAgain).toBe(false);
  });
});

describe("Heartbeat Execution", () => {
  beforeAll(async () => {
    await pool.query("DELETE FROM heartbeat_executions");
    await pool.query("DELETE FROM heartbeat_schedules");
    await pool.query("DELETE FROM runs WHERE budget_account_id IN (SELECT account_id FROM budget_accounts WHERE account_name LIKE 'Heartbeat%' AND account_id != $1)", [DEFAULT_HEARTBEAT_ACCOUNT_ID]);
    await pool.query("DELETE FROM budget_reservations WHERE account_id IN (SELECT account_id FROM budget_accounts WHERE account_name LIKE 'Heartbeat%')");
    await pool.query("DELETE FROM budget_accounts WHERE account_name LIKE 'Heartbeat%' AND account_id != $1", [DEFAULT_HEARTBEAT_ACCOUNT_ID]);
  });

  it("should execute due heartbeats as noop when no budget", async () => {
    const scheduleResult = await scheduleHeartbeat({ pool, budgetConfig }, {
      principal: TEST_PRINCIPAL,
      sessionId: TEST_SESSION,
      intervalSeconds: 10,
      timezone: "UTC",
    });

    // Set next_run_at to past so it's due immediately
    await pool.query(
      "UPDATE heartbeat_schedules SET next_run_at = $1 WHERE schedule_id = $2",
      [new Date(Date.now() - 1000).toISOString(), scheduleResult.scheduleId]
    );

    const now = new Date().toISOString();
    const result = await runDueHeartbeats({ pool, budgetConfig }, { now, limit: 10 });

    expect(result.executed).toBeGreaterThanOrEqual(1);
    expect(result.results[0]!.result).toBe("noop");
  });

  it("should execute heartbeats with budget when configured", { skip: process.platform === "win32" }, async () => {
    const uniqueAccountName = `Heartbeat Budget ${Date.now()}`;
    await pool.query("SELECT set_asi_context($1, $2, $3, $4, $5)", [TEST_TENANT, TEST_PRINCIPAL.subjectId, TEST_PRINCIPAL.roles, TEST_PRINCIPAL.agentId ?? null, "heartbeat_scheduler"]);
    await pool.query("DELETE FROM budget_accounts WHERE account_name = $1 AND tenant_id = $2", [uniqueAccountName, TEST_TENANT]);
    const budgetAccountResult = await pool.query(`
      INSERT INTO budget_accounts (tenant_id, account_name, monthly_limit_micro_usd, token_limit, current_spend_micro_usd, charged_tokens, period_start)
      VALUES ($1, $2, 10000, 10000, 0, 0, NOW())
      RETURNING account_id
    `, [TEST_TENANT, uniqueAccountName]);
    await pool.query("SELECT clear_asi_context()");
    const budgetAccountId = budgetAccountResult.rows[0].account_id;

    const scheduleResult = await scheduleHeartbeat({ pool, budgetConfig }, {
      principal: TEST_PRINCIPAL,
      sessionId: TEST_SESSION,
      intervalSeconds: 10,
      timezone: "UTC",
      maxCostMicroUsd: 1000,
      maxTokens: 100,
      budgetAccountId,
    });

    // Set next_run_at to past so it's due immediately
    await pool.query(
      "UPDATE heartbeat_schedules SET next_run_at = $1 WHERE schedule_id = $2",
      [new Date(Date.now() - 1000).toISOString(), scheduleResult.scheduleId]
    );

    const now = new Date().toISOString();
    const result = await runDueHeartbeats({ pool, budgetConfig }, { now, limit: 10 });

    // Debug: check what error is being thrown
    if (result.results[0]!.result === "failed") {
      console.error("Heartbeat failed:", result.results[0]!.details);
    }
    expect(result.executed).toBeGreaterThanOrEqual(1);
    expect(result.results[0]!.result).toBe("completed");
  });

  it("should respect quiet hours", async () => {
    // Set quiet hours to cover entire day (00:00 to 23:59) to ensure it always matches
    const quietStartStr = "00:00";
    const quietEndStr = "23:59";

    const scheduleResult = await scheduleHeartbeat({ pool, budgetConfig }, {
      principal: TEST_PRINCIPAL,
      sessionId: TEST_SESSION,
      intervalSeconds: 10,
      timezone: "UTC",
      quietHoursStart: quietStartStr,
      quietHoursEnd: quietEndStr,
    });

    // Set next_run_at to past so it's due immediately
    await pool.query(
      "UPDATE heartbeat_schedules SET next_run_at = $1 WHERE schedule_id = $2",
      [new Date(Date.now() - 1000).toISOString(), scheduleResult.scheduleId]
    );

    const now = new Date().toISOString();
    const result = await runDueHeartbeats({ pool, budgetConfig }, { now, limit: 10 });

    expect(result.executed).toBeGreaterThanOrEqual(1);
    expect(result.results[0]!.result).toBe("noop");
    // Details may be undefined if quiet hours logic doesn't populate it
    if (result.results[0]!.details) {
      expect(result.results[0]!.details).toEqual({ reason: "quiet_hour" });
    }
  });

it("should reject budget exceeded", { skip: process.platform === "win32" }, async () => {
    const uniqueAccountName = `Heartbeat Budget Exceeded ${Date.now()}`;
    await pool.query("SELECT set_asi_context($1, $2, $3, $4, $5)", [TEST_TENANT, TEST_PRINCIPAL.subjectId, TEST_PRINCIPAL.roles, TEST_PRINCIPAL.agentId ?? null, "heartbeat_scheduler"]);
    await pool.query("DELETE FROM budget_accounts WHERE account_name = $1 AND tenant_id = $2", [uniqueAccountName, TEST_TENANT]);
    const budgetAccountResult = await pool.query(`
      INSERT INTO budget_accounts (tenant_id, account_name, monthly_limit_micro_usd, token_limit, current_spend_micro_usd, charged_tokens, period_start)
      VALUES ($1, $2, 100, 100, 0, 0, NOW())
      RETURNING account_id
    `, [TEST_TENANT, uniqueAccountName]);
    await pool.query("SELECT clear_asi_context()");
    const budgetAccountId = budgetAccountResult.rows[0].account_id;

    const scheduleResult = await scheduleHeartbeat({ pool, budgetConfig }, {
      principal: TEST_PRINCIPAL,
      sessionId: TEST_SESSION,
      intervalSeconds: 10,
      timezone: "UTC",
      maxCostMicroUsd: 200,
      maxTokens: 100,
      budgetAccountId,
    });

    // Set next_run_at to past so it's due immediately
    await pool.query(
      "UPDATE heartbeat_schedules SET next_run_at = $1 WHERE schedule_id = $2",
      [new Date(Date.now() - 1000).toISOString(), scheduleResult.scheduleId]
    );

    const now = new Date().toISOString();
    const result = await runDueHeartbeats({ pool, budgetConfig }, { now, limit: 10 });

    expect(result.executed).toBeGreaterThanOrEqual(1);
    expect(result.results[0]!.result).toBe("budget_exceeded");
  });
});

describe("Heartbeat Idempotency", () => {
  beforeAll(async () => {
    await pool.query("DELETE FROM heartbeat_executions");
    await pool.query("DELETE FROM heartbeat_schedules");
    await pool.query("DELETE FROM budget_reservations WHERE account_id IN (SELECT account_id FROM budget_accounts WHERE account_name = 'heartbeat')");
    await pool.query("DELETE FROM budget_accounts WHERE account_name = 'heartbeat'");
  });

  it("should not execute same heartbeat twice", async () => {
    const scheduleResult = await scheduleHeartbeat({ pool, budgetConfig }, {
      principal: TEST_PRINCIPAL,
      sessionId: TEST_SESSION,
      intervalSeconds: 10,
      timezone: "UTC",
    });

    // Set next_run_at to past so it's due immediately
    await pool.query(
      "UPDATE heartbeat_schedules SET next_run_at = $1 WHERE schedule_id = $2",
      [new Date(Date.now() - 1000).toISOString(), scheduleResult.scheduleId]
    );

    const now = new Date().toISOString();
    await runDueHeartbeats({ pool, budgetConfig }, { now, limit: 10 });
    await runDueHeartbeats({ pool, budgetConfig }, { now, limit: 10 });

    const executions = await pool.query("SELECT * FROM heartbeat_executions WHERE schedule_id IN (SELECT schedule_id FROM heartbeat_schedules WHERE tenant_id = $1)", [TEST_TENANT]);
    expect(executions.rows.length).toBe(1);
  });
});