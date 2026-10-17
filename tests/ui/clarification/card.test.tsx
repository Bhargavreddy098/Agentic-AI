// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ClarificationCard, validateAnswer, isExpired } from "@asi/web/features/chat/ClarificationCard.tsx";
import { ClarificationAnswerSchema, ClarificationRequestSchema, type ClarificationRequest, type UiCommandResult } from "../../../packages/contracts/src/ui/index.js";

const makeQuestion = (overrides: Partial<ClarificationRequest> = {}): ClarificationRequest => ClarificationRequestSchema.parse({
  interactionId: "i1", conversationId: "c1", runId: "r1", version: 1, type: "clarification", questionId: "q1",
  status: "pending", prompt: "Send the synthetic message?", options: [{ optionId: "yes", label: "Yes" }, { optionId: "no", label: "No" }],
  allowFreeText: false, allowMultiple: false, required: true, ...overrides
});
const applied = async (_id: string, input: { commandId: string }): Promise<UiCommandResult> => ({ commandId: input.commandId, status: "applied", revision: 2 });
afterEach(cleanup);

describe("ClarificationCard validation", () => {
  it("rejects empty required, over-limit text and text when free text is not allowed", () => {
    const question = makeQuestion();
    expect(validateAnswer(question, [], "   ")).toMatch(/requires an answer/);
    expect(validateAnswer(question, [], "x".repeat(4097))).toMatch(/4096/);
    expect(validateAnswer(question, [], "unexpected")).toMatch(/does not accept additional text/);
    expect(validateAnswer(question, ["yes"], "")).toBeNull();
  });

  it("treats a past deadline as expired only while pending", () => {
    expect(isExpired(makeQuestion({ expiresAt: "2020-01-01T00:00:00Z" }), Date.parse("2026-10-06T12:00:00Z"))).toBe(true);
    expect(isExpired(makeQuestion({ status: "answered", expiresAt: "2020-01-01T00:00:00Z" }), Date.parse("2026-10-06T12:00:00Z"))).toBe(false);
  });
});

describe("ClarificationCard submission", () => {
  it("submits one reviewed answer through answerClarification and never decideApproval", async () => {
    const answerClarification = vi.fn(applied);
    render(<ClarificationCard question={makeQuestion()} onSubmit={(id, input) => answerClarification(id, input)} />);
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
    expect((screen.getByLabelText("Yes") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("No") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText("Yes"));
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    await waitFor(() => expect(answerClarification).toHaveBeenCalledTimes(1));
    const [id, input] = answerClarification.mock.calls[0] as [string, { commandId: string; expectedVersion: number; optionIds: string[] }];
    expect(id).toBe("q1");
    expect(input.expectedVersion).toBe(1);
    expect(input.optionIds).toEqual(["yes"]);
    expect(ClarificationAnswerSchema.parse(input)).toEqual(input);
    await screen.findByText("Answer recorded.");
    expect(screen.queryByRole("button", { name: "Submit answer" })).toBeNull();
  });

  it("keeps the submit disabled until a required answer is supplied", () => {
    render(<ClarificationCard question={makeQuestion()} onSubmit={applied} />);
    expect(screen.getByRole("button", { name: "Submit answer" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("No"));
    expect(screen.getByRole("button", { name: "Submit answer" })).toBeEnabled();
  });

  it("uses stable option IDs and radio semantics for single choice", () => {
    render(<ClarificationCard question={makeQuestion()} onSubmit={applied} />);
    const yes = screen.getByLabelText("Yes") as HTMLInputElement;
    expect(yes.id).toBe("q1-option-yes");
    expect(yes.value).toBe("yes");
    expect(yes.type).toBe("radio");
    fireEvent.click(yes);
    fireEvent.click(screen.getByLabelText("No"));
    expect((screen.getByLabelText("Yes") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("No") as HTMLInputElement).checked).toBe(true);
  });

  it("supports multiple choices plus bounded free text when the request allows it", async () => {
    const allow = makeQuestion({ allowMultiple: true, allowFreeText: true, required: false, options: [{ optionId: "a", label: "Alpha" }, { optionId: "b", label: "Beta" }] });
    const answerClarification = vi.fn(applied);
    render(<ClarificationCard question={allow} onSubmit={(id, input) => answerClarification(id, input)} />);
    const alpha = screen.getByLabelText("Alpha") as HTMLInputElement;
    expect(alpha.type).toBe("checkbox");
    fireEvent.click(alpha);
    fireEvent.click(screen.getByLabelText("Beta"));
    fireEvent.change(screen.getByRole("textbox", { name: "Your answer" }), { target: { value: "  notes  " } });
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    await waitFor(() => expect(answerClarification).toHaveBeenCalledTimes(1));
    const input = answerClarification.mock.calls[0]![1] as { optionIds: string[]; text?: string };
    expect(input.optionIds).toEqual(["a", "b"]);
    expect(input.text).toBe("notes");
  });

  it("hides free text when the request forbids it", () => {
    render(<ClarificationCard question={makeQuestion()} onSubmit={applied} />);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("ClarificationCard canonical states", () => {
  it("renders answered, cancelled and expired questions read-only", () => {
    for (const status of ["answered", "cancelled"] as const) {
      cleanup();
      render(<ClarificationCard question={makeQuestion({ status })} onSubmit={applied} />);
      expect(screen.queryByRole("button", { name: "Submit answer" })).toBeNull();
      expect(screen.getByLabelText("Yes")).toBeDisabled();
    }
    cleanup();
    render(<ClarificationCard question={makeQuestion({ expiresAt: "2020-01-01T00:00:00Z" })} onSubmit={applied} now={() => Date.parse("2026-10-06T12:00:00Z")} />);
    expect(screen.getByTestId("clarification-q1")).toHaveAttribute("data-status", "expired");
    expect(screen.queryByRole("button", { name: "Submit answer" })).toBeNull();
  });

  it("announces submitting and retains the draft on a version conflict", async () => {
    let resolveFirst: ((value: UiCommandResult) => void) | null = null;
    const onSubmit = vi.fn()
      .mockImplementationOnce((_id: string, input: { commandId: string }) => new Promise<UiCommandResult>(resolve => { resolveFirst = () => resolve({ commandId: input.commandId, status: "conflict", error: { code: "INVALID_INPUT", safeMessage: "State changed", retryable: false } }); }))
      .mockImplementation(applied);
    render(<ClarificationCard question={makeQuestion()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByLabelText("Yes"));
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    await screen.findByText("Submitting your answer…");
    resolveFirst!({ commandId: "x", status: "conflict", error: { code: "INVALID_INPUT", safeMessage: "State changed", retryable: false } });
    await screen.findByText("This question changed; the latest version is shown.");
    expect((screen.getByLabelText("Yes") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect((onSubmit.mock.calls[1]![1] as { commandId: string }).commandId).not.toBe((onSubmit.mock.calls[0]![1] as { commandId: string }).commandId);
  });

  it("reuses the identical command identity when retrying an unavailable response", async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error("lost response")).mockImplementation(applied);
    render(<ClarificationCard question={makeQuestion()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByLabelText("Yes"));
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    await screen.findByText("Response unavailable. Retry to submit the same answer.");
    expect(screen.getByLabelText("Yes")).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect((onSubmit.mock.calls[1]![1] as { commandId: string }).commandId).toBe((onSubmit.mock.calls[0]![1] as { commandId: string }).commandId);
    await screen.findByText("Answer recorded.");
  });
});

describe("ClarificationCard reconnect handling", () => {
  it("retains valid draft choices and drops options removed by a refreshed question", () => {
    function Harness() {
      const [question, setQuestion] = useState(makeQuestion());
      return <>
        <ClarificationCard question={question} onSubmit={applied} />
        <button type="button" onClick={() => setQuestion(makeQuestion({ version: 2, options: [{ optionId: "yes", label: "Yes" }, { optionId: "maybe", label: "Maybe" }] }))}>refresh</button>
      </>;
    }
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("Yes"));
    expect((screen.getByLabelText("Yes") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    expect((screen.getByLabelText("Yes") as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByLabelText("No")).toBeNull();
    expect(screen.getByLabelText("Maybe")).toBeTruthy();
  });

  it("submits against the canonical version after the question advances", async () => {
    const onSubmit = vi.fn(applied);
    function Harness() {
      const [question, setQuestion] = useState(makeQuestion());
      return <>
        <ClarificationCard question={question} onSubmit={onSubmit} onConflict={() => setQuestion(prev => makeQuestion({ ...prev, version: prev.version + 1 }))} />
        <button type="button" onClick={() => setQuestion(makeQuestion({ version: 5 }))}>advance</button>
      </>;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "advance" }));
    fireEvent.click(screen.getByLabelText("Yes"));
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect((onSubmit.mock.calls[0]![1] as { expectedVersion: number }).expectedVersion).toBe(5);
  });
});
