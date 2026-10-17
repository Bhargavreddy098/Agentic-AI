// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConnectionsProvider, useConnections, filterConnections, connectConnection, disconnectConnection } from "@asi/web/features/connections/catalog.tsx";
import { ConnectionCatalog } from "@asi/web/features/connections/ConnectionCatalog.tsx";
import { ConnectionForm } from "@asi/web/features/connections/ConnectionForm.tsx";
import { ConnectionViewSchema, type Catalog, type ConnectionView } from "../../../packages/contracts/src/ui/index.js";

const makeConnection = (overrides = {}): ConnectionView => ConnectionViewSchema.parse({ connectionId: "c1", displayName: "Local Tool", kind: "tool", status: "connected", permissions: ["tool.invoke"], revision: 1, allowedActions: ["connection.disconnect"], ...overrides });
const connectionCatalog = (items: ConnectionView[]): Catalog<ConnectionView> => ({ items, revision: 1, availability: "ready" });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("connection kinds and statuses", () => {
  it("renders tool/MCP/A2A/messaging entries with distinct kinds and statuses", () => {
    render(<ConnectionCatalog catalog={connectionCatalog([makeConnection(), makeConnection({ connectionId: "c2", displayName: "Remote MCP", kind: "mcp", status: "disconnected" }), makeConnection({ connectionId: "c3", displayName: "Remote Agent", kind: "a2a", status: "unavailable" }), makeConnection({ connectionId: "c4", displayName: "Slack", kind: "messaging", status: "blocked" })])} />);
    for (const [id, kind, status] of [["c1", "tool", "connected"], ["c2", "mcp", "disconnected"], ["c3", "a2a", "unavailable"], ["c4", "messaging", "blocked"]] as const) {
      expect(screen.getByTestId(`connection-${id}`)).toHaveAttribute("data-kind", kind);
      expect(screen.getByTestId(`connection-${id}`)).toHaveAttribute("data-status", status);
    }
    expect(screen.getByTestId("connection-status-c1")).toHaveTextContent("Connected");
    expect(screen.getByTestId("connection-kind-c2")).toHaveTextContent(/mcp/i);
    expect(screen.getByTestId("connection-permissions-c1")).toHaveTextContent("tool.invoke");
  });

  it("never shows an invented Connected badge for a component that is not connected", () => {
    render(<ConnectionCatalog catalog={connectionCatalog([makeConnection({ connectionId: "c2", status: "disconnected" }), makeConnection({ connectionId: "c3", status: "unavailable" })])} />);
    expect(screen.getByTestId("connection-status-c2")).toHaveTextContent("Disconnected");
    expect(screen.getByTestId("connection-status-c3")).toHaveTextContent("Unavailable");
    expect(screen.queryByText("Connected")).toBeNull();
  });

  it("filters the shared catalog by search", () => {
    expect(filterConnections([makeConnection(), makeConnection({ connectionId: "c2", displayName: "Slack", kind: "messaging" })], "slack").map(c => c.connectionId)).toEqual(["c2"]);
    render(<ConnectionCatalog catalog={connectionCatalog([makeConnection(), makeConnection({ connectionId: "c2", displayName: "Slack", kind: "messaging" })])} />);
    fireEvent.change(screen.getByLabelText("Search connections"), { target: { value: "slack" } });
    expect(screen.queryByTestId("connection-c1")).toBeNull();
    expect(screen.getByTestId("connection-c2")).toBeTruthy();
  });
});

describe("connection requests go through the GatewayClient only", () => {
  it("submits a typed command and never fetches the entered server URL", async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const submit = vi.fn(async (command: { commandId: string }) => ({ commandId: command.commandId, status: "applied" as const, revision: 2 }));
    render(<ConnectionForm connectionId="c1" expectedRevision={1} serverUrl="https://mcp.example.test/sse" submit={submit} />);
    fireEvent.change(screen.getByLabelText("Server URL"), { target: { value: "https://evil.example.test/rpc" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0]![0]).toMatchObject({ type: "connection.connect", connectionId: "c1", expectedRevision: 1 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByText("Connection request recorded.")).toBeTruthy();
  });

  it("surfaces a safe server-rejected message and never displays connection secrets", async () => {
    const submit = vi.fn(async (command: { commandId: string }) => ({ commandId: command.commandId, status: "rejected" as const, revision: 1, error: { code: "POLICY_DENIED" as const, safeMessage: "Host blocked by egress policy.", retryable: false } }));
    render(<ConnectionForm connectionId="c1" expectedRevision={1} submit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByText("Host blocked by egress policy.");
    expect(document.body.innerHTML).not.toContain("super-secret-token");
  });

  it("routes a pending grant to the owning Chat approval", async () => {
    const submit = vi.fn(async (command: { commandId: string }) => ({ commandId: command.commandId, status: "approval_required" as const, revision: 0, conversationId: "conv-3", interactionId: "inter-3" }));
    const onNavigate = vi.fn();
    const outcome = await connectConnection({ submitCommand: submit }, makeConnection(), onNavigate);
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ type: "connection.connect", connectionId: "c1", expectedRevision: 1 }));
    expect(outcome).toEqual({ kind: "navigate", href: "/chat/conv-3?interaction=inter-3" });
    expect(onNavigate).toHaveBeenCalledWith("/chat/conv-3?interaction=inter-3");
  });

  it("maps applied, conflict and rejected outcomes without navigating", async () => {
    const onNavigate = vi.fn();
    expect(await disconnectConnection({ submitCommand: vi.fn(async (command: { commandId: string }) => ({ commandId: command.commandId, status: "applied" as const, revision: 4 })) }, makeConnection(), onNavigate)).toEqual({ kind: "applied", revision: 4 });
    expect(await connectConnection({ submitCommand: vi.fn(async (command: { commandId: string }) => ({ commandId: command.commandId, status: "conflict" as const, revision: 1, error: { code: "STALE_WRITER" as const, safeMessage: "Stale.", retryable: true } })) }, makeConnection(), onNavigate)).toEqual({ kind: "error", code: "STALE_WRITER", message: "Stale." });
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe("shared connection query ownership", () => {
  it("serves the page and any composer consumer from one getConnections query", async () => {
    const getConnections = vi.fn(async () => connectionCatalog([makeConnection()]));
    function Consumer({ name }: { name: string }) { const { connections } = useConnections(); return <span data-testid={`consumer-${name}`}>{connections?.items[0]?.connectionId}</span>; }
    render(<ConnectionsProvider client={{ getConnections }}><Consumer name="page" /><Consumer name="composer" /></ConnectionsProvider>);
    await waitFor(() => expect(screen.getByTestId("consumer-page")).toHaveTextContent("c1"));
    expect(getConnections).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("consumer-composer")).toHaveTextContent("c1");
  });
});
