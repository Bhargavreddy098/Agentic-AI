import { describe, it, expect, vi } from "vitest";
import { createMastraAdapter, type MastraPort } from "@asi/orchestrator";
import type { Principal, RunContext, TaskEnvelope, TaskResult } from "@asi/contracts";

const execution = vi.hoisted((): { signals: AbortSignal[] } => ({ signals: [] }));

vi.mock("@asi/specialists", () => ({
  executeTask: async (task: TaskEnvelope, signal: AbortSignal): Promise<TaskResult> => {
    execution.signals.push(signal);
    return {
      schemaVersion: 1,
      taskId: task.taskId,
      runId: task.runContext.runId,
      traceId: task.traceId,
      usage: { inputTokens: 0, outputTokens: 0 },
      evidenceRefs: [],
      status: "completed",
      output: { processed: true },
    };
  },
}));

describe("MastraAdapter", () => {
  it("should pass a usable abort signal when executing a model tool call", async () => {
    execution.signals.length = 0;
    const principal: Principal = {
      tenantId: "tenant-a",
      subjectId: "subject-1",
      roles: ["user"],
      capabilities: ["tool:execution", "inference:local"],
      audience: "orchestrator",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      authenticatedSource: "platform-adapter",
    };
    const context: RunContext = {
      runId: "run-1",
      sessionId: "session-1",
      writerEpoch: 1,
      mode: "execute",
      deadlineAt: new Date(Date.now() + 3600000).toISOString(),
      budgetRef: { tenantId: "tenant-a", accountId: "account-1", rootRunId: "root-1" },
    };
    const task: TaskEnvelope = {
      schemaVersion: 1,
      taskId: "task-1",
      traceId: "trace-1",
      correlationId: "corr-1",
      causationId: "cause-1",
      runContext: context,
      requiredCapabilities: ["tool:execution"],
      input: { test: true },
      principalGrant: principal,
      idempotencyKey: "idem-1",
    };
    let modelCalls = 0;
    const modelPort: MastraPort = {
      async generateText() {
        modelCalls++;
        return modelCalls === 1
          ? { text: "", toolCalls: [{ name: "example_tool", arguments: { action: "process" } }] }
          : { text: "All done" };
      },
      async *streamText() {
        yield { text: "" };
      },
    };
    const adapter = createMastraAdapter({
      orchestrator: { maxModelCalls: 2, maxDelegationDepth: 3, maxIterations: 12 },
      modelProvider: "test-provider",
      maxTokens: 128,
    }, modelPort);

    const result = await adapter.executeOrchestration(task, context, principal);

    expect(result.result).toBe("All done");
    expect(result.modelCalls).toBe(2);
    expect(result.observations).toHaveLength(3);
    expect(result.observations[1]?.type).toBe("tool");
    expect(execution.signals).toHaveLength(1);
    expect(execution.signals[0]).toBeInstanceOf(AbortSignal);
    expect(execution.signals[0]?.aborted).toBe(false);
  });
});
