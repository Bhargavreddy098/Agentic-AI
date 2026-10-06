import type { z } from "zod";
import {
  WorkspaceSessionSchema, ConversationSummarySchema, ConversationSnapshotSchema,
  UiCommandResultSchema, UiEventSchema, UploadViewSchema, CatalogSchema, PageSchema,
  ModelViewSchema, ProviderViewSchema, SkillViewSchema, ConnectionViewSchema, MemoryViewSchema,
  TaskViewSchema, SettingsViewSchema, SendMessageInputSchema, ApprovalDecisionInputSchema,
  ClarificationAnswerSchema, UiMutationCommandSchema,
} from "@asi/contracts";
import type { GatewayClient } from "./client.ts";
import { gatewayEndpoints, gatewayPath } from "./client.ts";

export class GatewayError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export class HttpGatewayClient implements GatewayClient {
  private csrf = "";
  private demoCookie = "";
  constructor(private readonly mode: "demo" | "live", private readonly baseUrl = "") {
    if (baseUrl && (mode !== "demo" || !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseUrl))) throw new Error("Only explicit demo clients may target loopback fixtures");
  }
  private transportHeaders(mutation: boolean): Record<string, string> {
    const headers: Record<string, string> = {};
    if (mutation) headers["x-csrf-token"] = this.csrf;
    if (typeof window === "undefined" && this.mode === "demo") { headers.origin = "http://127.0.0.1:3000"; if (this.demoCookie) headers.cookie = this.demoCookie; }
    return headers;
  }
  private checkMode(response: Response) {
    if (this.mode === "live" && response.headers.get("x-asi-demo") === "true") throw new GatewayError(502, "Live connection returned a demo response.");
  }
  private async request<T extends z.ZodType>(endpoint: keyof typeof gatewayEndpoints, schema: T, id?: string, body?: unknown, query = "", signal?: AbortSignal): Promise<z.infer<T>> {
    const method = gatewayEndpoints[endpoint][0];
    if (method !== "GET" && !this.csrf) await this.getMe();
    const headers = { ...this.transportHeaders(method !== "GET"), "content-type": "application/json" };
    const response = await fetch(this.baseUrl + gatewayPath(endpoint, id) + query, { method, headers, credentials: "include", cache: "no-store", ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(signal ? { signal } : {}) });
    this.checkMode(response);
    if (!response.ok) throw new GatewayError(response.status, response.status === 401 ? "Sign in again to continue." : "Gateway request failed. Refresh the current state.");
    if (this.mode === "demo" && typeof window === "undefined") { const cookie = response.headers.get("set-cookie"); if (cookie) this.demoCookie = cookie.split(";")[0] ?? ""; }
    return schema.parse(await response.json());
  }
  async getMe() { const session = await this.request("me", WorkspaceSessionSchema); if (session.demoMode !== (this.mode === "demo")) throw new GatewayError(502, "Gateway mode does not match this workspace."); this.csrf = session.csrfToken; return session; }
  listConversations(cursor?: string) { return this.request("conversations", PageSchema(ConversationSummarySchema), undefined, undefined, cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""); }
  createConversation(commandId: string) { return this.request("createConversation", ConversationSummarySchema, undefined, { commandId }); }
  updateConversation(id: string, input: Parameters<GatewayClient["updateConversation"]>[1]) { return this.request("updateConversation", UiCommandResultSchema, id, input); }
  getSnapshot(id: string) { return this.request("snapshot", ConversationSnapshotSchema, id); }
  sendMessage(id: string, input: Parameters<GatewayClient["sendMessage"]>[1]) { return this.request("sendMessage", UiCommandResultSchema, id, SendMessageInputSchema.parse(input)); }
  cancelRun(runId: string, commandId: string) { return this.request("cancelRun", UiCommandResultSchema, runId, { commandId }); }
  answerClarification(id: string, input: Parameters<GatewayClient["answerClarification"]>[1]) { return this.request("answerClarification", UiCommandResultSchema, id, ClarificationAnswerSchema.parse(input)); }
  decideApproval(id: string, input: Parameters<GatewayClient["decideApproval"]>[1]) { return this.request("decideApproval", UiCommandResultSchema, id, ApprovalDecisionInputSchema.parse(input)); }
  beginUpload(input: Parameters<GatewayClient["beginUpload"]>[0]) { return this.request("uploads", UploadViewSchema, undefined, input); }
  async uploadContent(id: string, file: File, signal: AbortSignal) {
    if (!this.csrf) await this.getMe();
    const response = await fetch(this.baseUrl + gatewayPath("uploadContent", id), { method: "PUT", body: file, signal, credentials: "include", headers: this.transportHeaders(true) });
    this.checkMode(response);
    if (!response.ok) throw new GatewayError(response.status, "Upload failed.");
  }
  completeUpload(id: string, commandId: string) { return this.request("completeUpload", UploadViewSchema, id, { commandId }); }
  getUpload(id: string, signal: AbortSignal) { return this.request("getUpload", UploadViewSchema, id, undefined, "", signal); }
  getModels() { return this.request("models", CatalogSchema(ModelViewSchema)); }
  getProviders() { return this.request("providers", CatalogSchema(ProviderViewSchema)); }
  getSkills() { return this.request("skills", CatalogSchema(SkillViewSchema)); }
  getConnections() { return this.request("connections", CatalogSchema(ConnectionViewSchema)); }
  queryMemory(input: Parameters<GatewayClient["queryMemory"]>[0]) { const query = new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)])); return this.request("memory", PageSchema(MemoryViewSchema), undefined, undefined, `?${query}`); }
  getActivity(input: Parameters<GatewayClient["getActivity"]>[0]) { const query = new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)])); return this.request("activity", PageSchema(TaskViewSchema), undefined, undefined, `?${query}`); }
  getSettings() { return this.request("settings", SettingsViewSchema); }
  submitCommand(command: Parameters<GatewayClient["submitCommand"]>[0]) { return this.request("commands", UiCommandResultSchema, undefined, UiMutationCommandSchema.parse(command)); }
  async *subscribe(id: string, after: number, signal: AbortSignal) {
    const headers: Record<string, string> = {};
    if (typeof window === "undefined" && this.demoCookie) headers.cookie = this.demoCookie;
    const response = await fetch(this.baseUrl + gatewayPath("events", id) + `?after=${after}`, { signal, credentials: "include", cache: "no-store", headers });
    if (!response.ok || !response.body) throw new GatewayError(response.status, "Conversation stream unavailable.");
    if (!response.headers.get("content-type")?.startsWith("text/event-stream")) throw new GatewayError(502, "Conversation stream has an invalid content type.");
    if (this.mode === "live" && response.headers.get("x-asi-demo") === "true") throw new GatewayError(502, "Demo stream cannot authenticate to live mode.");
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = "";
    try {
      while (!signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) { buffer += decoder.decode(); if (buffer.trim()) throw new GatewayError(502, "Conversation stream ended with an incomplete frame."); break; }
        buffer += decoder.decode(chunk.value, { stream: true });
        if (buffer.length > 2097152) throw new GatewayError(502, "Stream frame exceeds its limit.");
        let boundary = /\r?\n\r?\n/.exec(buffer);
        while (boundary) {
          const frame = buffer.slice(0, boundary.index); buffer = buffer.slice(boundary.index + boundary[0].length);
          const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
          if (data) yield UiEventSchema.parse(JSON.parse(data));
          boundary = /\r?\n\r?\n/.exec(buffer);
        }
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
  }
}
