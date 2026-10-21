import { randomBytes } from "crypto";
import type { RunContext, TaskEnvelope, TaskResult, Principal, SessionEvent } from "@asi/contracts";
import { type RunState, type RunStatus, createInitialState, transition, isTerminalStatus } from "./transitions.js";

export interface OrchestratorConfig {
  maxModelCalls: number;
  maxDelegationDepth: number;
  maxIterations: number;
}

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  maxModelCalls: 12,
  maxDelegationDepth: 3,
  maxIterations: 12,
};

export interface StartRunRequest {
  task: TaskEnvelope;
  principal: Principal;
}

export interface RunHandle {
  runId: string;
  status: RunStatus;
  context: RunContext;
}

export class Orchestrator {
  private config: OrchestratorConfig;
  private runs: Map<string, RunState> = new Map();

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
  }

  async startRun(event: SessionEvent | StartRunRequest): Promise<{ runId: string }> {
    const runId = `run-${Date.now()}-${randomBytes(8).toString("hex")}`;
    
    // Extract task and principal from event
    if (!("task" in event)) {
      throw new Error("Run start requires a task envelope");
    }
    const { task, principal } = event;
    const context = task.runContext;

    // Create initial run state
    const state = createInitialState(runId, task, principal, context);
    state.status = "running";
    this.runs.set(runId, state);

    return { runId };
  }

  async resumeRun(runId: string, principal: Principal): Promise<void> {
    const state = this.runs.get(runId);
    if (!state) {
      throw new Error(`Run not found: ${runId}`);
    }

    if (state.principal.tenantId !== principal.tenantId) {
      throw new Error("Unauthorized: tenant mismatch");
    }

    if (isTerminalStatus(state.status)) {
      throw new Error(`Cannot resume run in terminal status: ${state.status}`);
    }

    state.status = "running";
    state.updatedAt = new Date().toISOString();
    this.runs.set(runId, state);
  }

  async cancelRun(runId: string, principal: Principal): Promise<void> {
    const state = this.runs.get(runId);
    if (!state) {
      throw new Error(`Run not found: ${runId}`);
    }

    if (state.principal.tenantId !== principal.tenantId) {
      throw new Error("Unauthorized: tenant mismatch");
    }

    if (isTerminalStatus(state.status)) {
      throw new Error(`Cannot cancel run in terminal status: ${state.status}`);
    }

    const newState = transition(state, { type: "CANCEL" });
    this.runs.set(runId, newState);
  }

  async advanceRun(context: RunContext): Promise<TaskResult> {
    const runId = context.runId;
    const state = this.runs.get(runId);
    if (!state) {
      throw new Error(`Run not found: ${runId}`);
    }

    if (isTerminalStatus(state.status)) {
      throw new Error(`Run in terminal status: ${state.status}`);
    }

    return await this.executeRunLoop(state);
  }

  private async executeRunLoop(state: RunState): Promise<TaskResult> {
    let currentState = state;
    let iterations = 0;

    while (!isTerminalStatus(currentState.status) && iterations < this.config.maxIterations) {
      iterations++;

      // Check model call limit
      if (currentState.modelCallCount >= this.config.maxModelCalls) {
        const newState = transition(currentState, { type: "ERROR", error: new Error("Max model calls exceeded") });
        this.runs.set(currentState.runId, newState);
        throw new Error("Max model calls exceeded");
      }

      // Check delegation depth
      if (currentState.delegationDepth >= this.config.maxDelegationDepth) {
        const newState = transition(currentState, { type: "ERROR", error: new Error("Max delegation depth exceeded") });
        this.runs.set(currentState.runId, newState);
        throw new Error("Max delegation depth exceeded");
      }

      // Execute one step based on current status and update state
      currentState = await this.executeStep(currentState);
      this.runs.set(currentState.runId, currentState);
    }

    if (iterations >= this.config.maxIterations) {
      return this.createFailedResult(currentState, "Max iterations exceeded");
    }

    if (currentState.status === "finalizing") {
      return this.finalizeRun(currentState);
    }

    if (currentState.status === "cancelled") {
      return this.createCancelledResult(currentState);
    }

    return this.createFailedResult(currentState, `Run ended with status: ${currentState.status}`);
  }

  private async executeStep(state: RunState): Promise<RunState> {
    let currentState = state;
    switch (currentState.status) {
      case "running": {
        // Model call transition
        currentState = transition(currentState, { type: "MODEL_CALL", callIndex: currentState.modelCallCount });

        // Simulate response that delegates to a tool
        const mockResponse = {
          toolCalls: currentState.delegationDepth < 3 ? [{
            name: "example_tool",
            arguments: { action: "process", data: currentState.task.input }
          }] : []
        };

        currentState = transition(currentState, { type: "MODEL_RESPONSE", response: mockResponse });

        const toolCall = mockResponse.toolCalls[0];
        if (toolCall !== undefined) {
          // Delegate to specialist
          const delegationTask = this.createDelegationTask(currentState, toolCall);

          currentState = transition(currentState, { type: "TOOL_DELEGATION", delegationIndex: currentState.delegationDepth, task: delegationTask });

          // Tool result
          const toolResult: TaskResult = {
            schemaVersion: 1,
            taskId: "mock",
            runId: currentState.runId,
            traceId: currentState.task.traceId,
            usage: { inputTokens: 0, outputTokens: 0 },
            evidenceRefs: [],
            status: "completed",
            output: { completed: true },
          };

          currentState = transition(currentState, { type: "TOOL_RESULT", result: toolResult });
        }
        break;
      }

      case "awaiting_approval":
        break;

      case "awaiting_model":
        break;

      default:
        break;
    }
    return currentState;
  }

  private createDelegationTask(state: RunState, toolCall: { name: string; arguments: unknown }): TaskEnvelope {
    return {
      schemaVersion: 1,
      taskId: `delegation-${state.delegationDepth}-${randomBytes(8).toString("hex")}`,
      traceId: state.task.traceId,
      correlationId: state.task.correlationId,
      causationId: state.task.causationId,
      runContext: state.context,
      requiredCapabilities: ["tool:execution"],
      input: { tool: toolCall.name, arguments: toolCall.arguments },
      principalGrant: state.task.principalGrant,
      idempotencyKey: `delegation-${state.runId}-${state.delegationDepth}`,
    };
  }

  private async finalizeRun(state: RunState): Promise<TaskResult> {
    state.status = "completed";
    state.updatedAt = new Date().toISOString();

    return {
      schemaVersion: 1,
      taskId: state.task.taskId,
      runId: state.runId,
      traceId: state.task.traceId,
      usage: { inputTokens: state.modelCallCount * 10, outputTokens: state.observations.length * 10 },
      evidenceRefs: state.checkpoints.map(c => ({ artifactId: c, contentHash: "" })),
      status: "completed",
      output: { completed: true, observations: state.observations.length },
    };
  }

  private createFailedResult(state: RunState, reason: string): TaskResult {
    return {
      schemaVersion: 1,
      taskId: state.task.taskId,
      runId: state.runId,
      traceId: state.task.traceId,
      usage: { inputTokens: 0, outputTokens: 0 },
      evidenceRefs: state.checkpoints.map(c => ({ artifactId: c, contentHash: "" })),
      status: "failed",
      error: {
        code: "UNKNOWN_OUTCOME",
        safeMessage: reason,
        retryable: false,
      },
    };
  }

  private createCancelledResult(state: RunState): TaskResult {
    return {
      schemaVersion: 1,
      taskId: state.task.taskId,
      runId: state.runId,
      traceId: state.task.traceId,
      usage: { inputTokens: 0, outputTokens: 0 },
      evidenceRefs: state.checkpoints.map(c => ({ artifactId: c, contentHash: "" })),
      status: "cancelled",
      error: {
        code: "CANCELLED",
        safeMessage: "Run cancelled",
        retryable: false,
      },
    };
  }
}

export function createOrchestrator(config?: Partial<OrchestratorConfig>): Orchestrator {
  return new Orchestrator(config);
}