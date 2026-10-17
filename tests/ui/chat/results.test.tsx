// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TaskProgressCard } from "@asi/web/features/chat/TaskProgressCard.tsx";
import { ToolActivityCard } from "@asi/web/features/chat/ToolActivityCard.tsx";
import { ArtifactCard } from "@asi/web/features/chat/ArtifactCard.tsx";
import { isPreviewable, canAction, downloadHref, SUMMARY_LIMIT } from "@asi/web/lib/artifacts.ts";
import { TaskViewSchema, ToolViewSchema, ArtifactViewSchema, UiApprovalRequestSchema } from "../../../packages/contracts/src/ui/index.js";
import { hydrateConversation, reduceConversation } from "@asi/web/lib/chat/reducer.ts";

const makeTask = (overrides = {}) => TaskViewSchema.parse({ taskId: "t1", conversationId: "c1", runId: "r1", version: 1, status: "queued", summary: "Synthetic task", allowedActions: [], evidenceRefs: [], ...overrides });
const makeTool = (overrides = {}) => ToolViewSchema.parse({ toolId: "tool1", conversationId: "c1", runId: "r1", version: 1, status: "planned", summary: "Synthetic tool", allowedActions: [], evidenceRefs: [], ...overrides });
const makeArtifact = (overrides = {}) => ArtifactViewSchema.parse({ artifactId: "a1", conversationId: "c1", runId: "r1", version: 1, title: "Synthetic artifact", mediaType: "text/plain", contentRef: "ref1", allowedActions: ["view"], ...overrides });
afterEach(cleanup);

describe("TaskProgressCard", () => {
  it("renders queued, running, completed, failed, cancelled and unknown distinctly", () => {
    const labels: Record<string, RegExp> = { queued: /queued/i, running: /running/i, completed: /completed/i, failed: /failed/i, cancelled: /cancelled/i, unknown: /unknown/i };
    for (const status of Object.keys(labels) as Array<keyof typeof labels>) {
      cleanup();
      render(<TaskProgressCard task={makeTask({ status })} />);
      expect(screen.getByTestId("task-t1")).toHaveAttribute("data-status", status);
      expect(screen.getByTestId("task-t1")).toHaveTextContent(labels[status]!);
    }
  });

  it("bounds long output behind a keyboard-operable expander", () => {
    const summary = "A".repeat(SUMMARY_LIMIT + 120);
    render(<TaskProgressCard task={makeTask({ summary })} />);
    const card = screen.getByTestId("task-t1");
    expect(card).not.toHaveTextContent(summary);
    const toggle = screen.getByRole("button", { name: /show full summary/i });
    fireEvent.click(toggle);
    expect(card).toHaveTextContent(summary);
    expect(screen.getByRole("button", { name: /hide full summary/i })).toBeTruthy();
  });

  it("points to the correct run for supported task ids", () => {
    render(<TaskProgressCard task={makeTask({ runId: "run-42" })} />);
    expect(screen.getByTestId("task-t1")).toHaveAttribute("data-run-id", "run-42");
  });
});

describe("ToolActivityCard", () => {
  it("renders planned, executing, succeeded, failed and unknown distinctly", () => {
    const labels: Record<string, RegExp> = { planned: /planned/i, executing: /executing/i, succeeded: /succeeded/i, failed: /failed/i, unknown: /unknown/i };
    for (const status of Object.keys(labels) as Array<keyof typeof labels>) {
      cleanup();
      render(<ToolActivityCard tool={makeTool({ status })} />);
      expect(screen.getByTestId("tool-tool1")).toHaveAttribute("data-status", status);
    }
  });

  it("never converts an approved decision into tool success", () => {
    render(<ToolActivityCard tool={makeTool({ status: "executing" })} />);
    expect(screen.getByTestId("tool-tool1")).toHaveAttribute("data-status", "executing");
    expect(screen.queryByText(/succeeded/i)).toBeNull();
    const approval = UiApprovalRequestSchema.parse({ interactionId: "i1", conversationId: "c1", runId: "r1", version: 2, type: "approval", approvalId: "a1", effectId: "e1", status: "approved", action: "Act", target: "Target", preview: "Preview", expiresAt: "2099-01-01T00:00:00Z", requiredActorRole: "user", actionRef: "b1" });
    const state = hydrateConversation({ conversationId: "c1", workspaceId: "w1", revision: 0, lastEventSequence: 0, messages: [], interactions: [], tasks: [], tools: [makeTool({ status: "executing" })], artifacts: [], runStatus: null, effectiveModel: null, usage: { inputTokens: null, outputTokens: null, costMicroUsd: null }, composerCapabilities: ["send", "cancel"] });
    const next = reduceConversation(state, { schemaVersion: 1, eventId: "e1", conversationId: "c1", sequence: 1, occurredAt: "2026-10-06T12:00:00Z", eventType: "approval.resolved", payload: approval });
    expect(next.snapshot.tools[0]!.status).toBe("executing");
  });

  it("turns excessive output into a bounded summary plus an artifact link", () => {
    const summary = "B".repeat(SUMMARY_LIMIT + 500);
    render(<ToolActivityCard tool={makeTool({ summary, evidenceRefs: ["artifact-9"] })} />);
    const card = screen.getByTestId("tool-tool1");
    expect(card).not.toHaveTextContent(summary);
    expect(card).toHaveAttribute("data-artifact-ref", "artifact-9");
    expect(card).toHaveAttribute("data-run-id", "r1");
  });
});

describe("ArtifactCard preview policy", () => {
  it("previews only explicitly supported media types", () => {
    expect(isPreviewable("text/plain")).toBe(true);
    expect(isPreviewable("text/markdown")).toBe(true);
    expect(isPreviewable("text/html")).toBe(false);
    expect(isPreviewable("application/octet-stream")).toBe(false);
    cleanup();
    render(<ArtifactCard artifact={makeArtifact({ preview: "hello preview" })} />);
    expect(screen.getByTestId("artifact-a1")).toHaveTextContent("hello preview");
    cleanup();
    render(<ArtifactCard artifact={makeArtifact({ mediaType: "text/html", preview: "<b>bold</b>" })} />);
    expect(screen.getByTestId("artifact-a1")).toHaveTextContent(/preview is isolated|preview unavailable/i);
    expect(screen.getByTestId("artifact-a1")).not.toHaveTextContent("bold</b>");
  });

  it("isolates artifacts: no executable markup, script, JSX evaluation, allow-same-origin or credentials", () => {
    render(<ArtifactCard artifact={makeArtifact({ preview: '<script>window.__artifactXss=1</script> <Widget prop="1" />' })} />);
    const card = screen.getByTestId("artifact-a1");
    expect(card.querySelector("script")).toBeNull();
    expect(card.innerHTML).not.toContain("<script>");
    expect(document.querySelector("iframe[allow-same-origin]")).toBeNull();
    expect(document.querySelectorAll("iframe")).toHaveLength(0);
    expect((window as unknown as { __artifactXss?: number }).__artifactXss).toBeUndefined();
    expect(card.innerHTML).not.toMatch(/credential|csrf|token|cookie/i);
  });

  it("refuses download for an unauthorized artifact and keeps credentials out of the URL", () => {
    expect(canAction(makeArtifact(), "download")).toBe(false);
    cleanup();
    render(<ArtifactCard artifact={makeArtifact({ allowedActions: ["view"] })} />);
    expect(screen.queryByRole("link", { name: /download/i })).toBeNull();
    expect(screen.getByRole("link", { name: /view/i })).toHaveAttribute("href", downloadHref("a1"));
    cleanup();
    render(<ArtifactCard artifact={makeArtifact({ allowedActions: ["download"] })} />);
    const link = screen.getByRole("link", { name: /download/i });
    expect(link).toHaveAttribute("href", "/api/ui/v1/artifacts/a1/content");
    expect(link.getAttribute("href")).not.toMatch(/token|credential|csrf/i);
    expect(link.getAttribute("rel")).toContain("noopener");
    cleanup();
    render(<ArtifactCard artifact={makeArtifact({ allowedActions: [] })} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
