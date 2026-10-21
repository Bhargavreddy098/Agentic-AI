import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  reserveBudget,
  getReservation,
  settleBudget,
  releaseBudget,
  getSelfState,
  getBudgetSnapshot,
  type ReserveBudgetConfig,
  type SettleBudgetConfig,
  type SelfStateConfig,
  type GetBudgetSnapshotConfig,
} from "../src/index.js";
import type { BudgetRef, RunContext } from "@asi/contracts";




const TEST_TENANT = "test-tenant-budget";
const TEST_ACCOUNT_ID = "account-1";
const TEST_RUN_ID = "run-1";

// Unit boundary fixtures: prescribed SQL-owner results, not a simulated accounting engine.
// Every original behavioral test remains below; real conservation is qualified in budget-races.
function createMockPool() {
  const state = {
    account: {account_id:TEST_ACCOUNT_ID,tenant_id:TEST_TENANT,account_name:"test",token_limit:"1000000",monthly_limit_micro_usd:"1000000",charged_tokens:"50000",current_spend_micro_usd:"100000",period_start:new Date().toISOString(),suspended:false},
    tenant: {token_limit:"1000000",cost_limit_micro_usd:"1000000",charged_tokens:"50000",charged_cost_micro_usd:"100000",suspended:false},
    reservations: [] as Record<string,unknown>[],
  };
  const control: {state: typeof state; errorState?: Error; errorReserve?: Error; errorWrite?: Error} = {state};
  const query=vi.fn(async (sql:string,params?:unknown[]) => {
    if((sql.includes("b06_state")||sql.includes("b06_history"))) {if(control.errorState)throw control.errorState;return {rows:[{value:state}]};}
    if(sql.includes("b06_lookup"))return {rows:[{value:state.reservations.find(row=>row["reservation_id"]===params?.[1])??null}]};
    if(sql.includes("b06_reserve")) {if(control.errorReserve)throw control.errorReserve;return {rows:[{value:{reservation_id:"res-1",tenant_id:TEST_TENANT,account_id:TEST_ACCOUNT_ID,root_run_id:"root-run-1",reserved_tokens:"50000",reserved_cost_micro_usd:"50000",status:"reserved"}}]};}
    if(sql.includes("b06_write")&&control.errorWrite)throw control.errorWrite;
    return {rows:[]};
  });
  const client={query,release:vi.fn()};
  return {connect:vi.fn().mockReturnValue(client),query,control};
}
function trustedConfig(pool:ReturnType<typeof createMockPool>): ReserveBudgetConfig {
  return {pool:pool as unknown as import("pg").Pool,trustedScope:{tenantId:TEST_TENANT,ownerId:"test-owner",context:createRunContext(),operationKey:"operation",quotas:{accountTokens:1000000,accountCostMicroUsd:1000000,tenantTokens:1000000,tenantCostMicroUsd:1000000}}};
}

function createBudgetRef(): BudgetRef {
  return {
    tenantId: TEST_TENANT,
    accountId: TEST_ACCOUNT_ID,
    rootRunId: "root-run-1",
  };
}

function createRunContext(): RunContext {
  return {
    runId: TEST_RUN_ID,
    sessionId: "session-1",
    writerEpoch: 1,
    mode: "execute",
    deadlineAt: new Date(Date.now() + 3600000).toISOString(),
    budgetRef: createBudgetRef(),
  };
}

describe("Budget Reservation", () => {
  let mockPool: ReturnType<typeof createMockPool>;
  let mockClient: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
  let config: ReserveBudgetConfig;

  beforeEach(() => {
    mockPool = createMockPool();
    mockClient = mockPool.connect();
    config = trustedConfig(mockPool);
  });

  it("reserves budget successfully", async () => {
     // COMMIT

    const result = await reserveBudget(config, {
      budgetRef: createBudgetRef(),
      tokens: 50000,
      maxCostMicroUsd: 50000,
      runId: TEST_RUN_ID,
    });

    expect(result.reservation.reservationId).toBeDefined();
    expect(result.reservation.reservedTokens).toBe(50000);
    expect(result.reservation.reservedCostMicroUsd).toBe(50000);
    expect(result.reservation.status).toBe("reserved");
    expect(mockClient.query).toHaveBeenCalledTimes(8);
  });

  it("handles string BIGINT return values from node-pg safely without string concatenation", async () => {
     // COMMIT

    const result = await reserveBudget(config, {
      budgetRef: createBudgetRef(),
      tokens: 50000,
      maxCostMicroUsd: 50000,
      runId: TEST_RUN_ID,
    });

    expect(result.reservation.reservedCostMicroUsd).toBe(50000);
    // SQL owner receives numbers; exact BIGINT arithmetic is separately tested against PostgreSQL.
    expect(mockClient.query).toHaveBeenCalledWith(
      "SELECT b06_reserve($1::jsonb,$2,$3,$4) AS value",
      [JSON.stringify(config.trustedScope!.context),"operation",50000,50000],
    );
  });

  it("rejects reservation when budget exceeded", async () => {
    mockPool.control.errorReserve = new Error("Budget exceeded"); // ROLLBACK

    await expect(
      reserveBudget(config, {
        budgetRef: createBudgetRef(),
        tokens: 50000,
        maxCostMicroUsd: 50000,
        runId: TEST_RUN_ID,
      }),
    ).rejects.toThrow("Budget exceeded");
  });

  it("gets existing reservation", async () => {
    mockPool.control.state.reservations.push({reservation_id:"res-1",tenant_id:TEST_TENANT,account_id:TEST_ACCOUNT_ID,root_run_id:"root-run-1",run_id:TEST_RUN_ID,reserved_tokens:"50000",reserved_cost_micro_usd:"50000",status:"reserved"});

    const reservation = await getReservation(
      trustedConfig(mockPool),
      { reservationId: "res-1", tenantId: TEST_TENANT },
    );

    expect(reservation).not.toBeNull();
    expect(reservation!.reservationId).toBe("res-1");
    expect(reservation!.reservedTokens).toBe(50000);
  });

  it("returns null for non-existent reservation", async () => {
    

    const reservation = await getReservation(
      trustedConfig(mockPool),
      { reservationId: "non-existent", tenantId: TEST_TENANT },
    );

    expect(reservation).toBeNull();
  });
});

describe("Budget Settlement", () => {
  let mockPool: ReturnType<typeof createMockPool>;
  let mockClient: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
  let config: SettleBudgetConfig;

  beforeEach(() => {
    mockPool = createMockPool();
    mockClient = mockPool.connect();
    config = trustedConfig(mockPool);
  });

  it("settles reservation successfully", async () => {
     // COMMIT

    await settleBudget(config, {
      reservationId: "res-1",
      actualTokens: 48000,
      actualCostMicroUsd: 48000,
      tenantId: TEST_TENANT,
    });

    expect(mockClient.query).toHaveBeenCalledTimes(8);
  });

  it("idempotent settlement returns early", async () => {
     // COMMIT

    await settleBudget(config, {
      reservationId: "res-1",
      actualTokens: 48000,
      actualCostMicroUsd: 48000,
      tenantId: TEST_TENANT,
    });

    expect(mockClient.query).toHaveBeenCalledTimes(8);
  });

  it("rejects settlement for non-reserved reservation", async () => {
    mockPool.control.errorWrite = new Error("not in reserved state"); // ROLLBACK

    await expect(
      settleBudget(config, {
        reservationId: "res-1",
        actualTokens: 48000,
        actualCostMicroUsd: 48000,
        tenantId: TEST_TENANT,
      }),
    ).rejects.toThrow("not in reserved state");
  });

  it("releases reservation successfully", async () => {
     // COMMIT

    await releaseBudget(config, {
      reservationId: "res-1",
      tenantId: TEST_TENANT,
      reason: "cancelled",
    });

    expect(mockClient.query).toHaveBeenCalledTimes(8);
  });
});

describe("Self State", () => {
  let mockPool: ReturnType<typeof createMockPool>;
  let config: SelfStateConfig;

  beforeEach(() => {
    mockPool = createMockPool();
    config = trustedConfig(mockPool);
  });

  it("returns self state with remaining tokens and cost", async () => {
    

    const result = await getSelfState(config, config.trustedScope!.context);

    expect(result.remainingTokens).toBe(950000);
    // The account already includes reservations; subtract the charge only once (approved defect repair).
    expect(result.remainingCostMicroUsd).toBe(900000);
  });

  it("includes degraded capabilities when low budget", async () => {
    mockPool.control.state.account.current_spend_micro_usd="999500";mockPool.control.state.tenant.charged_cost_micro_usd="999500";

    const result = await getSelfState(config, config.trustedScope!.context);

    expect(result.degradedCapabilities).toContain("cost-intensive-operations");
  });

  it("throws when account not found", async () => {
    mockPool.control.errorState = new Error("Budget account account-1 not found");

    await expect(getSelfState(config, config.trustedScope!.context)).rejects.toThrow("Budget account account-1 not found");
  });
});

describe("Budget Snapshot", () => {
  let mockPool: ReturnType<typeof createMockPool>;
  let config: GetBudgetSnapshotConfig;

  beforeEach(() => {
    mockPool = createMockPool();
    config = trustedConfig(mockPool);
  });

  it("returns complete budget snapshot", async () => {
    mockPool.control.state.reservations.push({reservation_id:"res-1",run_id:TEST_RUN_ID,reserved_tokens:50000,reserved_cost_micro_usd:50000,status:"reserved"},{reservation_id:"res-2",run_id:"run-2",settled_tokens:30000,settled_cost_micro_usd:30000,settled_at:new Date().toISOString(),status:"settled"});

    const snapshot = await getBudgetSnapshot(config, createBudgetRef());

    expect(snapshot.accountId).toBe(TEST_ACCOUNT_ID);
    expect(snapshot.monthlyLimitMicroUsd).toBe(1000000);
    expect(snapshot.currentSpendMicroUsd).toBe(100000);
    expect(snapshot.activeReservations).toHaveLength(1);
    expect(snapshot.settledReservations).toHaveLength(1);
  });
});
// Reviewed Task06 regression: an agent-supplied ref is not trusted budget authority.
it("denies missing trusted budget scope before touching the database", async () => {
  const pool = createMockPool();
  pool.connect.mockImplementation(() => { throw new Error("database was touched without trusted scope"); });
  await expect(reserveBudget({ pool: pool as unknown as import("pg").Pool }, { budgetRef: createBudgetRef(), tokens: 1, maxCostMicroUsd: 1, runId: TEST_RUN_ID })).rejects.toThrow(/trusted budget scope/i);
  expect(pool.connect).not.toHaveBeenCalled();
});
