"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@asi/ui";
import { useWorkspace } from "../shell/WorkspaceProvider";

export default function ChatFrame() {
  const workspace = useWorkspace(), router = useRouter();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const state = useSyncExternalStore(workspace.store.subscribe, workspace.store.getSnapshot, workspace.store.getSnapshot);
  const [creating, setCreating] = useState(false), [error, setError] = useState<string | null>(null);
  const command = useRef<string | null>(null), busy = useRef(false);
  useEffect(() => {
    if (conversationId && workspace.session) void workspace.store.open(conversationId);
    return () => workspace.store.disconnect();
  }, [conversationId, workspace.store, workspace.session]);
  const create = async () => {
    if (busy.current) return; busy.current = true; setCreating(true); setError(null);
    command.current ??= crypto.randomUUID();
    try { const conversation = await workspace.client.createConversation(command.current); command.current = null; router.push(`/chat/${encodeURIComponent(conversation.conversationId)}`); await workspace.refresh(); }
    catch { setError("Conversation request unavailable. Retry uses the same command identity."); }
    finally { busy.current = false; setCreating(false); }
  };
  return <main className="chat-layout"><aside className="conversation-rail" aria-label="Conversation history"><div className="rail-title">Conversations</div><Button variant="outline" onClick={() => void create()} disabled={creating || !workspace.session?.allowedActions.includes("chat")}>{creating ? "Creating…" : "New conversation"}</Button>{workspace.conversations.map(item => <Link className="conversation-link" key={item.conversationId} href={`/chat/${encodeURIComponent(item.conversationId)}`} aria-current={conversationId === item.conversationId ? "page" : undefined}><span>{item.title}</span>{item.pendingDecisionCount > 0 && <small>{item.pendingDecisionCount} pending</small>}</Link>)}{workspace.conversations.length === 0 && <p className="rail-empty">{workspace.connection === "connected" ? "Your conversations will appear here." : "Conversation history is unavailable until the Gateway connects."}</p>}</aside><section className="chat-welcome"><div className="welcome-symbol">a</div><div className="section-kicker">YOUR AGENT WORKSPACE</div><h1>{conversationId ? "Conversation workspace" : <>What would you like<br />to work on?</>}</h1><p>{conversationId ? `Conversation state: ${state.connection}. Submission controls are being connected.` : <>A clear conversation for your ideas, questions and approvals.<br />Create a conversation to begin.</>}</p>{(error || state.error) && <p role="alert">{error ?? state.error}</p>}<div className="welcome-suggestions"><div><span>✧</span><strong>Explore an idea</strong><small>Think through a problem step by step</small></div><div><span>◈</span><strong>Plan a task</strong><small>Break work into a clear sequence</small></div><div><span>↗</span><strong>Review a decision</strong><small>Keep actions and approvals in context</small></div></div><div className="composer-placeholder"><span>Chat composer is available after submission gates pass</span><span className="composer-placeholder-button">↑</span></div><small className="welcome-disclaimer">{workspace.session?.demoMode ? "Demo preview · No model or tool execution connected" : "Execution requires an authenticated Gateway"}</small></section></main>;
}
