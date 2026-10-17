import type { TaskResult } from "@asi/contracts";

export type A2ATaskStatus = "pending" | "working" | "input-required" | "completed" | "failed" | "canceled" | "auth-required" | "unknown";

const A2A_TASK_STATUSES = new Set<A2ATaskStatus>([
  "pending", "working", "input-required", "completed", "failed", "canceled", "auth-required", "unknown",
]);

export function checkedA2aStatus(value: unknown): A2ATaskStatus {
  if (typeof value !== "string" || !A2A_TASK_STATUSES.has(value as A2ATaskStatus))
    throw new Error("A2A_STATUS: unknown remote status");
  return value as A2ATaskStatus;
}

export const A2A_TO_LOCAL_STATUS: Record<A2ATaskStatus, TaskResult["status"]> = {
  "pending": "unknown",
  "working": "unknown",
  "input-required": "unknown",
  "completed": "completed",
  "failed": "failed",
  "canceled": "cancelled",
  "auth-required": "unknown",
  "unknown": "unknown",
};

export const LOCAL_TO_A2A_STATUS: Record<TaskResult["status"], A2ATaskStatus> = {
  "completed": "completed",
  "failed": "failed",
  "cancelled": "canceled",
  "budget_exhausted": "failed",
  "unknown": "unknown",
};

export function mapA2aToLocal(a2aStatus: A2ATaskStatus): TaskResult["status"] {
  return A2A_TO_LOCAL_STATUS[a2aStatus] ?? "unknown";
}

export function mapLocalToA2a(localStatus: TaskResult["status"]): A2ATaskStatus {
  return LOCAL_TO_A2A_STATUS[localStatus] ?? "unknown";
}

export interface RemoteTaskState {
  taskId: string;
  contextId: string;
  status: A2ATaskStatus;
  history: { status: A2ATaskStatus; timestamp: string; message?: string | undefined }[];
  artifacts: unknown[];
  remoteError?: { code: string; message: string; recoverable: boolean };
}

export function createRemoteTaskState(taskId: string, contextId: string): RemoteTaskState {
  return {
    taskId,
    contextId,
    status: "pending",
    history: [{ status: "pending", timestamp: new Date().toISOString(), message: undefined }],
    artifacts: [],
  };
}

export function updateRemoteTaskState(state: RemoteTaskState, status: A2ATaskStatus, message?: string): RemoteTaskState {
  return {
    ...state,
    status,
    history: [...state.history, { status, timestamp: new Date().toISOString(), message }],
  };
}

export function isTerminalA2aStatus(status: A2ATaskStatus): boolean {
  return ["completed", "failed", "canceled"].includes(status);
}