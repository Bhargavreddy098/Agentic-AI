// @vitest-environment node
import { beforeAll, afterAll, expect, it } from "vitest";
import { serve } from "@hono/node-server";
import { createDemoGateway } from "@asi/gateway-fixture/scenarios.js";
import { WorkspaceSessionSchema, UiEventSchema } from "../../../packages/contracts/src/ui/index.js";
import { HttpGatewayClient } from "@asi/web/lib/gateway/http-client.js";
import { runGatewayContractTests } from "./harness.js";
import { ChatStore } from "@asi/web/lib/chat/store.js";

let base = "";
let server: ReturnType<typeof serve>;
const api = async (path: string, body?: unknown) => {
  const response = await fetch(`${base}/api/ui/v1${path}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", "x-csrf-token": "demo-csrf", cookie: "asi-demo=demo-session", origin: "http://127.0.0.1:3000" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { response, body: await response.json() as Record<string, unknown> };
};
beforeAll(async () => {
  server = serve({ fetch: createDemoGateway().fetch, hostname: "127.0.0.1", port: 0 });
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server missing port");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
runGatewayContractTests(async () => { const client = new HttpGatewayClient("demo", base); await client.getMe(); return client; });

it("returns synthetic authenticated identity without accepting caller tenancy", async () => {
  const result = await api("/me");
  expect(WorkspaceSessionSchema.safeParse(result.body).success).toBe(true);
  expect(result.body.demoMode).toBe(true);
});
it("makes duplicate ingress idempotent and replays ordered SSE events", async () => {
  const created = await api("/conversations", { commandId: "create-ordinary" });
  const id = created.body.conversationId as string;
  const input = { commandId: "send-once", clientMessageId: "message-once", expectedConversationRevision: 0, text: "hello", attachmentIds: [], requestedSkillIds: [] };
  const first = await api(`/conversations/${id}/messages`, input);
  const second = await api(`/conversations/${id}/messages`, input);
  expect(first.response.status).toBe(200);
  expect(second.body).toEqual(first.body);
  const snapshot = await api(`/conversations/${id}/snapshot`);
  expect((snapshot.body.messages as unknown[]).length).toBe(2);
  const stream = await fetch(`${base}/api/ui/v1/conversations/${id}/events?after=0`, { headers: { cookie: "asi-demo=demo-session" } });
  const events = (await stream.text()).split("\n\n").flatMap(block => block.startsWith("data: ") ? [UiEventSchema.parse(JSON.parse(block.slice(6)))] : []);
  expect(events.length).toBeGreaterThan(2);
  expect(events.map(event => event.sequence)).toEqual(events.map((_, index) => index + 1));
  const assistant = events.find(event => event.eventType === "message.created" && event.payload.role === "assistant");
  expect(assistant?.payload).toMatchObject({ parts: [{ text: "" }] });
});
it("keeps clarification answers separate from approval records", async () => {
  const created = await api("/conversations", { commandId: "create-question" });
  const id = created.body.conversationId as string;
  await api(`/conversations/${id}/messages`, { commandId: "send-question", clientMessageId: "question-message", expectedConversationRevision: 0, text: "/question", attachmentIds: [], requestedSkillIds: [] });
  const snapshot = await api(`/conversations/${id}/snapshot`);
  const question = (snapshot.body.interactions as { questionId: string }[])[0];
  const answer = await api(`/clarifications/${question?.questionId}/answers`, { commandId: "answer-1", expectedVersion: 1, optionIds: ["concise"] });
  expect(answer.body.status).toBe("applied");
  const updated = await api(`/conversations/${id}/snapshot`);
  expect(updated.body.interactions).toMatchObject([{ type: "clarification", status: "answered" }]);
});
it("rejects stale proposal versions and never treats approval as completed execution", async () => {
  const created = await api("/conversations", { commandId: "create-approval" });
  const id = created.body.conversationId as string;
  await api(`/conversations/${id}/messages`, { commandId: "send-approval", clientMessageId: "approval-message", expectedConversationRevision: 0, text: "/approval", attachmentIds: [], requestedSkillIds: [] });
  const snapshot = await api(`/conversations/${id}/snapshot`);
  const proposal = (snapshot.body.interactions as { approvalId: string }[])[0];
  const stale = await api(`/approvals/${proposal?.approvalId}/decisions`, { commandId: "stale", expectedVersion: 99, decision: "approve" });
  expect(stale.body.status).toBe("conflict");
  const decision = await api(`/approvals/${proposal?.approvalId}/decisions`, { commandId: "approve", expectedVersion: 1, decision: "approve" });
  expect(decision.body).toMatchObject({ status: "applied" });
  expect(decision.body).not.toHaveProperty("executionCompleted");
  expect((await api(`/conversations/${id}/snapshot`)).body.runStatus).toBe("queued");
});
it("rejects unsafe mutation origins and missing demo identity", async () => {
  const denied = await fetch(`${base}/api/ui/v1/conversations`, { method: "POST", headers: { "content-type": "application/json", cookie: "asi-demo=demo-session", origin: "https://untrusted.invalid", "x-csrf-token": "demo-csrf" }, body: JSON.stringify({ commandId: "bad-origin" }) });
  expect(denied.status).toBe(403);
  const unauthenticated = await fetch(`${base}/api/ui/v1/conversations`);
  expect(unauthenticated.status).toBe(401);
});
it("simulates quarantine without retaining uploaded bytes or accepting unready attachment IDs", async () => {
  const client = new HttpGatewayClient("demo", base); await client.getMe();
  const upload = await client.beginUpload({ commandId: "upload-once", fileName: "demo.txt", mimeType: "text/plain", byteSize: 4 });
  expect(upload.status).toBe("uploading");
  await client.uploadContent(upload.uploadId, new File(["demo"], "demo.txt", { type: "text/plain" }), new AbortController().signal);
  expect(await client.completeUpload(upload.uploadId, "complete-once")).toMatchObject({ status: "ready", attachmentId: expect.any(String) });
  const rejected = await client.beginUpload({ commandId: "upload-invalid", fileName: "script.js", mimeType: "application/javascript", byteSize: 4 });
  expect(rejected.status).toBe("rejected");
});

it("invalidates pending decisions on cancellation and fences historical run cancellation", async () => {
  const client = new HttpGatewayClient("demo", base); await client.getMe();
  const conversation = await client.createConversation("cancel-fencing-create");
  await client.sendMessage(conversation.conversationId, { commandId: "cancel-fencing-send", clientMessageId: "cancel-fencing-message", expectedConversationRevision: 0, text: "/approval", attachmentIds: [], requestedSkillIds: [] });
  const first = await client.getSnapshot(conversation.conversationId);
  const proposal = first.interactions[0]!;
  if (proposal.type !== "approval") throw new Error("approval expected");
  await client.cancelRun(proposal.runId, "cancel-fencing-cancel");
  expect((await client.getSnapshot(conversation.conversationId)).interactions[0]?.status).toBe("cancelled");
  expect((await client.decideApproval(proposal.approvalId, { commandId: "cancel-fencing-decide", expectedVersion: 1, decision: "approve" })).status).toBe("conflict");
  const cancelled = await client.getSnapshot(conversation.conversationId);
  await client.sendMessage(conversation.conversationId, { commandId: "cancel-fencing-new", clientMessageId: "cancel-fencing-new-message", expectedConversationRevision: cancelled.revision, text: "/question", attachmentIds: [], requestedSkillIds: [] });
  expect((await client.cancelRun(proposal.runId, "cancel-historical")).status).toBe("conflict");
  expect((await client.getSnapshot(conversation.conversationId)).runStatus).toBe("suspended");
});

it("prevents an old approval timer from completing a newer queued run", async () => {
  const client = new HttpGatewayClient("demo", base); await client.getMe();
  const conversation = await client.createConversation("timer-fencing-create");
  const send = async (suffix: string) => {
    const snapshot = await client.getSnapshot(conversation.conversationId);
    await client.sendMessage(conversation.conversationId, { commandId: `timer-send-${suffix}`, clientMessageId: `timer-message-${suffix}`, expectedConversationRevision: snapshot.revision, text: "/approval", attachmentIds: [], requestedSkillIds: [] });
    const proposal = (await client.getSnapshot(conversation.conversationId)).interactions.at(-1)!;
    if (proposal.type !== "approval") throw new Error("approval expected");
    await client.decideApproval(proposal.approvalId, { commandId: `timer-decide-${suffix}`, expectedVersion: 1, decision: "approve" });
    return proposal;
  };
  const first = await send("old");
  await client.cancelRun(first.runId, "timer-cancel-old");
  const second = await send("new");
  await new Promise(resolve => setTimeout(resolve, 650));
  const snapshot = await client.getSnapshot(conversation.conversationId);
  expect(snapshot.tasks.map(task => task.runId)).toEqual([second.runId]);
  expect(snapshot.runStatus).toBe("completed");
});

it("exposes deterministic failure, expiry and replay-disruption scenarios over HTTP", async () => {
  const client = new HttpGatewayClient("demo", base); await client.getMe();
  for (const [text, status] of [["/error", "failed"], ["/unknown", "failed"], ["/budget", "budget_exhausted"]] as const) {
    const conversation = await client.createConversation(`scenario-create-${text}`);
    await client.sendMessage(conversation.conversationId, { commandId: `scenario-send-${text}`, clientMessageId: `scenario-message-${text}`, expectedConversationRevision: 0, text, attachmentIds: [], requestedSkillIds: [] });
    const snapshot = await client.getSnapshot(conversation.conversationId);
    expect(snapshot.runStatus).toBe(status);
    if (text === "/unknown") expect(snapshot.tools[0]?.status).toBe("unknown");
  }
  const conversation = await client.createConversation("expired-create");
  await client.sendMessage(conversation.conversationId, { commandId: "expired-send", clientMessageId: "expired-message", expectedConversationRevision: 0, text: "/expired", attachmentIds: [], requestedSkillIds: [] });
  const proposal = (await client.getSnapshot(conversation.conversationId)).interactions[0]!;
  if (proposal.type !== "approval") throw new Error("approval expected");
  expect((await client.decideApproval(proposal.approvalId, { commandId: "expired-decision", expectedVersion: 1, decision: "approve" })).status).toBe("rejected");
  const replay = async (scenario: string) => {
    const response = await fetch(`${base}/api/ui/v1/conversations/${conversation.conversationId}/events?after=0&scenario=${scenario}`, { headers: { cookie: "asi-demo=demo-session" } });
    return (await response.text()).split("\n\n").filter(Boolean).map(frame => JSON.parse(frame.slice(6)) as { sequence: number; conversationId: string });
  };
  const duplicate = await replay("duplicate");
  expect(duplicate[0]).toEqual(duplicate[1]);
  expect((await replay("gap")).map(event => event.sequence)).not.toContain(2);
  expect((await replay("late-other-chat"))[0]?.conversationId).toBe("synthetic-other-chat");
  expect(await replay("disconnected")).toHaveLength(1);
  const management = await client.submitCommand({ type: "skill.enable", commandId: "management-demo", expectedRevision: 0, skillId: "synthetic-skill" });
  expect(management.status).toBe("approval_required");
});

it("reconstructs identical canonical messages and decisions after reload plus replay", async () => {
  const client = new HttpGatewayClient("demo", base); await client.getMe();
  const conversation = await client.createConversation("store-reload-create");
  await client.sendMessage(conversation.conversationId, { commandId: "store-reload-send", clientMessageId: "store-reload-message", expectedConversationRevision: 0, text: "/approval", attachmentIds: [], requestedSkillIds: [] });
  const first = new ChatStore(client), reloaded = new ChatStore(client);
  try {
    await first.open(conversation.conversationId);
    const proposal = first.getSnapshot().conversation!.snapshot.interactions[0]!;
    if (proposal.type !== "approval") throw new Error("approval expected");
    await client.decideApproval(proposal.approvalId, { commandId: "store-reload-decision", expectedVersion: 1, decision: "reject" });
    await expect.poll(() => first.getSnapshot().conversation?.snapshot.runStatus, { timeout: 2500 }).toBe("cancelled");
    await reloaded.open(conversation.conversationId);
    expect(reloaded.getSnapshot().conversation?.snapshot).toEqual(first.getSnapshot().conversation?.snapshot);
  } finally { first.clear(); reloaded.clear(); }
});
