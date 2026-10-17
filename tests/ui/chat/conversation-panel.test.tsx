// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConversationPanel } from "@asi/web/features/chat/ConversationPanel.tsx";
import {
  ArtifactViewSchema, ClarificationRequestSchema, TaskViewSchema, ToolViewSchema, UiApprovalRequestSchema,
  type ClarificationAnswer, type ClarificationRequest, type TaskView, type ToolView, type ArtifactView, type UiApprovalRequest, type UiCommandResult,
} from "../../../packages/contracts/src/ui/index.js";

const base = { interactionId: "i1", conversationId: "c1", runId: "r1", version: 1 };
const makeQuestion = (status: ClarificationRequest["status"] = "pending"): ClarificationRequest => ClarificationRequestSchema.parse({
  ...base, type: "clarification", questionId: "q1", status, prompt: "How detailed should the synthetic answer be?",
  options: [{ optionId: "concise", label: "Concise" }, { optionId: "detailed", label: "Detailed" }], allowFreeText: true, allowMultiple: false, required: true,
});
const makeApproval = (status: UiApprovalRequest["status"] = "pending"): UiApprovalRequest => UiApprovalRequestSchema.parse({
  ...base, interactionId: "i2", type: "approval", approvalId: "a1", effectId: "e1", status, action: "Simulated document read", target: "Synthetic example document",
  preview: "No file, network or provider action will occur.", expiresAt: "2099-01-01T00:00:00Z", requiredActorRole: "user", actionRef: "bound-1",
});
const makeTask = (): TaskView => TaskViewSchema.parse({ taskId: "t1", conversationId: "c1", runId: "r1", version: 2, status: "completed", summary: "Protected synthetic action completed", allowedActions: [], evidenceRefs: ["artifact-1"] });
const makeTool = (): ToolView => ToolViewSchema.parse({ toolId: "w1", conversationId: "c1", runId: "r1", version: 1, status: "succeeded", summary: "Synthetic tool execution", allowedActions: [], evidenceRefs: [] });
const makeArtifact = (): ArtifactView => ArtifactViewSchema.parse({ artifactId: "f1", conversationId: "c1", runId: "r1", version: 1, title: "Protected action receipt", mediaType: "text/plain", contentRef: "content-1", allowedActions: ["view"], preview: "Synthetic receipt; no real action occurred." });
const applied = async (input: { commandId: string }): Promise<UiCommandResult> => ({ commandId: input.commandId, status: "applied", revision: 2 });

afterEach(cleanup);

describe("ConversationPanel decision and activity mounting", () => {
  it("mounts the clarification card and forwards the reviewed answer", async () => {
    const onAnswer = vi.fn((_id: string, answer: ClarificationAnswer) => applied(answer));
    render(<ConversationPanel messages={[]} interactions={[makeQuestion()]} onAnswer={onAnswer} onDecide={async () => applied({ commandId: "x" })} />);
    const card = screen.getByTestId("conversation-decisions");
    expect(card).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Concise" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(1));
    const [questionId, answer] = onAnswer.mock.calls[0]!;
    expect(questionId).toBe("q1");
    expect(answer.optionIds).toEqual(["concise"]);
    expect(answer.expectedVersion).toBe(1);
  });

  it("mounts the approval card and forwards the decision", async () => {
    const onDecide = vi.fn((_id: string, input: { commandId: string; decision: string }) => applied(input));
    render(<ConversationPanel messages={[]} interactions={[makeApproval()]} onAnswer={async () => applied({ commandId: "x" })} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve once" }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledTimes(1));
    expect(onDecide.mock.calls[0]![0]).toBe("a1");
    expect(onDecide.mock.calls[0]![1].decision).toBe("approve");
  });

  it("renders read-only activity cards and keeps every card outside the transcript log", () => {
    render(<ConversationPanel messages={[]} interactions={[makeApproval()]} tasks={[makeTask()]} tools={[makeTool()]} artifacts={[makeArtifact()]} onAnswer={async () => applied({ commandId: "x" })} onDecide={async () => applied({ commandId: "x" })} />);
    expect(screen.getByTestId("task-t1")).toBeTruthy();
    expect(screen.getByTestId("tool-w1")).toBeTruthy();
    expect(screen.getByTestId("artifact-f1")).toBeTruthy();
    const log = screen.getByRole("log", { name: "Conversation" });
    expect(log.contains(screen.getByTestId("task-t1"))).toBe(false);
    expect(log.contains(screen.getByTestId("approval-a1"))).toBe(false);
    expect(screen.getByTestId("conversation-decisions").contains(screen.getByTestId("approval-a1"))).toBe(true);
  });

  it("renders answered interactions read-only without decision controls", () => {
    render(<ConversationPanel messages={[]} interactions={[makeQuestion("answered"), makeApproval("approved")]} onAnswer={async () => applied({ commandId: "x" })} onDecide={async () => applied({ commandId: "x" })} />);
    expect(screen.getByText("This question has been answered and is read-only.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit answer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve once" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });

  it("does not mount decision cards when no decision transport is provided", () => {
    render(<ConversationPanel messages={[]} interactions={[makeQuestion(), makeApproval()]} />);
    expect(screen.queryByTestId("conversation-decisions")).toBeNull();
  });
});
