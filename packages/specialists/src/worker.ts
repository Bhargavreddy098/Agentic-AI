import type { TaskEnvelope, TaskResult, NormalizedError } from "@asi/contracts";
import { normalizeError } from "@asi/tools";

export interface WorkerConfig {
  maxIterations: number;
  maxFanout: number;
  iterationTimeoutMs: number;
}

export interface ExecutionContext {
  task: TaskEnvelope;
  signal: AbortSignal;
  iteration: number;
}

export async function executeTask(
  task: TaskEnvelope,
  signal: AbortSignal
): Promise<TaskResult> {
  try {
    const result = await executeWithRetry(task, signal);
    return result;
  } catch (err) {
    const normalized = normalizeError(err, { operation: "worker-execution", traceId: task.traceId });
    return {
      schemaVersion: 1,
      taskId: task.taskId,
      runId: task.runContext.runId,
      traceId: task.traceId,
      usage: { inputTokens: 0, outputTokens: 0 },
      evidenceRefs: [],
      status: "failed",
      error: normalized,
    };
  }
}

async function executeWithRetry(
  task: TaskEnvelope,
  signal: AbortSignal
): Promise<TaskResult> {

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (signal.aborted) {
      return createCancelledResult(task);
    }

    try {
      const result = await executeSingleIteration(task, signal);
      if (result.status === "completed") {
        return result;
      }
      if (result.status === "failed" && !isRetryable(result.error)) {
        return result;
      }
      // Retry on transient failures
      await delay(1000 * Math.pow(2, attempt - 1));
    } catch (err) {
      const normalized = normalizeError(err, { operation: "iteration" });
      if (!isRetryable(normalized)) {
        return createFailedResult(task, normalized);
      }
      await delay(1000 * Math.pow(2, attempt - 1));
    }
  }

  return createFailedResult(task, {
    code: "TIMEOUT",
    safeMessage: "Max retries exceeded",
    retryable: false,
  });
}

async function executeSingleIteration(
  task: TaskEnvelope,
  signal: AbortSignal
): Promise<TaskResult> {
  // Check iteration limit
  if (signal.aborted) {
    return createCancelledResult(task);
  }

  // In a real implementation, this would:
  // 1. Check if we're at iteration limit
  // 2. Execute the task using the tool dispatcher
  // 3. Handle fanout for subtasks
  // 4. Return result
  
  // For now, return a mock completed result
  return {
    schemaVersion: 1,
    taskId: task.taskId,
    runId: task.runContext.runId,
    traceId: task.traceId,
    usage: { inputTokens: 0, outputTokens: 0 },
    evidenceRefs: [],
    status: "completed",
    output: { completed: true },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryable(error: NormalizedError | null | undefined): boolean {
  if (!error) return false;
  const retryableCodes = ["TIMEOUT", "DEPENDENCY_UNAVAILABLE", "EXECUTION_FAILED"];
  return error.retryable && retryableCodes.includes(error.code);
}

function createCancelledResult(task: TaskEnvelope): TaskResult {
  return {
    schemaVersion: 1,
    taskId: task.taskId,
    runId: task.runContext.runId,
    traceId: task.traceId,
    usage: { inputTokens: 0, outputTokens: 0 },
    evidenceRefs: [],
    status: "cancelled",
    error: {
      code: "CANCELLED",
      safeMessage: "Execution cancelled",
      retryable: false,
    },
  };
}

function createFailedResult(task: TaskEnvelope, error: NormalizedError): TaskResult {
  return {
    schemaVersion: 1,
    taskId: task.taskId,
    runId: task.runContext.runId,
    traceId: task.traceId,
    usage: { inputTokens: 0, outputTokens: 0 },
    evidenceRefs: [],
    status: "failed",
    error,
  };
}