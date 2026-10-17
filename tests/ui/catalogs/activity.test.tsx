// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { filterTasks, paginateTasks, usageLabel, canonicalDecision, decisionHref, reconcileTasks, cancelTask } from "@asi/web/features/activity/activity.ts";
import { ActivityTasks } from "@asi/web/features/activity/ActivityTasks.tsx";
import { ActivityUsage } from "@asi/web/features/activity/ActivityUsage.tsx";
import { TaskViewSchema, ClarificationRequestSchema, UiApprovalRequestSchema, type Interaction, type TaskView } from "../../../packages/contracts/src/ui/index.js";

const makeTask = (overrides = {}): TaskView => TaskViewSchema.parse({ taskId: "t1", conversationId: "conv-1", runId: "r1", version: 1, status: "running", summary: "Summarize the docs.", allowedActions: ["run.cancel"], evidenceRefs: ["ev1"], ...overrides });
const makeClarification = (overrides = {}): Interaction => ClarificationRequestSchema.parse({ interactionId: "i1", conversationId: "conv-1", runId: "r1", version: 1, type: "clarification", questionId: "q1", status: "pending", prompt: "Which scope?", options: [{ optionId: "o1", label: "Global" }], allowFreeText: true, allowMultiple: false, required: true, ...overrides });
const makeApproval = (overrides = {}): Interaction => UiApprovalRequestSchema.parse({ interactionId: "i2", conversationId: "conv-2", runId: "r2", version: 1, type: "approval", approvalId: "a1", effectId: "e1", status: "pending", action: "Delete records", target: "memory/m1", preview: "Deletes record m1", expiresAt: "2026-10-17T00:00:00.000Z", requiredActorRole: "operator", actionRef: "ref1", ...overrides });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("activity filtering and paging", () => {
  it("filters by status and pages deterministically", () => {
    const tasks = [makeTask({ taskId: "t1", status: "running" }), makeTask({ taskId: "t2", status: "completed" }), makeTask({ taskId: "t3", status: "running" })];
    expect(filterTasks(tasks, "running").map(t => t.taskId)).toEqual(["t1", "t3"]);
    expect(filterTasks(tasks, undefined).length).toBe(3);
    expect(paginateTasks(tasks, 0, 2)).toEqual({ items: tasks.slice(0, 2), nextCursor: 2 });
    expect(paginateTasks(tasks, 2, 2)).toEqual({ items: [tasks[2]], nextCursor: null });
  });

  it("renders distinct statuses and receipt references with no Approve/Reject controls", () => {
    render(<ActivityTasks tasks={[makeTask({ taskId: "t1", status: "queued" }), makeTask({ taskId: "t2", status: "running" }), makeTask({ taskId: "t3", status: "completed" }), makeTask({ taskId: "t4", status: "failed" }), makeTask({ taskId: "t5", status: "cancelled" }), makeTask({ taskId: "t6", status: "unknown" })]} />);
    for (const status of ["queued", "running", "completed", "failed", "cancelled", "unknown"]) expect(screen.getByTestId(`task-t${["queued", "running", "completed", "failed", "cancelled", "unknown"].indexOf(status) + 1}`)).toHaveAttribute("data-status", status);
    expect(screen.getByTestId("task-receipts-t1")).toHaveTextContent("ev1");
    expect(screen.queryByRole("button", { name: /approve|reject/i })).toBeNull();
  });
});

describe("usage metrics never invent zero", () => {
  it("shows Not reported for unknown usage and real values otherwise", () => {
    expect(usageLabel(null, "tokens")).toBe("Not reported");
    expect(usageLabel(0, "tokens")).toBe("0 tokens");
    const unknown = render(<ActivityUsage usage={{ inputTokens: null, outputTokens: null, costMicroUsd: null }} />);
    expect(screen.getAllByText("Not reported")).toHaveLength(3);
    expect(screen.queryByText("0 tokens")).toBeNull();
    unknown.unmount();
    render(<ActivityUsage usage={{ inputTokens: 10, outputTokens: 5, costMicroUsd: null }} />);
    expect(screen.getByTestId("usage-input")).toHaveTextContent("10 tokens");
    expect(screen.getByTestId("usage-output")).toHaveTextContent("5 tokens");
    expect(screen.getByTestId("usage-cost")).toHaveTextContent("Not reported");
  });
});

describe("canonical decision links", () => {
  it("keeps one canonical decision per interaction and opens the exact original card", () => {
    const duplicated = [makeClarification({ version: 1 }), makeClarification({ version: 3 })];
    const canonical = canonicalDecision(duplicated);
    expect(canonical?.interactionId).toBe("i1");
    expect(canonical?.version).toBe(3);
    expect(canonicalDecision([makeApproval(), makeClarification()])?.status).toBe("pending");
    expect(decisionHref(makeClarification({ conversationId: "conv-1", interactionId: "i1" }))).toBe("/chat/conv-1?interaction=i1");
    const onOpenDecision = vi.fn();
    render(<ActivityTasks tasks={[makeTask()]} interactions={duplicated} onOpenDecision={onOpenDecision} />);
    const buttons = screen.getAllByTestId("decision-i1");
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    expect(onOpenDecision).toHaveBeenCalledWith("/chat/conv-1?interaction=i1");
  });
});

describe("shared task state reconciliation", () => {
  it("prevents duplicates and regressions and allows forward progress", () => {
    const running = makeTask({ version: 1, status: "running" });
    expect(reconcileTasks([running], makeTask({ version: 1, status: "running" }))).toHaveLength(1);
    const completed = makeTask({ version: 2, status: "completed" });
    expect(reconcileTasks([completed], makeTask({ version: 3, status: "running" }))[0]!.status).toBe("completed");
    expect(reconcileTasks([running], completed)[0]!.status).toBe("completed");
    expect(reconcileTasks([running], makeTask({ taskId: "t2", version: 1 }))).toHaveLength(2);
  });
});

describe("cancellation commands", () => {
  it("cancels only permitted tasks and maps outcomes", async () => {
    const allowed = makeTask();
    const denied = makeTask({ taskId: "t2", allowedActions: [] });
    const onCancel = vi.fn();
    render(<ActivityTasks tasks={[allowed, denied]} onCancel={onCancel} />);
    expect(screen.getAllByRole("button", { name: "Cancel run" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel run" }));
    expect(onCancel).toHaveBeenCalledWith(allowed);
    const applied = await cancelTask({ cancelRun: vi.fn(async () => ({ commandId: "c", status: "applied" as const, revision: 3 })) }, allowed, "c");
    expect(applied).toEqual({ kind: "applied", revision: 3 });
    const rejected = await cancelTask({ cancelRun: vi.fn(async () => ({ commandId: "c", status: "rejected" as const, revision: 2, error: { code: "POLICY_DENIED" as const, safeMessage: "Not permitted.", retryable: false } })) }, allowed, "c");
    expect(rejected).toEqual({ kind: "error", code: "POLICY_DENIED", message: "Not permitted." });
  });

  it("renders summaries as inert text", () => {
    render(<ActivityTasks tasks={[makeTask({ summary: "<script>window.__act = true</script>" })]} />);
    expect((window as unknown as { __act?: boolean }).__act).toBeUndefined();
    expect(screen.getByText(/window.__act = true/)).toBeTruthy();
  });
});
