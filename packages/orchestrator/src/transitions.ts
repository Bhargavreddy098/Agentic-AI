import type { RunContext, TaskResult, TaskEnvelope, OpaqueId, Principal } from "@asi/contracts";

export type RunStatus = 
  | "created"
  | "running"
  | "awaiting_tool"
  | "awaiting_approval"
  | "awaiting_model"
  | "delegating"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled"
  | "budget_exhausted";

export type RunEvent = 
  | { type: "START"; task?: TaskEnvelope; principal?: Principal }
  | { type: "MODEL_CALL"; callIndex: number }
  | { type: "MODEL_RESPONSE"; response: unknown }
  | { type: "TOOL_DELEGATION"; delegationIndex: number; task: TaskEnvelope }
  | { type: "TOOL_RESULT"; result: Partial<TaskResult> | Record<string, unknown> }
  | { type: "APPROVAL_REQUEST" }
  | { type: "APPROVAL_GRANTED" }
  | { type: "APPROVAL_DENIED" }
  | { type: "CHECKPOINT" }
  | { type: "FINALIZE" }
  | { type: "CANCEL" }
  | { type: "BUDGET_EXCEEDED" }
  | { type: "ERROR"; error: Error };

export interface RunState {
  runId: OpaqueId;
  status: RunStatus;
  context: RunContext;
  task: TaskEnvelope;
  principal: Principal;
  modelCallCount: number;
  delegationDepth: number;
  currentTask?: TaskEnvelope;
  observations: Array<{ type: "model" | "tool"; data: unknown }>;
  checkpoints: OpaqueId[];
  createdAt: string;
  updatedAt: string;
}

export const MAX_MODEL_CALLS = 12;
export const MAX_DELEGATION_DEPTH = 3;
export const MAX_ITERATIONS = 12;
export const MAX_FANOUT = 8;

export function createInitialState(
  runId: OpaqueId,
  task: TaskEnvelope,
  principal: Principal,
  context: RunContext
): RunState {
  return {
    runId,
    status: "created",
    context,
    task,
    principal,
    modelCallCount: 0,
    delegationDepth: 0,
    observations: [],
    checkpoints: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function transition(state: RunState, event: RunEvent): RunState {
  const newState = { ...state, updatedAt: new Date().toISOString() };

  switch (event.type) {
    case "START":
      if (state.status !== "created") {
        throw new Error(`Cannot start run in status: ${state.status}`);
      }
      return { ...newState, status: "running" };

    case "MODEL_CALL":
      if (state.modelCallCount >= MAX_MODEL_CALLS) {
        throw new Error(`Maximum model calls (${MAX_MODEL_CALLS}) exceeded`);
      }
      if (state.status !== "running" && state.status !== "awaiting_model") {
        throw new Error(`Cannot make model call in status: ${state.status}`);
      }
      return { 
        ...newState, 
        status: "awaiting_model",
        modelCallCount: state.modelCallCount + 1 
      };

    case "MODEL_RESPONSE":
      if (state.status !== "awaiting_model") {
        throw new Error(`Unexpected model response in status: ${state.status}`);
      }
      newState.observations.push({ type: "model", data: event.response });
      return { ...newState, status: "running" };

    case "TOOL_DELEGATION":
      if (state.delegationDepth >= MAX_DELEGATION_DEPTH) {
        throw new Error(`Maximum delegation depth (${MAX_DELEGATION_DEPTH}) exceeded`);
      }
      if (state.status !== "running") {
        throw new Error(`Cannot delegate in status: ${state.status}`);
      }
      newState.currentTask = event.task;
      return { 
        ...newState, 
        status: "awaiting_tool",
        delegationDepth: state.delegationDepth + 1 
      };

    case "TOOL_RESULT":
      if (state.status !== "awaiting_tool") {
        throw new Error(`Unexpected tool result in status: ${state.status}`);
      }
      newState.observations.push({ type: "tool", data: event.result });
      newState.delegationDepth = Math.max(0, state.delegationDepth - 1);
      delete newState.currentTask;
      return { ...newState, status: "running" };

    case "APPROVAL_REQUEST":
      if (state.status !== "running") {
        throw new Error(`Cannot request approval in status: ${state.status}`);
      }
      return { ...newState, status: "awaiting_approval" };

    case "APPROVAL_GRANTED":
      if (state.status !== "awaiting_approval") {
        throw new Error(`Approval not requested`);
      }
      return { ...newState, status: "running" };

    case "APPROVAL_DENIED":
      if (state.status !== "awaiting_approval") {
        throw new Error(`Approval not requested`);
      }
      return { ...newState, status: "failed" };

    case "CHECKPOINT": {
      const checkpointId = `checkpoint-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      newState.checkpoints.push(checkpointId);
      return newState;
    }

    case "FINALIZE":
      if (state.status !== "running") {
        throw new Error(`Cannot finalize in status: ${state.status}`);
      }
      return { ...newState, status: "finalizing" };

    case "CANCEL":
      if (["completed", "failed", "cancelled"].includes(state.status)) {
        throw new Error(`Cannot cancel run in status: ${state.status}`);
      }
      return { ...newState, status: "cancelled" };

    case "BUDGET_EXCEEDED":
      return { ...newState, status: "budget_exhausted" };

    case "ERROR":
      return { ...newState, status: "failed" };

    default:
      return newState;
  }
}

export function isTerminalStatus(status: RunStatus): boolean {
  return ["completed", "failed", "cancelled", "budget_exhausted"].includes(status);
}

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  const validTransitions: Record<RunStatus, RunStatus[]> = {
    created: ["running"],
    running: ["awaiting_model", "awaiting_tool", "awaiting_approval", "delegating", "finalizing", "failed", "cancelled", "budget_exhausted"],
    awaiting_model: ["running", "failed"],
    awaiting_tool: ["running", "failed", "awaiting_approval"],
    awaiting_approval: ["running", "failed"],
    delegating: ["running", "failed", "awaiting_approval"],
    finalizing: ["completed", "failed"],
    completed: [],
    failed: [],
    cancelled: [],
    budget_exhausted: [],
  };

  return validTransitions[from]?.includes(to) ?? false;
}