import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  ActivityQuerySchema,
  ApprovalDecisionInputSchema,
  ClarificationAnswerSchema,
  ConversationPatchSchema,
  MemorySearchInputSchema,
  SendMessageInputSchema,
  UploadIntentSchema,
  UiMutationCommandSchema,
  type ActivityQuery,
  type Catalog,
  type MemorySearchInput,
  type Page,
  type SettingsView,
  type TaskView,
  type UiCommandResult,
  type UiMutationCommand,
} from "@asi/contracts";
import { normalizedError } from "./errors.js";
import { projectSession, projectSnapshot } from "./project.js";
import { createSessionStore, csrfMatches, SESSION_COOKIE, type UiSessionRecord, type UiSessionStore } from "./session.js";
import { encodeEvent, replayEvents } from "./stream.js";
import { UploadQuarantine } from "./uploads.js";
import {
  DEFAULT_UPLOAD_LIMITS,
  type UiAuthPort,
  type UiCatalogPorts,
  type UiControlPort,
  type UiEpisodePort,
  type UiUploadLimits,
  type UiUploadPort,
} from "./ports.js";

export interface UiGatewayConfig {
  control: UiControlPort;
  episodes: UiEpisodePort;
  uploads: UiUploadPort;
  auth: UiAuthPort;
  catalogs?: UiCatalogPorts;
  commands?: (workspaceId: string, command: UiMutationCommand) => Promise<UiCommandResult>;
  sessions?: UiSessionStore;
  limits?: UiUploadLimits;
  allowedOrigins?: string[];
  now?: () => number;
  secureCookies?: boolean;
}

type Variables = { session: UiSessionRecord };

async function readJson(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const value = await c.req.json();
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function originAllowed(origin: string, host: string | undefined, allowlist: string[] | undefined): boolean {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    if (allowlist && allowlist.length > 0) return allowlist.includes(parsed.origin);
    return host !== undefined && parsed.host === host;
  } catch {
    return false;
  }
}

async function readBytes(c: Context): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await c.req.arrayBuffer());
  } catch {
    return null;
  }
}

function unavailableCatalog<T>(reason: string): Catalog<T> {
  return { items: [], revision: 0, availability: "unavailable", reason };
}

function unavailableSettings(): SettingsView {
  return {
    revision: 0,
    allowedActions: [],
    availability: "unavailable",
    privacyMode: "unavailable",
    spendLimitMicroUsd: null,
    retentionDays: null,
    notifications: false,
    scheduleEnabled: false,
  };
}

function emptyPage<T>(): Page<T> {
  return { items: [], nextCursor: null };
}

function activityQuery(c: Context): ActivityQuery {
  const raw = c.req.query();
  const limit = Number(raw.limit ?? "50");
  return {
    limit: Number.isFinite(limit) && limit >= 1 ? Math.min(Math.floor(limit), 100) : 50,
    ...(raw.status ? { status: raw.status } : {}),
    ...(raw.conversationId ? { conversationId: raw.conversationId } : {}),
    ...(raw.cursor ? { cursor: raw.cursor } : {}),
  };
}

function memoryQuery(c: Context): MemorySearchInput {
  const raw = c.req.query();
  const limit = Number(raw.limit ?? "50");
  return {
    query: raw.query ?? "",
    limit: Number.isFinite(limit) && limit >= 1 ? Math.min(Math.floor(limit), 100) : 50,
    ...(raw.scope ? { scope: raw.scope as MemorySearchInput["scope"] } : {}),
    ...(raw.cursor ? { cursor: raw.cursor } : {}),
  };
}

export function createUiGateway(config: UiGatewayConfig): Hono<{ Variables: Variables }> {
  const base = "/api/ui/v1";
  const now = config.now ?? Date.now;
  const limits = config.limits ?? DEFAULT_UPLOAD_LIMITS;
  const sessions = config.sessions ?? createSessionStore({ now });
  const catalogs = config.catalogs ?? {};
  const quarantine = new UploadQuarantine(config.uploads, limits, now);
  const app = new Hono<{ Variables: Variables }>();

  app.post(`${base}/auth/session`, async c => {
    const body = await readJson(c);
    const assertion = typeof body?.assertion === "string" ? body.assertion : "";
    if (!assertion) return c.json(normalizedError("INVALID_INPUT", "A sign-in assertion is required."), 400);
    const principal = await config.auth.verifyAssertion(assertion);
    if (!principal) return c.json(normalizedError("UNAUTHENTICATED", "Sign-in assertion was rejected."), 401);
    const session = sessions.create(principal);
    setCookie(c, SESSION_COOKIE, session.sessionId, { httpOnly: true, sameSite: "Lax", path: "/", secure: config.secureCookies ?? false });
    return c.json({ workspaceId: principal.workspaceId, subjectId: principal.subjectId, csrfToken: session.csrfToken });
  });

  app.delete(`${base}/auth/session`, c => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (sessionId) sessions.revoke(sessionId);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  app.use(`${base}/*`, async (c, next) => {
    const session = sessions.get(getCookie(c, SESSION_COOKIE));
    if (!session) return c.json(normalizedError("UNAUTHENTICATED", "Sign in again to continue."), 401);
    const method = c.req.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      if (!originAllowed(c.req.header("origin") ?? "", c.req.header("host"), config.allowedOrigins)) {
        return c.json(normalizedError("POLICY_DENIED", "Request origin is not allowed."), 403);
      }
      if (!csrfMatches(c.req.header("x-csrf-token"), session.csrfToken)) {
        return c.json(normalizedError("POLICY_DENIED", "CSRF token is missing or invalid."), 403);
      }
    }
    c.set("session", session);
    await next();
  });

  app.get(`${base}/me`, c => {
    const { principal, csrfToken } = c.get("session");
    return c.json(projectSession(principal, csrfToken, limits));
  });

  app.get(`${base}/conversations`, async c => {
    const page = await config.control.list(c.get("session").principal.workspaceId, c.req.query("cursor") || undefined);
    return c.json(page);
  });

  app.post(`${base}/conversations`, async c => {
    const body = await readJson(c);
    const commandId = typeof body?.commandId === "string" ? body.commandId : "";
    if (!commandId || commandId.length > 128) return c.json(normalizedError("INVALID_INPUT", "Command identity required."), 400);
    return c.json(await config.control.create(c.get("session").principal.workspaceId, commandId));
  });

  app.patch(`${base}/conversations/:id`, async c => {
    const parsed = ConversationPatchSchema.safeParse(await readJson(c));
    if (!parsed.success) return c.json(normalizedError("INVALID_INPUT", "Conversation update was invalid."), 400);
    return c.json(await config.control.patch(c.get("session").principal.workspaceId, c.req.param("id"), parsed.data));
  });

  app.get(`${base}/conversations/:id/snapshot`, async c => {
    const record = await config.control.read(c.get("session").principal.workspaceId, c.req.param("id"));
    if (!record) return c.json(normalizedError("INVALID_INPUT", "Conversation unavailable."), 404);
    return c.json(projectSnapshot(record));
  });

  app.get(`${base}/conversations/:id/events`, async c => {
    const workspaceId = c.get("session").principal.workspaceId;
    const conversationId = c.req.param("id");
    const record = await config.control.read(workspaceId, conversationId);
    if (!record) return c.json(normalizedError("INVALID_INPUT", "Conversation unavailable."), 404);
    const parsedAfter = Number.parseInt(c.req.query("after") ?? "0", 10);
    const after = Number.isFinite(parsedAfter) && parsedAfter > 0 ? parsedAfter : 0;
    const events = replayEvents(await config.episodes.readEvents(workspaceId, conversationId, after), after);
    return c.body(events.map(encodeEvent).join(""), 200, { "content-type": "text/event-stream", "cache-control": "no-store" });
  });

  app.post(`${base}/conversations/:id/messages`, async c => {
    const parsed = SendMessageInputSchema.safeParse(await readJson(c));
    if (!parsed.success) return c.json(normalizedError("INVALID_INPUT", "Message was invalid."), 400);
    const input = parsed.data;
    if (new TextEncoder().encode(input.text).byteLength > limits.maxMessageBytes) {
      return c.json(normalizedError("INVALID_INPUT", "Message exceeds the workspace size limit."), 400);
    }
    if (input.attachmentIds.length > limits.maxAttachmentCount) {
      return c.json(normalizedError("POLICY_DENIED", "Too many attachments for this workspace."), 403);
    }
    const workspaceId = c.get("session").principal.workspaceId;
    const unapproved = input.attachmentIds.find(attachmentId => !quarantine.isReleased(workspaceId, attachmentId));
    if (unapproved) return c.json(normalizedError("POLICY_DENIED", "Attachment is not approved for run input."), 403);
    return c.json(await config.control.appendMessage(workspaceId, c.req.param("id"), input));
  });

  app.post(`${base}/runs/:id/cancel`, async c => {
    const body = await readJson(c);
    const commandId = typeof body?.commandId === "string" ? body.commandId : "";
    if (!commandId) return c.json(normalizedError("INVALID_INPUT", "Command identity required."), 400);
    return c.json(await config.control.cancelRun(c.get("session").principal.workspaceId, c.req.param("id"), commandId));
  });

  app.post(`${base}/clarifications/:id/answers`, async c => {
    const parsed = ClarificationAnswerSchema.safeParse(await readJson(c));
    if (!parsed.success) return c.json(normalizedError("INVALID_INPUT", "Clarification answer was invalid."), 400);
    return c.json(await config.control.answerClarification(c.get("session").principal.workspaceId, c.req.param("id"), parsed.data));
  });

  app.post(`${base}/approvals/:id/decisions`, async c => {
    const parsed = ApprovalDecisionInputSchema.safeParse(await readJson(c));
    if (!parsed.success) return c.json(normalizedError("INVALID_INPUT", "Approval decision was invalid."), 400);
    return c.json(await config.control.decideApproval(c.get("session").principal.workspaceId, c.req.param("id"), parsed.data));
  });

  app.post(`${base}/uploads`, async c => {
    const parsed = UploadIntentSchema.safeParse(await readJson(c));
    if (!parsed.success) return c.json(normalizedError("INVALID_INPUT", "Upload intent was invalid."), 400);
    return c.json(quarantine.begin(c.get("session").principal.workspaceId, parsed.data));
  });

  app.put(`${base}/uploads/:id/content`, async c => {
    const bytes = await readBytes(c);
    if (!bytes) return c.json(normalizedError("INVALID_INPUT", "Upload content is required."), 400);
    const result = quarantine.write(c.get("session").principal.workspaceId, c.req.param("id"), bytes);
    if (!result.ok) return c.json(normalizedError(result.code, result.message), 403);
    return c.body(null, 204);
  });

  app.post(`${base}/uploads/:id/complete`, async c => {
    const body = await readJson(c);
    const commandId = typeof body?.commandId === "string" ? body.commandId : "";
    if (!commandId) return c.json(normalizedError("INVALID_INPUT", "Command identity required."), 400);
    const view = await quarantine.complete(c.get("session").principal.workspaceId, c.req.param("id"), commandId);
    if (!view) return c.json(normalizedError("INVALID_INPUT", "Upload unavailable."), 404);
    return c.json(view);
  });

  app.get(`${base}/uploads/:id`, c => {
    const view = quarantine.view(c.get("session").principal.workspaceId, c.req.param("id"));
    if (!view) return c.json(normalizedError("INVALID_INPUT", "Upload unavailable."), 404);
    return c.json(view);
  });

  app.get(`${base}/providers`, async c => c.json(catalogs.providers ? await catalogs.providers(c.get("session").principal.workspaceId) : unavailableCatalog("Provider catalog is not available in this build.")));
  app.get(`${base}/models`, async c => c.json(catalogs.models ? await catalogs.models(c.get("session").principal.workspaceId) : unavailableCatalog("Model catalog is not available in this build.")));
  app.get(`${base}/skills`, async c => c.json(catalogs.skills ? await catalogs.skills(c.get("session").principal.workspaceId) : unavailableCatalog("Skill catalog is not available in this build.")));
  app.get(`${base}/connections`, async c => c.json(catalogs.connections ? await catalogs.connections(c.get("session").principal.workspaceId) : unavailableCatalog("Connection catalog is not available in this build.")));

  app.get(`${base}/memory`, async c => {
    const workspaceId = c.get("session").principal.workspaceId;
    if (!catalogs.memory) return c.json(emptyPage());
    const parsed = MemorySearchInputSchema.safeParse(memoryQuery(c));
    if (!parsed.success) return c.json(normalizedError("INVALID_INPUT", "Memory query was invalid."), 400);
    return c.json(await catalogs.memory(workspaceId, parsed.data));
  });

  app.get(`${base}/activity`, async c => {
    const workspaceId = c.get("session").principal.workspaceId;
    if (!catalogs.activity) return c.json(emptyPage<TaskView>());
    const parsed = ActivityQuerySchema.safeParse(activityQuery(c));
    if (!parsed.success) return c.json(normalizedError("INVALID_INPUT", "Activity query was invalid."), 400);
    return c.json(await catalogs.activity(workspaceId, parsed.data));
  });

  app.get(`${base}/settings`, async c => c.json(catalogs.settings ? await catalogs.settings(c.get("session").principal.workspaceId) : unavailableSettings()));

  app.post(`${base}/commands`, async c => {
    const parsed = UiMutationCommandSchema.safeParse(await readJson(c));
    if (!parsed.success) return c.json(normalizedError("INVALID_INPUT", "Management command was invalid."), 400);
    const workspaceId = c.get("session").principal.workspaceId;
    const handler = config.commands ?? ((workspace: string, command: UiMutationCommand) => config.control.submitCommand(workspace, command));
    return c.json(await handler(workspaceId, parsed.data));
  });

  return app;
}
