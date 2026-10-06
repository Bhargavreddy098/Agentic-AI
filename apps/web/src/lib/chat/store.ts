import type { GatewayClient } from "../gateway/client.ts";
import { GatewayError } from "../gateway/http-client.ts";
import { hydrateConversation, reduceConversation, type ConversationState } from "./reducer.ts";
import { SubmissionController } from "./submission.ts";
import type { UiCommandResult } from "@asi/contracts";

export type ChatStoreState = { workspaceId: string | null; conversation: ConversationState | null; connection: "idle" | "connecting" | "connected" | "recovering" | "disconnected" | "unauthenticated"; draft: string; error: string | null };
const empty = (): ChatStoreState => ({ workspaceId: null, conversation: null, connection: "idle", draft: "", error: null });
const pause = (signal: AbortSignal) => new Promise<void>(resolve => {
  const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
  const timer = setTimeout(done, 300); signal.addEventListener("abort", done, { once: true });
  if (signal.aborted) done();
});
export class ChatStore {
  private state: ChatStoreState = empty();
  private listeners = new Set<() => void>();
  private controller: AbortController | null = null;
  private generation = 0;
  private identity: string | null = null;
  private drafts = new Map<string, string>();
  private submissions = new Map<string, SubmissionController>();
  private cancellations = new Map<string, string>();
  constructor(private readonly client: GatewayClient) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(next: ChatStoreState) { this.state = next; this.listeners.forEach(listener => listener()); }
  submissionFor(id: string) {
    const existing = this.submissions.get(id); if (existing) return existing;
    if (this.submissions.size >= 100) { const settled = [...this.submissions].find(([, controller]) => !controller.pending); if (settled) this.submissions.delete(settled[0]); else throw new Error("Unresolved submission capacity reached; reconcile existing requests first."); }
    const identity = this.identity;
    const controller = new SubmissionController(async input => {
      const result = await this.client.sendMessage(id, input);
      if (result.commandId === input.commandId && result.status === "applied" && this.identity === identity && this.submissions.get(id) === controller && this.drafts.get(id) === input.text) {
        this.drafts.set(id, ""); if (this.state.conversation?.snapshot.conversationId === id) this.publish({ ...this.state, draft: "" });
      }
      return result;
    });
    this.submissions.set(id, controller); return controller;
  }
  async cancel(runId: string): Promise<UiCommandResult> {
    if (this.cancellations.size >= 100 && !this.cancellations.has(runId)) throw new Error("Reconcile uncertain cancellation requests first.");
    const commandId = this.cancellations.get(runId) ?? crypto.randomUUID(); this.cancellations.set(runId, commandId);
    const identity = this.identity;
    const result = await this.client.cancelRun(runId, commandId);
    if (result.commandId !== commandId) throw new Error("Cancellation acknowledgement identity mismatch");
    if (this.identity === identity && this.cancellations.get(runId) === commandId) this.cancellations.delete(runId);
    return result;
  }
  setDraft(draft: string) { const id = this.state.conversation?.snapshot.conversationId; if (id) { if (this.drafts.size >= 100 && !this.drafts.has(id)) this.drafts.delete(this.drafts.keys().next().value!); this.drafts.set(id, draft.slice(0, 1048576)); } this.publish({ ...this.state, draft: draft.slice(0, 1048576) }); }
  clear() { this.generation++; this.controller?.abort(); this.controller = null; this.identity = null; this.drafts.clear(); this.submissions.clear(); this.cancellations.clear(); this.publish(empty()); }
  disconnect() { this.generation++; this.controller?.abort(); this.controller = null; this.publish({ ...this.state, connection: "disconnected" }); }
  async open(conversationId: string) {
    this.controller?.abort(); const generation = ++this.generation;
    const controller = new AbortController(); this.controller = controller;
    const current = () => generation === this.generation && !controller.signal.aborted;
    this.publish({ ...empty(), connection: "connecting" });
    try {
      const session = await this.client.getMe(); if (!current()) return;
      const identity = JSON.stringify([session.workspaceId, session.subjectId]);
      if (this.identity !== identity) { this.drafts.clear(); this.submissions.clear(); this.cancellations.clear(); }
      this.identity = identity;
      const value = await this.client.getSnapshot(conversationId); if (!current()) return;
      if (value.workspaceId !== session.workspaceId || value.conversationId !== conversationId) throw new GatewayError(403, "Conversation ownership does not match this workspace.");
      this.publish({ ...empty(), workspaceId: session.workspaceId, conversation: hydrateConversation(value), connection: "connected", draft: this.drafts.get(conversationId) ?? "" });
      void this.pump(conversationId, generation, controller);
    } catch (error) { if (current()) this.failure(error); }
  }
  private failure(error: unknown) {
    if (error instanceof GatewayError && [401, 403].includes(error.status)) {
      this.controller?.abort(); this.identity = null; this.drafts.clear(); this.submissions.clear(); this.cancellations.clear(); this.publish({ ...empty(), connection: "unauthenticated", error: "Sign in or request access before reconnecting." });
    } else this.publish({ ...this.state, connection: "disconnected", error: "Connection unavailable. Refresh to reconnect." });
  }
  private async pump(id: string, generation: number, controller: AbortController) {
    let failures = 0;
    const current = () => generation === this.generation && !controller.signal.aborted;
    while (current()) {
      try {
        const conversation = this.state.conversation; if (!conversation) return;
        for await (const event of this.client.subscribe(id, conversation.snapshot.lastEventSequence, controller.signal)) {
          if (!current() || !this.state.conversation) return;
          const next = reduceConversation(this.state.conversation, event);
          if (next.needsResync) { await this.resync(id, current, event.sequence); break; }
          this.publish({ ...this.state, conversation: next, connection: "connected", error: null });
        }
        failures = 0;
      } catch (error) {
        if (!current()) return;
        if (error instanceof GatewayError && error.status === 409) {
          if (++failures >= 3) { this.failure(error); return; }
          try { await this.resync(id, current); }
          catch (recoveryError) { if (!current()) return; this.failure(recoveryError); return; }
        }
        else if (error instanceof GatewayError && [401, 403].includes(error.status)) { this.failure(error); return; }
        else if (++failures >= 3) { this.failure(error); return; }
        else this.publish({ ...this.state, connection: "recovering", error: "Reconnecting to conversation events…" });
      }
      await pause(controller.signal);
    }
  }
  private async resync(id: string, current: () => boolean, minimumSequence = this.state.conversation?.snapshot.lastEventSequence ?? 0) {
    this.publish({ ...this.state, connection: "recovering" });
    const value = await this.client.getSnapshot(id); if (!current()) return;
    if (value.workspaceId !== this.state.workspaceId || value.conversationId !== id) throw new GatewayError(403, "Conversation ownership changed.");
    if (value.lastEventSequence < minimumSequence) throw new GatewayError(502, "Recovery snapshot does not cover the missing events.");
    this.publish({ ...this.state, conversation: hydrateConversation(value), connection: "connected", error: null });
  }
}
