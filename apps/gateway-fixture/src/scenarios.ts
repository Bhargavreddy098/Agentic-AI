import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { setCookie, getCookie } from "hono/cookie";
import { createHash } from "node:crypto";
import { SendMessageInputSchema, ClarificationAnswerSchema, ApprovalDecisionInputSchema, UiMutationCommandSchema, ConversationPatchSchema, UploadIntentSchema, UiEventSchema, ConversationSnapshotSchema, type UploadView, type ConversationSnapshot, type ConversationSummary, type UiEvent, type UiCommandResult, type Interaction } from "@asi/contracts";

export function createDemoGateway() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo fixture is unavailable in production");
  const app = new Hono();
  const base = "/api/ui/v1";
  const now = "2026-10-06T12:00:00Z";
  let counter = 0;
  const id = (kind: string) => `${kind}-${++counter}`;
  const conversations = new Map<string, { summary: ConversationSummary; snapshot: ConversationSnapshot; events: UiEvent[]; activeRunId: string | null }>();
  const commands = new Map<string, { hash: string; result: unknown }>();
  const uploads = new Map<string, { view: UploadView; byteSize: number; uploaded: boolean }>();
  const protectedRuns = new Set<string>();
  const error = (code: "INVALID_INPUT" | "UNAUTHENTICATED" | "POLICY_DENIED" | "UNKNOWN_OUTCOME" | "BUDGET_EXCEEDED" | "DEPENDENCY_UNAVAILABLE", safeMessage: string) => ({ error: { code, safeMessage, retryable: false } });
  const applied = (commandId: string, revision: number): UiCommandResult => ({ commandId, status: "applied", revision });
  const conflict = (commandId: string, revision: number): UiCommandResult => ({ commandId, status: "conflict", revision, error: { code: "INVALID_INPUT", safeMessage: "State or command changed; refresh and try again.", retryable: false } });
  const rejected = (commandId: string, revision: number, safeMessage: string): UiCommandResult => ({ commandId, status: "rejected", revision, error: { code: "POLICY_DENIED", safeMessage, retryable: false } });
  const once = (key: string, input: { commandId: string }, operation: () => unknown, revision = 0): unknown => {
    const commandKey = `${key}/${input.commandId}`;
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const previous = commands.get(commandKey);
    if (previous) return previous.hash === hash ? previous.result : conflict(input.commandId, revision);
    if (commands.size > 5000) throw new Error("Demo command capacity reached");
    const result = operation(); commands.set(commandKey, { hash, result }); return result;
  };
  const emit = (conversationId: string, eventType: UiEvent["eventType"], payload: unknown) => {
    const entry = conversations.get(conversationId);
    if (!entry) throw new Error("Missing synthetic conversation");
    if (entry.events.length > 20000) throw new Error("Demo replay capacity reached");
    const event = UiEventSchema.parse({ schemaVersion: 1, eventId: id("event"), conversationId, sequence: entry.events.length + 1, occurredAt: now, eventType, payload });
    entry.events.push(structuredClone(event)); entry.snapshot.lastEventSequence = event.sequence; entry.snapshot.revision += 1;
    entry.summary.revision = entry.snapshot.revision;
    if (event.eventType === "message.created") entry.snapshot.messages.push(event.payload);
    if (event.eventType === "message.delta") {
      const message = entry.snapshot.messages.find(message => message.messageId === event.payload.messageId);
      const part = message?.parts.find(part => part.partId === event.payload.partId);
      if (part?.type === "text") part.text += event.payload.text;
    }
    if (event.eventType === "run.status") { entry.snapshot.runStatus = event.payload.status; entry.snapshot.activeRunId = event.payload.runId; entry.summary.activeRun = event.payload.status; }
    if (event.eventType === "approval.requested" || event.eventType === "approval.resolved" || event.eventType === "clarification.requested" || event.eventType === "clarification.resolved") {
      const index = entry.snapshot.interactions.findIndex(item => item.interactionId === event.payload.interactionId);
      if (index < 0) entry.snapshot.interactions.push(event.payload); else entry.snapshot.interactions[index] = event.payload;
      entry.summary.pendingDecisionCount = entry.snapshot.interactions.filter(item => item.status === "pending").length;
    }
    if (event.eventType === "task.updated") { const index = entry.snapshot.tasks.findIndex(item => item.taskId === event.payload.taskId); if (index < 0) entry.snapshot.tasks.push(event.payload); else entry.snapshot.tasks[index] = event.payload; }
    if (event.eventType === "tool.updated") { const index = entry.snapshot.tools.findIndex(item => item.toolId === event.payload.toolId); if (index < 0) entry.snapshot.tools.push(event.payload); else entry.snapshot.tools[index] = event.payload; }
    if (event.eventType === "artifact.ready") { const index = entry.snapshot.artifacts.findIndex(item => item.artifactId === event.payload.artifactId); if (index < 0) entry.snapshot.artifacts.push(event.payload); else entry.snapshot.artifacts[index] = event.payload; }
    if (event.eventType === "goal.updated") { const list = (entry.snapshot.goals ??= []); const index = list.findIndex(item => item.goalId === event.payload.goalId); if (index < 0) list.push(event.payload); else list[index] = event.payload; }
    if (event.eventType === "plan.updated") { const list = (entry.snapshot.plans ??= []); const index = list.findIndex(item => item.planId === event.payload.planId); if (index < 0) list.push(event.payload); else list[index] = event.payload; }
    if (event.eventType === "verification.completed") { const list = (entry.snapshot.verifications ??= []); const index = list.findIndex(item => item.reportId === event.payload.reportId); if (index < 0) list.push(event.payload); else list[index] = event.payload; }
    if (event.eventType === "project.updated") { const list = (entry.snapshot.projects ??= []); const index = list.findIndex(item => item.projectId === event.payload.projectId); if (index < 0) list.push(event.payload); else list[index] = event.payload; }
    return event;
  };
  const create = (): ConversationSummary => {
    if (conversations.size >= 100) throw new Error("Demo conversation capacity reached");
    const conversationId = id("conversation");
    const summary: ConversationSummary = { conversationId, workspaceId: "demo-workspace", title: "New conversation", lastUpdatedAt: now, pendingDecisionCount: 0, activeRun: null, revision: 0 };
    const snapshot: ConversationSnapshot = { conversationId, workspaceId: "demo-workspace", revision: 0, lastEventSequence: 0, messages: [], interactions: [], tasks: [], tools: [], artifacts: [], runStatus: null, effectiveModel: "synthetic-demo", usage: { inputTokens: null, outputTokens: null, costMicroUsd: null }, composerCapabilities: ["send", "cancel"] };
    conversations.set(conversationId, { summary, snapshot, events: [], activeRunId: null }); return summary;
  };
  const requestInteraction = (conversationId: string, runId: string, type: "clarification" | "approval", expired = false): Interaction => {
    conversations.get(conversationId)!.activeRunId = runId;
    const interactionId = id("interaction");
    const common = { interactionId, conversationId, runId, version: 1 };
    if (type === "clarification") {
      const value: Interaction = { ...common, type, questionId: id("question"), status: "pending", prompt: "How detailed should the synthetic answer be?", options: [{ optionId: "concise", label: "Concise" }, { optionId: "detailed", label: "Detailed" }], allowFreeText: true, allowMultiple: false, required: true };
      emit(conversationId, "clarification.requested", value); emit(conversationId, "run.status", { runId, status: "suspended", suspendReason: "user_input" }); return value;
    }
    const value: Interaction = { ...common, type, approvalId: id("approval"), effectId: id("effect"), status: "pending", action: "Simulated document read", target: "Synthetic example document", preview: "No file, network or provider action will occur.", expiresAt: expired ? "2020-01-01T00:00:00Z" : "2099-01-01T00:00:00Z", requiredActorRole: "user", actionRef: id("bound-action") };
    emit(conversationId, "approval.requested", value); emit(conversationId, "run.status", { runId, status: "waiting_approval" }); return value;
  };
  const runGoalScenario = (conversationId: string, runId: string, outcome: "verified" | "unmet") => {
    const goalId = id("goal"), planId = id("plan"), artifactId = id("artifact"), reportId = id("report");
    emit(conversationId, "goal.updated", { conversationId, revision: 1, allowedActions: [], goalId, runId, status: outcome === "verified" ? "verified" : "unmet", objective: "Produce one synthetic demo artifact and verify it.", criteria: [{ criterionId: "criterion-1", description: outcome === "verified" ? "The synthetic artifact satisfies the demo criterion." : "A criterion whose evaluator is unavailable in the demo.", required: true }] });
    emit(conversationId, "plan.updated", { conversationId, revision: 2, allowedActions: [], planId, goalId, runId, goalRevision: 1, status: "completed", steps: [{ stepId: "step-1", summary: "Produce the synthetic demo artifact.", status: "completed", dependsOn: [] }] });
    emit(conversationId, "artifact.ready", { artifactId, conversationId, runId, version: 1, title: "Synthetic demo artifact", mediaType: "text/plain", contentRef: id("content"), allowedActions: ["view"], preview: "Demo artifact; no real file was produced." });
    emit(conversationId, "verification.completed", { conversationId, revision: 3, allowedActions: [], reportId, goalId, runId, goalRevision: 1, status: outcome === "verified" ? "verified" : "unmet", criterionResults: [{ criterionId: "criterion-1", satisfied: outcome === "verified" ? true : null, evidenceRefs: outcome === "verified" ? [artifactId] : [], safeReason: outcome === "verified" ? "Demo criterion satisfied by the synthetic artifact." : "No evaluator is available for this criterion in the demo." }], checkedAt: now, limitations: ["Demo only; criterion evaluation is synthetic."] });
    emit(conversationId, "run.status", { runId, status: outcome === "verified" ? "completed" : "failed" });
  };
  app.use("*", bodyLimit({ maxSize: 262144, onError: c => c.json(error("INVALID_INPUT", "Demo request exceeds its limit."), 413) }));
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store"); c.header("X-ASI-Demo", "true");
    if (c.req.path !== `${base}/me` && getCookie(c, "asi-demo") !== "demo-session") return c.json(error("UNAUTHENTICATED", "Demo session required."), 401);
    const origin = c.req.header("origin") ?? "";
    const allowedOrigin = origin === "http://127.0.0.1:3000" || origin === "http://localhost:3000" || /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.run\.app$/.test(origin);
    if (!["GET", "HEAD"].includes(c.req.method) && (c.req.header("x-csrf-token") !== "demo-csrf" || !allowedOrigin)) return c.json(error("POLICY_DENIED", "Demo mutation origin or CSRF check failed."), 403);
    await next();
  });
  app.onError(() => new Response(JSON.stringify(error("DEPENDENCY_UNAVAILABLE", "Demo request could not be processed.")), { status: 400, headers: { "content-type": "application/json", "X-ASI-Demo": "true" } }));
  app.notFound(c => c.json(error("INVALID_INPUT", "Demo resource unavailable."), 404));
  app.get(`${base}/me`, c => {
    const isHttps = c.req.header("x-forwarded-proto") === "https";
    setCookie(c, "asi-demo", "demo-session", isHttps ? { httpOnly: true, sameSite: "None", secure: true, partitioned: true, path: "/" } : { httpOnly: true, sameSite: "Strict", path: "/" });
    return c.json({ workspaceId: "demo-workspace", displayName: "Demo workspace", subjectId: "demo-user", allowedActions: ["chat", "demo_decisions"], demoMode: true, csrfToken: "demo-csrf", limits: { maxMessageBytes: 65536, maxAttachmentBytes: 65536, maxAttachmentCount: 3 } });
  });
  app.get(`${base}/conversations`, c => c.json({ items: [...conversations.values()].map(entry => entry.summary), nextCursor: null }));
  app.post(`${base}/conversations`, async c => { const input = await c.req.json<{ commandId: string }>(); if (typeof input.commandId !== "string" || !input.commandId || input.commandId.length > 128 || Object.keys(input).length !== 1) return c.json(error("INVALID_INPUT", "Command identity required."), 400); return c.json(once("create", input, () => ({ ...create() }))); });
  app.get(`${base}/conversations/:id/snapshot`, c => { const value = conversations.get(c.req.param("id")); return value ? c.json(ConversationSnapshotSchema.parse(value.snapshot)) : c.json(error("INVALID_INPUT", "Conversation unavailable."), 404); });
  app.get(`${base}/conversations/:id/events`, c => {
    const value = conversations.get(c.req.param("id")); if (!value) return c.json(error("INVALID_INPUT", "Conversation unavailable."), 404);
    const after = Number(c.req.query("after") ?? 0); if (!Number.isSafeInteger(after) || after < 0 || after > value.events.length) return c.json(error("INVALID_INPUT", "Replay cursor unavailable; refresh snapshot."), 409);
    let replay = value.events.filter(event => event.sequence > after);
    const scenario = c.req.query("scenario");
    if (scenario === "duplicate") replay = replay.flatMap(event => [event, event]);
    if (scenario === "gap") replay = replay.filter((_, index) => index !== 1);
    if (scenario === "late-other-chat") replay = replay.map(event => ({ ...event, conversationId: "synthetic-other-chat" }));
    if (scenario === "disconnected") replay = replay.slice(0, 1);
    return new Response(replay.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream", "cache-control": "no-store", "X-ASI-Demo": "true" } });
  });
  app.post(`${base}/conversations/:id/messages`, async c => {
    const conversationId = c.req.param("id"), entry = conversations.get(conversationId);
    const input = SendMessageInputSchema.parse(await c.req.json()); if (!entry) return c.json(error("INVALID_INPUT", "Conversation unavailable."), 404);
    return c.json(once(`send/${conversationId}`, input, () => {
      if (input.expectedConversationRevision !== entry.snapshot.revision) return conflict(input.commandId, entry.snapshot.revision);
      if (input.attachmentIds.length > 3 || input.attachmentIds.some(attachmentId => ![...uploads.values()].some(upload => upload.view.attachmentId === attachmentId && upload.view.status === "ready")) || new TextEncoder().encode(input.text).length > 65536) return rejected(input.commandId, entry.snapshot.revision, "Attachment is not authorized/ready or message is too large.");
      if (entry.snapshot.runStatus && !["completed", "failed", "cancelled", "budget_exhausted"].includes(entry.snapshot.runStatus)) return rejected(input.commandId, entry.snapshot.revision, "Finish or cancel the current synthetic run first.");
      if (entry.snapshot.messages.some(message => message.messageId === input.clientMessageId)) return conflict(input.commandId, entry.snapshot.revision);
      const runId = id("run");
      entry.activeRunId = runId;
      emit(conversationId, "message.created", { messageId: input.clientMessageId, role: "user", createdAt: now, parts: [{ type: "text", partId: id("part"), text: input.text }] });
      emit(conversationId, "run.status", { runId, status: "running" });
      if (input.text === "/protected") {
        protectedRuns.add(runId);
        const messageId = id("assistant"), partId = id("part");
        emit(conversationId, "message.created", { messageId, role: "assistant", createdAt: now, parts: [{ type: "text", partId, text: "" }] });
        ["Preparing the protected synthetic action. ", "No model or tool effect runs until you approve it."].forEach((text, deltaIndex) => emit(conversationId, "message.delta", { messageId, partId, deltaIndex, text }));
        emit(conversationId, "message.completed", { messageId });
        requestInteraction(conversationId, runId, "clarification");
      }
      else if (input.text === "/question") requestInteraction(conversationId, runId, "clarification");
      else if (["/approval", "/expired"].includes(input.text)) requestInteraction(conversationId, runId, "approval", input.text === "/expired");
      else if (input.text === "/goal") runGoalScenario(conversationId, runId, "verified");
      else if (input.text === "/unmet") runGoalScenario(conversationId, runId, "unmet");
      else if (["/error", "/unknown", "/budget"].includes(input.text)) {
        if (input.text !== "/budget") emit(conversationId, "tool.updated", { toolId: id("tool"), conversationId, runId, version: 1, status: input.text === "/unknown" ? "unknown" : "failed", summary: "Synthetic tool outcome; no real execution", allowedActions: [], evidenceRefs: [] });
        emit(conversationId, "error", error(input.text === "/budget" ? "BUDGET_EXCEEDED" : input.text === "/unknown" ? "UNKNOWN_OUTCOME" : "DEPENDENCY_UNAVAILABLE", "Synthetic failure scenario; no real action occurred.").error);
        emit(conversationId, "run.status", { runId, status: input.text === "/budget" ? "budget_exhausted" : "failed" });
      } else {
        const messageId = id("assistant"), partId = id("part");
        emit(conversationId, "message.created", { messageId, role: "assistant", createdAt: now, parts: [{ type: "text", partId, text: "" }] });
        ["This is a synthetic response. ", "The Gateway contract is connected; no model or tool was called."].forEach((text, deltaIndex) => emit(conversationId, "message.delta", { messageId, partId, deltaIndex, text }));
        emit(conversationId, "message.completed", { messageId }); emit(conversationId, "run.status", { runId, status: "completed" });
      }
      return applied(input.commandId, entry.snapshot.revision);
    }, entry.snapshot.revision));
  });
  const find = (key: string, type: Interaction["type"]) => [...conversations.values()].flatMap(entry => entry.snapshot.interactions).find(item => item.type === type && (item.type === "approval" ? item.approvalId : item.questionId) === key);
  app.post(`${base}/clarifications/:id/answers`, async c => {
    const input = ClarificationAnswerSchema.parse(await c.req.json()); const item = find(c.req.param("id"), "clarification");
    if (!item || item.type !== "clarification") return c.json(error("INVALID_INPUT", "Question unavailable."), 404);
    const entry = conversations.get(item.conversationId)!;
    return c.json(once(`answer/${item.questionId}`, input, () => {
      if (item.version !== input.expectedVersion || item.status !== "pending" || entry.activeRunId !== item.runId || entry.snapshot.runStatus !== "suspended") return conflict(input.commandId, entry.snapshot.revision);
      if (new Set(input.optionIds).size !== input.optionIds.length || input.optionIds.some(id => !item.options.some(option => option.optionId === id)) || (!item.allowMultiple && input.optionIds.length > 1) || (!item.allowFreeText && input.text)) return rejected(input.commandId, entry.snapshot.revision, "Answer does not match the question options.");
      emit(item.conversationId, "clarification.resolved", { ...item, version: item.version + 1, status: "answered" });
      if (protectedRuns.has(item.runId)) requestInteraction(item.conversationId, item.runId, "approval");
      else emit(item.conversationId, "run.status", { runId: item.runId, status: "completed" });
      return applied(input.commandId, entry.snapshot.revision);
    }, entry.snapshot.revision));
  });
  app.post(`${base}/approvals/:id/decisions`, async c => {
    const input = ApprovalDecisionInputSchema.parse(await c.req.json()); const item = find(c.req.param("id"), "approval");
    if (!item || item.type !== "approval") return c.json(error("INVALID_INPUT", "Approval unavailable."), 404);
    const entry = conversations.get(item.conversationId)!;
    return c.json(once(`decision/${item.approvalId}`, input, () => {
      if (item.version !== input.expectedVersion || item.status !== "pending" || entry.activeRunId !== item.runId || entry.snapshot.runStatus !== "waiting_approval") return conflict(input.commandId, entry.snapshot.revision);
      if (item.expiresAt <= now) { emit(item.conversationId, "approval.resolved", { ...item, version: item.version + 1, status: "expired" }); return rejected(input.commandId, entry.snapshot.revision, "Proposal expired."); }
      emit(item.conversationId, "approval.resolved", { ...item, version: item.version + 1, status: input.decision === "approve" ? "approved" : "rejected" });
      emit(item.conversationId, "run.status", { runId: item.runId, status: input.decision === "approve" ? "queued" : "cancelled" });
      if (input.decision === "approve") {
        const protectedFlow = protectedRuns.has(item.runId);
        const timer = setTimeout(() => {
          if (entry.activeRunId !== item.runId || entry.snapshot.runStatus !== "queued") return;
          emit(item.conversationId, "run.status", { runId: item.runId, status: "running" });
          if (protectedFlow) {
            const toolId = id("tool"), taskId = id("task"), artifactId = id("artifact"), reportId = id("report");
            emit(item.conversationId, "tool.updated", { toolId, conversationId: item.conversationId, runId: item.runId, version: 1, status: "executing", summary: "Synthetic protected tool action executing; no real effect", allowedActions: [], evidenceRefs: [] });
            emit(item.conversationId, "task.updated", { taskId, conversationId: item.conversationId, runId: item.runId, version: 1, status: "running", summary: "Applying the approved synthetic action", allowedActions: [], evidenceRefs: [] });
            emit(item.conversationId, "artifact.ready", { artifactId, conversationId: item.conversationId, runId: item.runId, version: 1, title: "Protected action receipt", mediaType: "text/plain", contentRef: id("content"), allowedActions: ["view"], preview: "Synthetic receipt; no real action occurred." });
            emit(item.conversationId, "tool.updated", { toolId, conversationId: item.conversationId, runId: item.runId, version: 2, status: "succeeded", summary: "Synthetic protected tool action succeeded; no real effect", allowedActions: [], evidenceRefs: [artifactId] });
            emit(item.conversationId, "verification.completed", { conversationId: item.conversationId, revision: 3, allowedActions: [], reportId, goalId: id("goal"), runId: item.runId, goalRevision: 1, status: "verified", criterionResults: [{ criterionId: "criterion-1", satisfied: true, evidenceRefs: [artifactId], safeReason: "Receipt verified against the synthetic artifact." }], checkedAt: now, limitations: ["Demo only; no real effect."] });
            emit(item.conversationId, "task.updated", { taskId, conversationId: item.conversationId, runId: item.runId, version: 2, status: "completed", summary: "Protected synthetic action completed after approval", allowedActions: [], evidenceRefs: [artifactId] });
          } else {
            emit(item.conversationId, "task.updated", { taskId: id("task"), conversationId: item.conversationId, runId: item.runId, version: 1, status: "completed", summary: "Synthetic result only; no document was accessed", allowedActions: [], evidenceRefs: [] });
          }
          emit(item.conversationId, "run.status", { runId: item.runId, status: "completed" });
        }, 500);
        timer.unref();
      }
      return applied(input.commandId, entry.snapshot.revision);
    }, entry.snapshot.revision));
  });
  app.post(`${base}/commands`, async c => {
    const input = UiMutationCommandSchema.parse(await c.req.json());
    if (input.type === "provider.connect") return c.json(rejected(input.commandId, 0, "Demo never accepts real provider credentials."));
    return c.json(once("management", input, () => { const conversation = create(); const item = requestInteraction(conversation.conversationId, id("run"), "approval"); return { commandId: input.commandId, status: "approval_required", revision: conversation.revision, conversationId: conversation.conversationId, interactionId: item.interactionId }; }));
  });
  app.patch(`${base}/conversations/:id`, async c => { const input = ConversationPatchSchema.parse(await c.req.json()); const entry = conversations.get(c.req.param("id")); if (!entry) return c.json(error("INVALID_INPUT", "Conversation unavailable."), 404); return c.json(once(`patch/${entry.summary.conversationId}`, input, () => { if (input.expectedRevision !== entry.summary.revision) return conflict(input.commandId, entry.summary.revision); if ("title" in input) entry.summary.title = input.title; else return rejected(input.commandId, entry.summary.revision, "Demo archival unavailable."); emit(entry.summary.conversationId, "conversation.updated", { ...entry.summary }); return applied(input.commandId, entry.snapshot.revision); })); });
  app.post(`${base}/runs/:id/cancel`, async c => {
    const input = await c.req.json<{ commandId: string }>();
    if (typeof input.commandId !== "string" || !input.commandId || input.commandId.length > 128 || Object.keys(input).length !== 1) return c.json(error("INVALID_INPUT", "Command identity required."), 400);
    const runId = c.req.param("id");
    const entry = [...conversations.values()].find(entry => entry.events.some(event => event.eventType === "run.status" && event.payload.runId === runId));
    if (!entry) return c.json(error("INVALID_INPUT", "Run unavailable."), 404);
    return c.json(once(`cancel/${runId}`, input, () => {
      if (entry.activeRunId !== runId || !entry.snapshot.runStatus || ["completed", "failed", "cancelled", "budget_exhausted"].includes(entry.snapshot.runStatus)) return conflict(input.commandId, entry.snapshot.revision);
      for (const item of entry.snapshot.interactions.filter(item => item.runId === runId && item.status === "pending")) {
        emit(entry.summary.conversationId, item.type === "approval" ? "approval.resolved" : "clarification.resolved", { ...item, version: item.version + 1, status: "cancelled" });
      }
      emit(entry.summary.conversationId, "run.status", { runId, status: "cancelled" });
      return applied(input.commandId, entry.snapshot.revision);
    }, entry.snapshot.revision));
  });
  for (const catalog of ["providers", "models", "skills", "connections"] as const) app.get(`${base}/${catalog}`, c => c.json({ items: [], revision: 0, availability: "unavailable", reason: "Real backend is not connected. This is an explicit demo." }));
  app.get(`${base}/memory`, c => c.json({ items: [], nextCursor: null }));
  app.get(`${base}/activity`, c => c.json({ items: [...conversations.values()].flatMap(entry => entry.snapshot.tasks), nextCursor: null }));
  app.get(`${base}/settings`, c => c.json({ revision: 0, allowedActions: [], availability: "unavailable", privacyMode: "unavailable", spendLimitMicroUsd: null, retentionDays: null, notifications: false, scheduleEnabled: false }));
  app.post(`${base}/uploads`, async c => {
    const input = UploadIntentSchema.parse(await c.req.json());
    return c.json(once("upload", input, () => {
      const uploadId = id("upload");
      const allowed = input.mimeType === "text/plain" && input.byteSize <= 65536 && uploads.size < 20;
      const view: UploadView = allowed ? { uploadId, status: "uploading" } : { uploadId, status: "rejected", reason: "Demo accepts only plain text up to 64 KiB; scanning is synthetic." };
      uploads.set(uploadId, { view, byteSize: input.byteSize, uploaded: false }); return { ...view };
    }));
  });
  app.get(`${base}/uploads/:id`, c => { const upload = uploads.get(c.req.param("id")); return upload ? c.json(upload.view) : c.json(error("INVALID_INPUT", "Upload unavailable."), 404); });
  app.put(`${base}/uploads/:id/content`, async c => {
    const upload = uploads.get(c.req.param("id")); if (!upload || upload.view.status !== "uploading") return c.json(error("POLICY_DENIED", "Upload unavailable."), 403);
    const bytes = await c.req.arrayBuffer();
    if (bytes.byteLength !== upload.byteSize || bytes.byteLength > 65536) { upload.view = { ...upload.view, status: "rejected", reason: "Upload size mismatch." }; return c.json(error("INVALID_INPUT", "Upload size mismatch."), 400); }
    // Deliberately discard bytes; this exercises UI quarantine states, not malware scanning or storage.
    upload.uploaded = true; upload.view = { ...upload.view, status: "scanning" }; return c.body(null, 204);
  });
  app.post(`${base}/uploads/:id/complete`, async c => {
    const input = await c.req.json<{ commandId: string }>(), upload = uploads.get(c.req.param("id"));
    if (!upload || typeof input.commandId !== "string" || !input.commandId) return c.json(error("INVALID_INPUT", "Upload unavailable."), 400);
    return c.json(once(`complete/${upload.view.uploadId}`, input, () => {
      if (!upload.uploaded || upload.view.status !== "scanning") return { ...upload.view };
      upload.view = { ...upload.view, status: "ready", attachmentId: id("attachment") }; return { ...upload.view };
    }));
  });
  return app;
}
