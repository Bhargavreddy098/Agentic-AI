// Typed ASI client for the OpenClaw-derived frontend.
//
// This is the only module allowed to touch the ASI HTTP contract from the
// presentation layer. Every domain method mirrors the existing
// `GatewayClient` signatures from apps/web (implemented here, not imported
// from another app) and is individually gated: before any product read or
// mutation the client refreshes the session and capability projection and
// requires BOTH live operation support AND the server-allowed action. A
// denied operation never reaches the network.
//
// The client never stores credentials, never targets a client-supplied
// origin, never sends bearer secrets, and never fabricates command IDs:
// mutation inputs retain the caller-owned commandId across uncertain
// responses.

import { z } from "zod";
import {
  ApprovalDecisionInputSchema,
  CatalogSchema,
  ClarificationAnswerSchema,
  ConnectionViewSchema,
  ConversationPatchSchema,
  ConversationSnapshotSchema,
  ConversationSummarySchema,
  MemorySearchInputSchema,
  MemoryViewSchema,
  ModelViewSchema,
  PageSchema,
  ProviderViewSchema,
  SendMessageInputSchema,
  SettingsViewSchema,
  SkillViewSchema,
  TaskViewSchema,
  UiCommandResultSchema,
  UploadIntentSchema,
  UploadViewSchema,
  WorkspaceSessionSchema,
  type ActivityQuery,
  type ApprovalDecisionInput,
  type Catalog,
  type ClarificationAnswer,
  type ConnectionView,
  type ConversationPatch,
  type ConversationSnapshot,
  type ConversationSummary,
  type MemorySearchInput,
  type MemoryView,
  type ModelView,
  type Page,
  type ProviderView,
  type SendMessageInput,
  type SettingsView,
  type SkillView,
  type TaskView,
  type UiCapabilities,
  type UiCommandResult,
  type UiEvent,
  type UiMutationCommand,
  type UiOperation,
  type UploadIntent,
  type UploadView,
  type WorkspaceSession,
  UiMutationCommandSchema,
} from "@asi/contracts";
import { parseCapabilities } from "./capabilities.ts";
import { readAsiEvents, type ReplayController, type ReplayOptions } from "./events.ts";
import { asiJsonRequest, OperationDeniedError, TransportFailure } from "./http.ts";

export { OperationDeniedError, TransportFailure } from "./http.ts";
export type { ReplayController, ReplayOptions } from "./events.ts";

const BASE = "/api/ui/v1";

export interface AsiClientOptions {
  /**
   * Same-origin fetch implementation. In the browser this is `window.fetch`;
   * tests inject a loopback resolver. The adapter itself only ever passes
   * relative paths — never an absolute URL or foreign origin.
   */
  fetch: typeof fetch;
}

export interface HealthStatus {
  status: "ok";
}

export interface AsiClient {
  /** Liveness only. A healthy server grants no product capability. */
  health(signal?: AbortSignal): Promise<HealthStatus>;
  /** Server-owned capability projection. Malformed data fails closed. */
  capabilities(signal?: AbortSignal): Promise<UiCapabilities>;
  /** Current workspace session. CSRF token retained in connection memory. */
  session(signal?: AbortSignal): Promise<WorkspaceSession>;

  listConversations(cursor?: string, signal?: AbortSignal): Promise<Page<ConversationSummary>>;
  createConversation(input: { commandId: string }, signal?: AbortSignal): Promise<ConversationSummary>;
  updateConversation(id: string, input: ConversationPatch, signal?: AbortSignal): Promise<UiCommandResult>;
  getSnapshot(id: string, signal?: AbortSignal): Promise<ConversationSnapshot>;
  subscribe(
    id: string,
    after: number,
    controller: ReplayController,
    options: ReplayOptions,
    signal: AbortSignal,
  ): AsyncGenerator<UiEvent>;

  sendMessage(id: string, input: SendMessageInput, signal?: AbortSignal): Promise<UiCommandResult>;
  cancelRun(runId: string, commandId: string, signal?: AbortSignal): Promise<UiCommandResult>;
  answerClarification(id: string, input: ClarificationAnswer, signal?: AbortSignal): Promise<UiCommandResult>;
  decideApproval(id: string, input: ApprovalDecisionInput, signal?: AbortSignal): Promise<UiCommandResult>;

  beginUpload(input: UploadIntent, signal?: AbortSignal): Promise<UploadView>;
  completeUpload(id: string, commandId: string, signal?: AbortSignal): Promise<UploadView>;
  getUpload(id: string, signal?: AbortSignal): Promise<UploadView>;

  getProviders(signal?: AbortSignal): Promise<Catalog<ProviderView>>;
  getModels(signal?: AbortSignal): Promise<Catalog<ModelView>>;
  getSkills(signal?: AbortSignal): Promise<Catalog<SkillView>>;
  getConnections(signal?: AbortSignal): Promise<Catalog<ConnectionView>>;

  queryMemory(input: MemorySearchInput, signal?: AbortSignal): Promise<Page<MemoryView>>;
  getActivity(input: ActivityQuery, signal?: AbortSignal): Promise<Page<TaskView>>;
  getSettings(signal?: AbortSignal): Promise<SettingsView>;
  submitCommand(command: UiMutationCommand, signal?: AbortSignal): Promise<UiCommandResult>;
}

interface GateContext {
  capabilities: UiCapabilities;
  session: WorkspaceSession;
}

export function createAsiClient(options: AsiClientOptions): AsiClient {
  const fetchImpl = options.fetch;
  let csrfToken = "";

  async function fetchHealth(signal?: AbortSignal): Promise<HealthStatus> {
    // Strip diagnostic metadata; liveness never grants product capabilities.
    return asiJsonRequest(fetchImpl, "/health", z.object({ status: z.literal("ok") }), { signal });
  }

  async function fetchCapabilities(signal?: AbortSignal): Promise<UiCapabilities> {
    const raw = await asiJsonRequest(fetchImpl, `${BASE}/capabilities`, z.unknown(), { signal });
    try {
      return parseCapabilities(raw);
    } catch {
      throw new TransportFailure(502, "The capability projection is malformed or unsupported.");
    }
  }

  async function fetchSession(signal?: AbortSignal): Promise<WorkspaceSession> {
    const session = await asiJsonRequest(fetchImpl, `${BASE}/me`, WorkspaceSessionSchema, { signal });
    csrfToken = session.csrfToken;
    return session;
  }

  function isAllowed(session: WorkspaceSession, action: string): boolean {
    return session.allowedActions.includes(action);
  }

  /**
   * Refresh authoritative state, then enforce the double gate: the server
   * must advertise the operation as live AND the session must allow the
   * action. Any failure fails closed — no request leaves the browser.
   */
  async function gate(operation: UiOperation, action: string, signal?: AbortSignal): Promise<GateContext> {
    let capabilities: UiCapabilities;
    let session: WorkspaceSession;
    try {
      [capabilities, session] = await Promise.all([fetchCapabilities(signal), fetchSession(signal)]);
    } catch (error) {
      csrfToken = "";
      throw error;
    }

    const live = capabilities.operations.some(
      entry => entry.operation === operation && entry.state === "live",
    );
    if (!live || !isAllowed(session, action)) {
      throw new OperationDeniedError(operation);
    }
    return { capabilities, session };
  }

  function ensureCsrf(): string {
    return csrfToken;
  }

  return {
    health(signal) {
      return fetchHealth(signal);
    },

    async capabilities(signal) {
      const caps = await fetchCapabilities(signal);
      return caps;
    },

    async session(signal) {
      const session = await fetchSession(signal);
      return session;
    },

    async listConversations(cursor, signal) {
      await gate("conversation.read", "conversation.read", signal);
      return asiJsonRequest(fetchImpl, `${BASE}/conversations`, PageSchema(ConversationSummarySchema), {
        query: cursor ? `?cursor=${encodeURIComponent(cursor)}` : "",
        signal,
      });
    },

    async createConversation(input, signal) {
      await gate("conversation.create", "conversation.create", signal);
      return asiJsonRequest(fetchImpl, `${BASE}/conversations`, ConversationSummarySchema, {
        method: "POST",
        body: { commandId: input.commandId },
        csrfToken: ensureCsrf(),
        signal,
      });
    },

    async updateConversation(id, input, signal) {
      await gate("conversation.update", "conversation.update", signal);
      return asiJsonRequest(fetchImpl, `${BASE}/conversations/${encodeURIComponent(id)}`, UiCommandResultSchema, {
        method: "PATCH",
        body: ConversationPatchSchema.parse(input),
        csrfToken: ensureCsrf(),
        signal,
      });
    },

    async getSnapshot(id, signal) {
      await gate("conversation.read", "conversation.read", signal);
      return asiJsonRequest(fetchImpl, `${BASE}/conversations/${encodeURIComponent(id)}/snapshot`, ConversationSnapshotSchema, { signal });
    },

    async *subscribe(id, after, controller, replayOptions, signal) {
      await gate("conversation.read", "conversation.read", signal);
      const response = await fetchImpl(
        `${BASE}/conversations/${encodeURIComponent(id)}/events?after=${after}`,
        { credentials: "include", cache: "no-store", signal },
      );
      if (!response.ok) {
        throw new TransportFailure(response.status, "The conversation stream is unavailable.");
      }
      yield* readAsiEvents(response, signal, controller, replayOptions);
    },

    async sendMessage(id, input, signal) {
      await gate("message.send", "message.send", signal);
      return asiJsonRequest(fetchImpl, `${BASE}/conversations/${encodeURIComponent(id)}/messages`, UiCommandResultSchema, {
        method: "POST",
        body: SendMessageInputSchema.parse(input),
        csrfToken: ensureCsrf(),
        signal,
      });
    },

    async cancelRun(runId, commandId, signal) {
      await gate("run.cancel", "run.cancel", signal);
      return asiJsonRequest(fetchImpl, `${BASE}/runs/${encodeURIComponent(runId)}/cancel`, UiCommandResultSchema, {
        method: "POST",
        body: { commandId },
        csrfToken: ensureCsrf(),
        signal,
      });
    },

    async answerClarification(id, input, signal) {
      await gate("clarification.answer", "clarification.answer", signal);
      return asiJsonRequest(fetchImpl, `${BASE}/clarifications/${encodeURIComponent(id)}/answers`, UiCommandResultSchema, {
        method: "POST",
        body: ClarificationAnswerSchema.parse(input),
        csrfToken: ensureCsrf(),
        signal,
      });
    },

    async decideApproval(id, input, signal) {
      await gate("approval.decide", "approval.decide", signal);
      return asiJsonRequest(fetchImpl, `${BASE}/approvals/${encodeURIComponent(id)}/decisions`, UiCommandResultSchema, {
        method: "POST",
        body: ApprovalDecisionInputSchema.parse(input),
        csrfToken: ensureCsrf(),
        signal,
      });
    },

    async beginUpload(input, signal) {
      await gate("upload.create", "upload.create", signal);
      return asiJsonRequest(fetchImpl, `${BASE}/uploads`, UploadViewSchema, {
        method: "POST",
        body: UploadIntentSchema.parse(input),
        csrfToken: ensureCsrf(),
        signal,
      });
    },

    async completeUpload(id, commandId, signal) {
      await gate("upload.create", "upload.create", signal);
      return asiJsonRequest(fetchImpl, `${BASE}/uploads/${encodeURIComponent(id)}/complete`, UploadViewSchema, {
        method: "POST",
        body: { commandId },
        csrfToken: ensureCsrf(),
        signal,
      });
    },

    async getUpload(id, signal) {
      await gate("upload.create", "upload.create", signal);
      return asiJsonRequest(fetchImpl, `${BASE}/uploads/${encodeURIComponent(id)}`, UploadViewSchema, { signal });
    },

    async getProviders(signal) {
      await gate("provider.read", "provider.read", signal);
      return asiJsonRequest(fetchImpl, `${BASE}/providers`, CatalogSchema(ProviderViewSchema), { signal });
    },

    async getModels(signal) {
      await gate("model.read", "model.read", signal);
      return asiJsonRequest(fetchImpl, `${BASE}/models`, CatalogSchema(ModelViewSchema), { signal });
    },

    async getSkills(signal) {
      await gate("skill.read", "skill.read", signal);
      return asiJsonRequest(fetchImpl, `${BASE}/skills`, CatalogSchema(SkillViewSchema), { signal });
    },

    async getConnections(signal) {
      await gate("connection.read", "connection.read", signal);
      return asiJsonRequest(fetchImpl, `${BASE}/connections`, CatalogSchema(ConnectionViewSchema), { signal });
    },

    async queryMemory(input, signal) {
      await gate("memory.read", "memory.read", signal);
      const parsed = MemorySearchInputSchema.parse(input);
      const query = new URLSearchParams(
        Object.entries(parsed).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]),
      );
      return asiJsonRequest(fetchImpl, `${BASE}/memory`, PageSchema(MemoryViewSchema), { query: `?${query}`, signal });
    },

    async getActivity(input, signal) {
      await gate("activity.read", "activity.read", signal);
      const query = new URLSearchParams(
        Object.entries(input).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]),
      );
      return asiJsonRequest(fetchImpl, `${BASE}/activity`, PageSchema(TaskViewSchema), { query: `?${query}`, signal });
    },

    async getSettings(signal) {
      await gate("settings.read", "settings.read", signal);
      return asiJsonRequest(fetchImpl, `${BASE}/settings`, SettingsViewSchema, { signal });
    },

    async submitCommand(command, signal) {
      const parsed = UiMutationCommandSchema.parse(command);
      const operationByType: Record<UiMutationCommand["type"], UiOperation> = {
        "provider.connect": "provider.write",
        "provider.disconnect": "provider.write",
        "model.preference.set": "model.write",
        "skill.install": "skill.write",
        "skill.enable": "skill.write",
        "skill.disable": "skill.write",
        "skill.revoke": "skill.write",
        "connection.connect": "connection.write",
        "connection.disconnect": "connection.write",
        "memory.correct": "memory.write",
        "memory.delete": "memory.write",
        "settings.update": "settings.write",
      };
      await gate(operationByType[parsed.type], operationByType[parsed.type].split(".")[0] ?? parsed.type, signal);
      return asiJsonRequest(fetchImpl, `${BASE}/commands`, UiCommandResultSchema, {
        method: "POST",
        body: parsed,
        csrfToken: ensureCsrf(),
        signal,
      });
    },
  };
}
