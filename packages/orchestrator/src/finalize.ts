import type { TaskResult, RunContext, Principal } from "@asi/contracts";

export interface FinalizationConfig {
  requireReceipt: boolean;
  persistObservations: boolean;
}

export interface FinalizationResult {
  success: boolean;
  result?: TaskResult;
  error?: string;
}

export async function finalizeRun(
  runId: string,
  context: RunContext,
  observations: unknown[],
  modelCallCount: number,
  config: FinalizationConfig = { requireReceipt: true, persistObservations: true }
): Promise<FinalizationResult> {
  try {
    // Create final result
    const result: TaskResult = {
      schemaVersion: 1,
      taskId: `task-${runId}`,
      runId: context.runId,
      traceId: `trace-${runId}`,
      usage: { 
        inputTokens: 0, 
        outputTokens: 0 
      },
      evidenceRefs: [],
      status: "completed",
      output: { 
        completed: true, 
        observations: observations.length,
        requireReceipt: config.requireReceipt,
        persistObservations: config.persistObservations,
      },
    };

    return { success: true, result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Finalization failed",
    };
  }
}

export async function cancelRun(
  runId: string,
  context: RunContext,
  principal: Principal
): Promise<FinalizationResult> {
  try {
    // Verify principal has authority to cancel this run
    if (principal.subjectId !== context.runId && !principal.roles.includes("admin")) {
      return {
        success: false,
        error: "Principal not authorized to cancel this run",
      };
    }

    return {
      success: true,
      result: {
        schemaVersion: 1,
        taskId: `task-${runId}`,
        runId,
        traceId: `trace-${runId}`,
        usage: { inputTokens: 0, outputTokens: 0 },
        evidenceRefs: [],
        status: "cancelled",
        error: {
          code: "CANCELLED",
          safeMessage: "Run cancelled by user",
          retryable: false,
        },
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Cancellation failed",
    };
  }
}

export async function replayRun(
  runId: string,
  originalContext: RunContext,
  recordedObservations: unknown[]
): Promise<FinalizationResult> {
  return {
    success: true,
    result: {
      schemaVersion: 1,
      taskId: `replay-${runId}`,
      runId: originalContext.runId,
      traceId: `trace-${runId}`,
      usage: { inputTokens: 0, outputTokens: 0 },
      evidenceRefs: [],
      status: "completed",
      output: { replayed: true, originalObservations: recordedObservations.length },
    },
  };
}

export function createFinalizer(config?: Partial<FinalizationConfig>) {
  const finalConfig: FinalizationConfig = {
    requireReceipt: config?.requireReceipt ?? true,
    persistObservations: config?.persistObservations ?? true,
  };

  return {
    finalizeRun: (runId: string, context: RunContext, observations: unknown[], modelCallCount: number) =>
      finalizeRun(runId, context, observations, modelCallCount, finalConfig),
    cancelRun: (runId: string, context: RunContext, principal: Principal) =>
      cancelRun(runId, context, principal),
    replayRun: (runId: string, originalContext: RunContext, recordedObservations: unknown[]) =>
      replayRun(runId, originalContext, recordedObservations),
  };
}