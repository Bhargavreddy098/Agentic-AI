"use client";
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { WorkspaceSession, ConversationSummary } from "@asi/contracts";
import { HttpGatewayClient } from "../../lib/gateway/http-client";
import { ChatStore } from "../../lib/chat/store";

type Workspace = { client: HttpGatewayClient; store: ChatStore; session: WorkspaceSession | null; conversations: ConversationSummary[]; connection: "connecting" | "connected" | "unavailable"; refresh: () => Promise<void> };
const Context = createContext<Workspace | null>(null);
export function useWorkspace() { const workspace = useContext(Context); if (!workspace) throw new Error("Workspace provider missing"); return workspace; }
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new HttpGatewayClient(process.env.NEXT_PUBLIC_ASI_UI_MODE === "demo" ? "demo" : "live"));
  const [store] = useState(() => new ChatStore(client));
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [connection, setConnection] = useState<Workspace["connection"]>("connecting");
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const refresh = async () => { if (!session) return; const result = await client.listConversations(); if (result.items.some(item => item.workspaceId !== session.workspaceId)) throw new Error("Conversation ownership mismatch"); setConversations(result.items); };
  useEffect(() => {
    let current = true;
    void (async () => {
      try { const identity = await client.getMe(); const result = await client.listConversations(); if (result.items.some(item => item.workspaceId !== identity.workspaceId)) throw new Error("Conversation ownership mismatch"); if (current) { setSession(identity); setConversations(result.items); setConnection("connected"); } }
      catch { if (current) { setSession(null); setConversations([]); setConnection("unavailable"); store.clear(); } }
    })();
    return () => { current = false; store.clear(); };
  }, [client, store]);
  useEffect(() => { if (state.connection === "unauthenticated") { setSession(null); setConversations([]); setConnection("unavailable"); } }, [state.connection]);
  const selected = state.conversation?.snapshot;
  const summaries = conversations.map(item => selected?.conversationId === item.conversationId ? { ...item, pendingDecisionCount: selected.interactions.filter(item => item.status === "pending").length, revision: selected.revision, activeRun: selected.runStatus } : item);
  return <Context.Provider value={{ client, store, session, conversations: summaries, connection, refresh }}>{children}</Context.Provider>;
}
