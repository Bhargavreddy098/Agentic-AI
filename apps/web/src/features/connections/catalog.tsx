"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Catalog, ConnectionView, UiCommandResult, UiMutationCommand } from "@asi/contracts";
import type { GatewayClient } from "../../lib/gateway/client";
import { handleManagementResult, type ManagementOutcome } from "../../lib/management";

export const CONNECTION_KIND_LABELS: Record<ConnectionView["kind"], string> = { tool: "Tool", mcp: "MCP server", a2a: "Remote A2A agent", messaging: "Messaging" };
export const CONNECTION_STATUS_LABELS: Record<ConnectionView["status"], string> = { connected: "Connected", disconnected: "Disconnected", unavailable: "Unavailable", blocked: "Blocked" };

export function connectionStatusReason(connection: ConnectionView): string | null {
  if (connection.status === "blocked") return "Blocked by workspace policy.";
  if (connection.status === "unavailable") return "Unavailable for this workspace; no runtime component is implemented.";
  if (connection.status === "disconnected") return "Not connected. Requests run only after the backend authorizes the connection.";
  return null;
}

export function filterConnections(connections: ConnectionView[], query: string): ConnectionView[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return connections;
  return connections.filter(connection => connection.displayName.toLowerCase().includes(needle) || connection.connectionId.toLowerCase().includes(needle) || connection.kind.toLowerCase().includes(needle));
}

export type ConnectionCommand = Extract<UiMutationCommand, { type: "connection.connect" | "connection.disconnect" }>;

export async function submitConnectionCommand(client: Pick<GatewayClient, "submitCommand">, command: ConnectionCommand, onNavigate: (href: string) => void): Promise<ManagementOutcome> {
  const result: UiCommandResult = await client.submitCommand(command);
  const outcome = handleManagementResult(result);
  if (outcome.kind === "navigate") onNavigate(outcome.href);
  return outcome;
}

export const connectConnection = (client: Pick<GatewayClient, "submitCommand">, connection: ConnectionView, onNavigate: (href: string) => void) => submitConnectionCommand(client, { commandId: crypto.randomUUID(), expectedRevision: connection.revision, type: "connection.connect", connectionId: connection.connectionId }, onNavigate);
export const disconnectConnection = (client: Pick<GatewayClient, "submitCommand">, connection: ConnectionView, onNavigate: (href: string) => void) => submitConnectionCommand(client, { commandId: crypto.randomUUID(), expectedRevision: connection.revision, type: "connection.disconnect", connectionId: connection.connectionId }, onNavigate);

export type ConnectionsState = { connections: Catalog<ConnectionView> | null; loading: boolean; refresh: () => Promise<void> };
const Context = createContext<ConnectionsState | null>(null);
export function useConnections(): ConnectionsState { const value = useContext(Context); if (!value) throw new Error("Connections provider missing"); return value; }

export function ConnectionsProvider({ client, children }: { client: Pick<GatewayClient, "getConnections">; children: ReactNode }) {
  const [connections, setConnections] = useState<Catalog<ConnectionView> | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setConnections(await client.getConnections()); }
    finally { setLoading(false); }
  }, [client]);
  useEffect(() => { void refresh(); }, [refresh]);
  return <Context.Provider value={{ connections, loading, refresh }}>{children}</Context.Provider>;
}
