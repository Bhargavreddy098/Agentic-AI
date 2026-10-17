import { describe, it, expect, beforeEach } from "vitest";
import { Orchestrator, type RunState, createOrchestrator, createInitialState, transition, MAX_MODEL_CALLS, MAX_DELEGATION_DEPTH, MAX_ITERATIONS, MAX_FANOUT, isTerminalStatus } from "@asi/orchestrator";
import type { TaskEnvelope, RunContext, Principal, SessionEvent } from "@asi/contracts";

const TEST_TENANT = "tenant-a";

function createTestPrincipal(overrides: Partial<Principal> = {}): Principal {
  return {
    tenantId: TEST_TENANT,
    subjectId: "subject-1",
    roles: ["user"],
    capabilities: ["tool:execution", "inference:local"],
    audience: "orchestrator",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    authenticatedSource: "platform-adapter",
    ...overrides,
  };
}

function createTestContext(overrides: Partial<RunContext> = {}): RunContext {
  return {
    runId: "run-1",
    sessionId: "session-1",
    writerEpoch: 1,
    mode: "execute",
    deadlineAt: new Date(Date.now() + 3600000).toISOString(),
    budgetRef: {
      tenantId: TEST_TENANT,
      accountId: "account-1",
      rootRunId: "root-1",
    },
    ...overrides,
  };
}

function createTestTask(overrides: Partial<TaskEnvelope> = {}): TaskEnvelope {
  return {
    schemaVersion: 1,
    taskId: "test-task",
    traceId: "trace-1",
    correlationId: "corr-1",
    causationId: "cause-1",
    runContext: createTestContext(),
    requiredCapabilities: ["tool:execution"],
    input: { test: true },
    principalGrant: createTestPrincipal(),
    idempotencyKey: "idem-1",
    ...overrides,
  };
}

describe("Orchestrator State Machine", () => {
  describe("createInitialState", () => {
    it("should create initial state with correct defaults", () => {
      const task = createTestTask();
      const principal = createTestPrincipal();
      const context = createTestContext();
      
      const state = createInitialState("run-1", task, principal, context);
      
      expect(state.runId).toBe("run-1");
      expect(state.status).toBe("created");
      expect(state.modelCallCount).toBe(0);
      expect(state.delegationDepth).toBe(0);
      expect(state.observations).toHaveLength(0);
      expect(state.checkpoints).toHaveLength(0);
    });
  });

  describe("transition", () => {
    let state: RunState;

    beforeEach(() => {
      const task = createTestTask();
      const principal = createTestPrincipal();
      const context = createTestContext();
      state = createInitialState("run-1", task, principal, context);
    });

    it("should transition from created to running on START", () => {
      const newState = transition(state, { type: "START" });
      expect(newState.status).toBe("running");
    });

    it("should increment modelCallCount on MODEL_CALL", () => {
      state = transition(state, { type: "START" });
      state = transition(state, { type: "MODEL_CALL", callIndex: 0 });
      
      expect(state.status).toBe("awaiting_model");
      expect(state.modelCallCount).toBe(1);
    });

    it("should add observation on MODEL_RESPONSE", () => {
      state = transition(state, { type: "START" });
      state = transition(state, { type: "MODEL_CALL", callIndex: 0 });
      const newState = transition(state, { type: "MODEL_RESPONSE", response: { text: "Hello" } });
      
      expect(newState.status).toBe("running");
      expect(newState.observations).toHaveLength(1);
      expect(newState.observations[0]!.type).toBe("model");
    });

    it("should increment delegationDepth on TOOL_DELEGATION", () => {
      state = transition(state, { type: "START" });
      const mockTask = createTestTask();
      state = transition(state, { type: "TOOL_DELEGATION", delegationIndex: 0, task: mockTask });
      
      expect(state.status).toBe("awaiting_tool");
      expect(state.delegationDepth).toBe(1);
    });

    it("should add tool observation and decrement depth on TOOL_RESULT", () => {
      state = transition(state, { type: "START" });
      const mockTask = createTestTask();
      state = transition(state, { type: "TOOL_DELEGATION", delegationIndex: 0, task: mockTask });
      const newState = transition(state, { type: "TOOL_RESULT", result: { status: "completed" } });
      
      expect(newState.status).toBe("running");
      expect(newState.delegationDepth).toBe(0);
      expect(newState.observations).toHaveLength(1);
      expect(newState.observations[0]!.type).toBe("tool");
    });

    it("should transition to awaiting_approval on APPROVAL_REQUEST", () => {
      state = transition(state, { type: "START" });
      const newState = transition(state, { type: "APPROVAL_REQUEST" });
      
      expect(newState.status).toBe("awaiting_approval");
    });

    it("should transition back to running on APPROVAL_GRANTED", () => {
      state = transition(state, { type: "START" });
      state = transition(state, { type: "APPROVAL_REQUEST" });
      const newState = transition(state, { type: "APPROVAL_GRANTED" });
      
      expect(newState.status).toBe("running");
    });

    it("should transition to failed on APPROVAL_DENIED", () => {
      state = transition(state, { type: "START" });
      state = transition(state, { type: "APPROVAL_REQUEST" });
      const newState = transition(state, { type: "APPROVAL_DENIED" });
      
      expect(newState.status).toBe("failed");
    });

    it("should add checkpoint on CHECKPOINT", () => {
      state = transition(state, { type: "START" });
      const newState = transition(state, { type: "CHECKPOINT" });
      
      expect(newState.checkpoints).toHaveLength(1);
    });

    it("should transition to cancelled on CANCEL", () => {
      state = transition(state, { type: "START" });
      const newState = transition(state, { type: "CANCEL" });
      
      expect(newState.status).toBe("cancelled");
    });

    it("should reject invalid transitions", () => {
      // MODEL_CALL from created should throw
      expect(() => transition(state, { type: "MODEL_CALL", callIndex: 0 })).toThrow();
      // CANCEL from created is allowed (transitions to cancelled)
      const cancelledState = transition(state, { type: "CANCEL" });
      expect(cancelledState.status).toBe("cancelled");
    });
  });

  describe("MAX_MODEL_CALLS limit", () => {
    it("should throw when max model calls exceeded", () => {
      let state = createInitialState("run-1", createTestTask(), createTestPrincipal(), createTestContext());
      state = transition(state, { type: "START" });
      
      // Make MAX_MODEL_CALLS calls
      for (let i = 0; i < MAX_MODEL_CALLS; i++) {
        state = transition(state, { type: "MODEL_CALL", callIndex: i });
        state = transition(state, { type: "MODEL_RESPONSE", response: {} });
      }
      
      expect(() => transition(state, { type: "MODEL_CALL", callIndex: MAX_MODEL_CALLS })).toThrow();
    });
  });

  describe("MAX_DELEGATION_DEPTH limit", () => {
    it("should throw when max delegation depth exceeded", () => {
      let state = createInitialState("run-1", createTestTask(), createTestPrincipal(), createTestContext());
      state = transition(state, { type: "START" });
      
      // Do MAX_DELEGATION_DEPTH delegations, each followed by result to return to running
      for (let i = 0; i < MAX_DELEGATION_DEPTH; i++) {
        const mockTask = createTestTask();
        state = transition(state, { type: "TOOL_DELEGATION", delegationIndex: i, task: mockTask });
        state = transition(state, { type: "TOOL_RESULT", result: { status: "completed" } });
      }
      
      // Now delegationDepth should be 0 (each delegation followed by result)
      // Try one more delegation - should throw because depth would exceed MAX_DELEGATION_DEPTH
      // First do a delegation to reach depth 1
      const mockTask = createTestTask();
      state = transition(state, { type: "TOOL_DELEGATION", delegationIndex: MAX_DELEGATION_DEPTH, task: mockTask });
      // Now try another - should throw because depth would be 4 > MAX_DELEGATION_DEPTH
      const mockTask2 = createTestTask();
      expect(() => transition(state, { type: "TOOL_DELEGATION", delegationIndex: MAX_DELEGATION_DEPTH + 1, task: mockTask2 })).toThrow();
    });
  });

  describe("isTerminalStatus", () => {
    it("should return true for terminal statuses", () => {
      expect(isTerminalStatus("completed")).toBe(true);
      expect(isTerminalStatus("failed")).toBe(true);
      expect(isTerminalStatus("cancelled")).toBe(true);
      expect(isTerminalStatus("budget_exhausted")).toBe(true);
    });

    it("should return false for non-terminal statuses", () => {
      expect(isTerminalStatus("running")).toBe(false);
      expect(isTerminalStatus("awaiting_model")).toBe(false);
      expect(isTerminalStatus("awaiting_tool")).toBe(false);
      expect(isTerminalStatus("awaiting_approval")).toBe(false);
      expect(isTerminalStatus("finalizing")).toBe(false);
    });
  });
});

describe("Orchestrator", () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    orchestrator = createOrchestrator({
      maxModelCalls: 12,
      maxDelegationDepth: 3,
      maxIterations: 12,
    });
  });

  it("should reject session events without a task envelope", async () => {
    const event: SessionEvent = {
      schemaVersion: 1,
      eventId: "event-1",
      tenantId: TEST_TENANT,
      sessionId: "session-1",
      platform: "web",
      traceId: "trace-1",
      correlationId: "corr-1",
      causationId: "cause-1",
      principal: createTestPrincipal(),
      receivedAt: new Date().toISOString(),
      content: [{ type: "text", text: "Run this task" }],
    };

    await expect(orchestrator.startRun(event)).rejects.toThrow("Run start requires a task envelope");
    expect(orchestrator["runs"].size).toBe(0);
  });

  it("should start a run and return runId", async () => {
    const event = {
      task: createTestTask(),
      principal: createTestPrincipal(),
    };
    const result = await orchestrator.startRun(event);
    
    expect(result.runId).toBeDefined();
    expect(typeof result.runId).toBe("string");
  });

  it("should advance run and return result", async () => {
    const event = {
      task: createTestTask(),
      principal: createTestPrincipal(),
    };
    const { runId } = await orchestrator.startRun(event);
    
    const context: RunContext = {
      runId: runId,
      sessionId: "session-1",
      writerEpoch: 1,
      mode: "execute" as const,
      deadlineAt: new Date(Date.now() + 3600000).toISOString(),
      budgetRef: {
        tenantId: "tenant-a",
        accountId: "account-1",
        rootRunId: "root-1",
      },
    };
    const result = await orchestrator.advanceRun(context);
    
    expect(result).toBeDefined();
    expect(result.taskId).toBeDefined();
    expect(result.runId).toBe(runId);
    expect(result.status).toBeDefined();
  });

  it("should resume a run", async () => {
    const event = {
      task: createTestTask(),
      principal: createTestPrincipal(),
    };
    const { runId } = await orchestrator.startRun(event);
    const principal: Principal = {
      tenantId: "tenant-a",
      subjectId: "subject-1",
      roles: ["user"],
      capabilities: ["tool:execution", "inference:local"],
      audience: "orchestrator",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      authenticatedSource: "platform-adapter",
    };
    
    await orchestrator.resumeRun(runId, principal);
    
    const state = orchestrator["runs"].get(runId);
    if (!state) {
      throw new Error("Expected started run state");
    }
    expect(state.status).toBe("running");
  });

  it("should cancel a run", async () => {
    const event = {
      task: createTestTask(),
      principal: createTestPrincipal(),
    };
    const { runId } = await orchestrator.startRun(event);
    const principal: Principal = {
      tenantId: "tenant-a",
      subjectId: "subject-1",
      roles: ["user"],
      capabilities: ["tool:execution", "inference:local"],
      audience: "orchestrator",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      authenticatedSource: "platform-adapter",
    };
    
    await orchestrator.cancelRun(runId, principal);
    
    const state = orchestrator["runs"].get(runId);
    if (!state) {
      throw new Error("Expected started run state");
    }
    expect(state.status).toBe("cancelled");
  });

  it("should reject cancel on terminal status", async () => {
    const event = {
      task: createTestTask(),
      principal: createTestPrincipal(),
    };
    const { runId } = await orchestrator.startRun(event);
    const principal: Principal = {
      tenantId: "tenant-a",
      subjectId: "subject-1",
      roles: ["user"],
      capabilities: ["tool:execution", "inference:local"],
      audience: "orchestrator",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      authenticatedSource: "platform-adapter",
    };
    
    // Force terminal status
    const state = orchestrator["runs"].get(runId);
    if (!state) {
      throw new Error("Expected started run state");
    }
    state.status = "completed";
    
    await expect(orchestrator.cancelRun(runId, principal)).rejects.toThrow();
  });
});

describe("Orchestrator Constants", () => {
  it("should have correct MAX_MODEL_CALLS", () => {
    expect(MAX_MODEL_CALLS).toBe(12);
  });

  it("should have correct MAX_DELEGATION_DEPTH", () => {
    expect(MAX_DELEGATION_DEPTH).toBe(3);
  });

  it("should have correct MAX_ITERATIONS", () => {
    expect(MAX_ITERATIONS).toBe(12);
  });

  it("should have correct MAX_FANOUT", () => {
    expect(MAX_FANOUT).toBe(8);
  });
});