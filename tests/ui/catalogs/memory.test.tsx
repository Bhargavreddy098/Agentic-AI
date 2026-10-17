// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { narrowScopes, availableScopes, confidenceLabel, resetOnWorkspaceChange, correctMemory, deleteMemory } from "@asi/web/features/memory/memory.ts";
import { MemoryPanel } from "@asi/web/features/memory/MemoryPanel.tsx";
import { MemoryDetail } from "@asi/web/features/memory/MemoryDetail.tsx";
import { MemoryCorrectionForm } from "@asi/web/features/memory/MemoryCorrectionForm.tsx";
import { MemoryViewSchema, type MemoryView, type Page } from "../../../packages/contracts/src/ui/index.js";

const makeMemory = (overrides = {}): MemoryView => MemoryViewSchema.parse({ memoryId: "m1", scope: "Global", value: "The team prefers TypeScript.", sourceIds: ["s1"], confidence: 0.9, revision: 1, allowedActions: ["memory.correct", "memory.delete"], ...overrides });
const page = (items: MemoryView[], nextCursor: string | null = null): Page<MemoryView> => ({ items, nextCursor });
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete (window as unknown as { __mem_executed?: boolean }).__mem_executed; });

describe("authorized scopes and records", () => {
  it("renders only returned records and cannot expand authorization with a filter", async () => {
    expect(availableScopes(["Global"])).toEqual(["Global"]);
    expect(narrowScopes(["Role", "Global"], ["Global"])).toEqual(["Global"]);
    expect(narrowScopes(["Private"], ["Global", "Role"])).toEqual([]);
    const client = { queryMemory: vi.fn(async () => page([makeMemory(), makeMemory({ memoryId: "m2", scope: "Private", value: "Private note." })])) };
    render(<MemoryPanel workspaceId="w1" client={client} authorizedScopes={["Global"]} />);
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Search memory"), { target: { value: "team" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByTestId("memory-m1");
    expect(client.queryMemory).toHaveBeenCalledWith(expect.objectContaining({ scope: "Global" }));
    expect(screen.getByTestId("memory-m2")).toBeTruthy();
  });

  it("clears previous results when the workspace switches", async () => {
    const client = { queryMemory: vi.fn(async () => page([makeMemory()])) };
    const view = render(<MemoryPanel workspaceId="w1" client={client} authorizedScopes={["Global", "Role", "Private"]} />);
    fireEvent.change(screen.getByLabelText("Search memory"), { target: { value: "team" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByTestId("memory-m1");
    view.rerender(<MemoryPanel workspaceId="w2" client={client} authorizedScopes={["Global", "Role", "Private"]} />);
    expect(screen.queryByTestId("memory-m1")).toBeNull();
    expect(resetOnWorkspaceChange({ workspaceId: "w1", page: page([makeMemory()]) }, "w2").page).toBeNull();
  });

  it("renders memory content as inert text", async () => {
    const malicious = makeMemory({ memoryId: "m9", value: "<script>window.__mem_executed = true</script>" });
    render(<MemoryPanel workspaceId="w1" client={{ queryMemory: vi.fn(async () => page([malicious])) }} authorizedScopes={["Global", "Role", "Private"]} />);
    fireEvent.change(screen.getByLabelText("Search memory"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByTestId("memory-m9");
    expect((window as unknown as { __mem_executed?: boolean }).__mem_executed).toBeUndefined();
    expect(screen.getByText(/window.__mem_executed = true/)).toBeTruthy();
  });

  it("keeps private data out of the URL and browser durable storage", async () => {
    const secret = "private-secret-value-xyz";
    render(<MemoryPanel workspaceId="w1" client={{ queryMemory: vi.fn(async () => page([makeMemory({ memoryId: "m3", scope: "Private", value: secret })])) }} authorizedScopes={["Global", "Role", "Private"]} />);
    fireEvent.change(screen.getByLabelText("Search memory"), { target: { value: "note" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByTestId("memory-m3");
    expect(window.location.href).not.toContain(secret);
    expect(JSON.stringify(window.localStorage)).not.toContain(secret);
    expect(JSON.stringify(window.sessionStorage)).not.toContain(secret);
    expect(screen.getByText(secret)).toBeTruthy();
  });
});

describe("provenance labels", () => {
  it("keeps source, hypothesis and contradiction labels visible", () => {
    expect(confidenceLabel(0.9)).toBe("Confirmed");
    expect(confidenceLabel(0.2)).toBe("Hypothesis");
    render(<MemoryDetail memory={makeMemory({ confidence: 0.2 })} contradictions={["m1"]} />);
    expect(screen.getByText(/sources/i)).toBeTruthy();
    expect(screen.getByText(/hypothesis/i)).toBeTruthy();
    expect(screen.getByTestId("memory-contradiction")).toHaveTextContent(/contradiction/i);
  });
});

describe("memory commands", () => {
  it("uses expectedRevision for a correction", async () => {
    const submit = vi.fn(async (command: { commandId: string }) => ({ commandId: command.commandId, status: "applied" as const, revision: 2 }));
    await correctMemory({ submitCommand: submit }, makeMemory(), "new value", () => {});
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ type: "memory.correct", memoryId: "m1", value: "new value", expectedRevision: 1 }));
  });

  it("routes a deletion approval to the owning Chat", async () => {
    const submit = vi.fn(async (command: { commandId: string }) => ({ commandId: command.commandId, status: "approval_required" as const, revision: 0, conversationId: "conv-9", interactionId: "inter-9" }));
    const onNavigate = vi.fn();
    const outcome = await deleteMemory({ submitCommand: submit }, makeMemory(), onNavigate);
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ type: "memory.delete", memoryId: "m1", expectedRevision: 1 }));
    expect(outcome).toEqual({ kind: "navigate", href: "/chat/conv-9?interaction=inter-9" });
    expect(onNavigate).toHaveBeenCalledWith("/chat/conv-9?interaction=inter-9");
  });

  it("refreshes on conflict instead of persisting the change optimistically", async () => {
    const submit = vi.fn(async () => ({ commandId: "c", status: "conflict" as const, revision: 1, error: { code: "STALE_WRITER" as const, safeMessage: "Memory changed; refresh.", retryable: true } }));
    const onRefresh = vi.fn();
    render(<MemoryCorrectionForm memory={makeMemory()} submit={submit} onRefresh={onRefresh} />);
    fireEvent.change(screen.getByLabelText("Corrected value"), { target: { value: "replacement" } });
    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
    await screen.findByText("Memory changed; refresh.");
    expect(onRefresh).toHaveBeenCalled();
    expect(screen.getByTestId("memory-current-value")).toHaveTextContent("The team prefers TypeScript.");
  });
});
