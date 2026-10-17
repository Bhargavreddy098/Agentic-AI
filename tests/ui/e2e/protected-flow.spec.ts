import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ConversationSnapshotSchema, type ConversationSnapshot, type Interaction } from "@asi/contracts";

const BASE = "/api/ui/v1";
const MUTATION_HEADERS = { origin: "http://127.0.0.1:3000", "x-csrf-token": "demo-csrf" };

async function startConversation(page: Page): Promise<string> {
  await page.goto("/chat");
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page).toHaveURL(/\/chat\/conversation-/);
  return page.url().split("/").at(-1)!;
}

async function snapshotOf(page: Page, id: string): Promise<ConversationSnapshot> {
  const response = await page.request.get(`${BASE}/conversations/${encodeURIComponent(id)}/snapshot`);
  expect(response.ok()).toBe(true);
  return ConversationSnapshotSchema.parse(await response.json());
}

async function composerSend(page: Page, text: string): Promise<void> {
  const input = page.getByRole("textbox", { name: "Message" });
  await input.fill(text);
  await input.press("Enter");
}

async function waitForRunStatus(page: Page, id: string, status: string): Promise<void> {
  await expect.poll(async () => (await snapshotOf(page, id)).runStatus).toBe(status);
}

async function pendingInteraction(page: Page, id: string, type: Interaction["type"]): Promise<Interaction> {
  let found: Interaction | undefined;
  await expect.poll(async () => {
    const snapshot = await snapshotOf(page, id);
    found = snapshot.interactions.find(item => item.type === type && item.status === "pending");
    return Boolean(found);
  }).toBe(true);
  if (!found) throw new Error(`No pending ${type} interaction was projected`);
  return found;
}

async function answerQuestion(page: Page, question: Interaction) {
  if (question.type !== "clarification") throw new Error("Expected a clarification interaction");
  return page.request.post(`${BASE}/clarifications/${encodeURIComponent(question.questionId)}/answers`, {
    headers: MUTATION_HEADERS,
    data: { commandId: randomUUID(), expectedVersion: question.version, optionIds: ["concise"] },
  });
}

async function decideApproval(page: Page, approval: Interaction, decision: "approve" | "reject", expectedVersion?: number) {
  if (approval.type !== "approval") throw new Error("Expected an approval interaction");
  return page.request.post(`${BASE}/approvals/${encodeURIComponent(approval.approvalId)}/decisions`, {
    headers: MUTATION_HEADERS,
    data: { commandId: randomUUID(), expectedVersion: expectedVersion ?? approval.version, decision },
  });
}

test("protected flow: streamed answer, question, approval, then separately observed execution and receipt", async ({ page }) => {
  const id = await startConversation(page);
  await composerSend(page, "/protected");

  const log = page.getByRole("log", { name: "Conversation" });
  await expect(log.locator('[data-role="assistant"]').last()).toContainText("No model or tool effect runs until you approve it.");

  await waitForRunStatus(page, id, "suspended");
  const suspended = await snapshotOf(page, id);
  expect(suspended.tools).toEqual([]);
  expect(suspended.tasks).toEqual([]);
  expect(suspended.artifacts).toEqual([]);
  const question = await pendingInteraction(page, id, "clarification");

  const answered = await answerQuestion(page, question);
  expect((await answered.json()).status).toBe("applied");

  await waitForRunStatus(page, id, "waiting_approval");
  const waiting = await snapshotOf(page, id);
  expect(waiting.tasks).toEqual([]);
  expect(waiting.artifacts).toEqual([]);
  expect(waiting.tools).toEqual([]);
  const approval = await pendingInteraction(page, id, "approval");

  const decided = await decideApproval(page, approval, "approve");
  const decidedBody = await decided.json();
  expect(decidedBody.status).toBe("applied");

  const immediately = await snapshotOf(page, id);
  expect(immediately.runStatus).not.toBe("completed");

  await waitForRunStatus(page, id, "completed");
  const done = await snapshotOf(page, id);
  const task = done.tasks.find(item => item.runId === approval.runId && item.status === "completed");
  expect(task).toBeTruthy();
  expect(task!.evidenceRefs.length).toBeGreaterThan(0);
  const artifact = done.artifacts.find(item => item.runId === approval.runId);
  expect(artifact).toBeTruthy();
  expect(artifact!.mediaType).toBe("text/plain");
  expect(done.verifications?.some(item => item.runId === approval.runId && item.status === "verified")).toBe(true);
  expect(done.tools.some(item => item.runId === approval.runId && item.status === "succeeded")).toBe(true);
  await expect(log.locator('[data-role="assistant"]')).toHaveCount(1);

  const stable = { messages: done.messages.length, tasks: done.tasks.length, artifacts: done.artifacts.length, tools: done.tools.length };
  await page.reload();
  await expect.poll(async () => (await snapshotOf(page, id)).messages.length).toBe(stable.messages);
  const reconnected = await snapshotOf(page, id);
  expect(reconnected.tasks.length).toBe(stable.tasks);
  expect(reconnected.artifacts.length).toBe(stable.artifacts);
  expect(reconnected.tools.length).toBe(stable.tools);
  await expect(page.getByRole("log", { name: "Conversation" }).locator('[data-role="assistant"]')).toHaveCount(1);
});

test("rejecting the proposal cancels the run with no execution, artifact or receipt", async ({ page }) => {
  const id = await startConversation(page);
  await composerSend(page, "/protected");
  await waitForRunStatus(page, id, "suspended");
  const question = await pendingInteraction(page, id, "clarification");
  expect((await (await answerQuestion(page, question)).json()).status).toBe("applied");
  await waitForRunStatus(page, id, "waiting_approval");
  const approval = await pendingInteraction(page, id, "approval");

  const decided = await decideApproval(page, approval, "reject");
  expect((await decided.json()).status).toBe("applied");
  await waitForRunStatus(page, id, "cancelled");
  const done = await snapshotOf(page, id);
  expect(done.tasks).toEqual([]);
  expect(done.artifacts).toEqual([]);
  expect(done.tools).toEqual([]);
});

test("an expired proposal is refused read-only and never executes", async ({ page }) => {
  const id = await startConversation(page);
  await composerSend(page, "/expired");
  await waitForRunStatus(page, id, "waiting_approval");
  const approval = await pendingInteraction(page, id, "approval");

  const decided = await decideApproval(page, approval, "approve");
  expect((await decided.json()).status).toBe("rejected");
  const done = await snapshotOf(page, id);
  expect(done.runStatus).toBe("waiting_approval");
  expect(done.tasks).toEqual([]);
  expect(done.artifacts).toEqual([]);
  expect(done.interactions.some(item => item.type === "approval" && item.status === "expired")).toBe(true);
});

test("cancelling a suspended protected run executes nothing", async ({ page }) => {
  const id = await startConversation(page);
  await composerSend(page, "/protected");
  await waitForRunStatus(page, id, "suspended");
  const suspended = await snapshotOf(page, id);
  const runId = suspended.activeRunId;
  expect(runId).toBeTruthy();

  const cancelled = await page.request.post(`${BASE}/runs/${encodeURIComponent(runId!)}/cancel`, {
    headers: MUTATION_HEADERS,
    data: { commandId: randomUUID() },
  });
  expect((await cancelled.json()).status).toBe("applied");
  await waitForRunStatus(page, id, "cancelled");
  const done = await snapshotOf(page, id);
  expect(done.tasks).toEqual([]);
  expect(done.artifacts).toEqual([]);
  expect(done.interactions.some(item => item.type === "clarification" && item.status === "cancelled")).toBe(true);
});

test("a stale proposal decision is refused as a conflict with no effect", async ({ page }) => {
  const id = await startConversation(page);
  await composerSend(page, "/protected");
  await waitForRunStatus(page, id, "suspended");
  const question = await pendingInteraction(page, id, "clarification");
  expect((await (await answerQuestion(page, question)).json()).status).toBe("applied");
  await waitForRunStatus(page, id, "waiting_approval");
  const approval = await pendingInteraction(page, id, "approval");

  const decided = await decideApproval(page, approval, "approve", approval.version + 1);
  expect((await decided.json()).status).toBe("conflict");
  const done = await snapshotOf(page, id);
  expect(done.runStatus).toBe("waiting_approval");
  expect(done.tasks).toEqual([]);
  expect(done.artifacts).toEqual([]);
});

test("an unknown tool outcome stays unresolved and never reports completion", async ({ page }) => {
  const id = await startConversation(page);
  await composerSend(page, "/unknown");
  await waitForRunStatus(page, id, "failed");
  const done = await snapshotOf(page, id);
  expect(done.tools.some(item => item.status === "unknown")).toBe(true);
  expect(done.artifacts).toEqual([]);
  await expect(page.getByText("Synthetic failure scenario", { exact: false })).toBeVisible();
});

test("a revoked browser session is denied without leaking execution", async ({ page }) => {
  const id = await startConversation(page);
  await page.context().clearCookies();
  const denied = await page.request.get(`${BASE}/conversations/${encodeURIComponent(id)}/snapshot`);
  expect(denied.status()).toBe(401);
});

test("a second tab observes the same run without duplicating effects", async ({ page, context }) => {
  const id = await startConversation(page);
  await composerSend(page, "/protected");
  const second = await context.newPage();
  await second.goto(`/chat/${encodeURIComponent(id)}`);

  await waitForRunStatus(page, id, "suspended");
  const question = await pendingInteraction(page, id, "clarification");
  expect((await (await answerQuestion(page, question)).json()).status).toBe("applied");
  await waitForRunStatus(page, id, "waiting_approval");
  const approval = await pendingInteraction(page, id, "approval");
  expect((await (await decideApproval(page, approval, "approve")).json()).status).toBe("applied");
  await waitForRunStatus(page, id, "completed");

  const first = await snapshotOf(page, id);
  const other = await snapshotOf(second, id);
  expect(first.messages.length).toBe(other.messages.length);
  expect(first.tasks.length).toBe(other.tasks.length);
  expect(first.artifacts.length).toBe(other.artifacts.length);
  await expect(page.getByRole("log", { name: "Conversation" }).locator('[data-role="assistant"]')).toHaveCount(1);
  await expect(second.getByRole("log", { name: "Conversation" }).locator('[data-role="assistant"]')).toHaveCount(1);
});
