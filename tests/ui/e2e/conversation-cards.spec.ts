import { test, expect, type Page } from "@playwright/test";
import { ConversationSnapshotSchema, type ConversationSnapshot } from "@asi/contracts";

const BASE = "/api/ui/v1";

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

const log = (page: Page) => page.getByRole("log", { name: "Conversation" });
const decisions = (page: Page) => page.getByTestId("conversation-decisions");
const clarificationCard = (page: Page) => page.locator('section[data-testid^="clarification-"]');
const approvalCard = (page: Page) => page.locator('section[data-testid^="approval-"]');
const taskCard = (page: Page) => page.locator('section[data-testid^="task-"]');
const toolCard = (page: Page) => page.locator('section[data-testid^="tool-"]');
const artifactCard = (page: Page) => page.locator('section[data-testid^="artifact-"]');

test("a protected run is answered and approved through in-chat cards, then projects its effects", async ({ page }) => {
  const id = await startConversation(page);
  await composerSend(page, "/protected");

  await expect(log(page).locator('[data-role="assistant"]').last()).toContainText("No model or tool effect runs until you approve it.");

  const question = clarificationCard(page);
  await expect(question).toBeVisible();
  await expect(question.getByRole("button", { name: "Submit answer" })).toBeVisible();
  await question.getByRole("radio", { name: "Concise" }).check();
  await question.getByRole("button", { name: "Submit answer" }).click();
  await expect(question).toHaveAttribute("data-status", "answered");

  const approval = approvalCard(page);
  await expect(approval).toBeVisible();
  await expect(approval.getByText("Simulated document read")).toBeVisible();
  await approval.getByRole("button", { name: "Approve once" }).click();

  await waitForRunStatus(page, id, "completed");

  await expect(taskCard(page).first()).toBeVisible();
  await expect(toolCard(page).first()).toBeVisible();
  await expect(artifactCard(page).first()).toBeVisible();
  await expect(approval).toHaveAttribute("data-status", "approved");
  await expect(log(page).locator('[data-role="assistant"]')).toHaveCount(1);
});

test("deciding through the card rejects the proposal and cancels the run without projecting effects", async ({ page }) => {
  const id = await startConversation(page);
  await composerSend(page, "/protected");

  const question = clarificationCard(page);
  await expect(question).toBeVisible();
  await question.getByRole("radio", { name: "Detailed" }).check();
  await question.getByRole("button", { name: "Submit answer" }).click();

  const approval = approvalCard(page);
  await expect(approval).toBeVisible();
  await approval.getByRole("button", { name: "Reject" }).click();

  await waitForRunStatus(page, id, "cancelled");
  const snapshot = await snapshotOf(page, id);
  expect(snapshot.tasks).toEqual([]);
  expect(snapshot.artifacts).toEqual([]);
  expect(snapshot.tools).toEqual([]);
  await expect(taskCard(page)).toHaveCount(0);
  await expect(approval).toHaveAttribute("data-status", "rejected");
});

test("a standalone approval renders its card outside the transcript with no messages", async ({ page }) => {
  await startConversation(page);
  await composerSend(page, "/approval");

  const approval = approvalCard(page);
  await expect(approval).toBeVisible();
  await expect(log(page).locator('[data-role="assistant"]')).toHaveCount(0);
  await expect(log(page).locator('section[data-testid^="approval-"]')).toHaveCount(0);
  await expect(decisions(page).locator('section[data-testid^="approval-"]')).toHaveCount(1);
  await expect(approval.getByRole("button", { name: "Approve once" })).toBeVisible();
});

test("an expired proposal is rendered read-only with no decision controls", async ({ page }) => {
  await startConversation(page);
  await composerSend(page, "/expired");

  const approval = approvalCard(page);
  await expect(approval).toBeVisible();
  await expect(approval).toHaveAttribute("data-status", "expired");
  await expect(approval.getByText("This proposal expired and is read-only.")).toBeVisible();
  await expect(approval.getByRole("button", { name: "Approve once" })).toHaveCount(0);
  await expect(approval.getByRole("button", { name: "Reject" })).toHaveCount(0);
});

test("the second tab observes and can complete the same in-chat decision without duplicating effects", async ({ page, context }) => {
  const id = await startConversation(page);
  await composerSend(page, "/protected");
  const second = await context.newPage();
  await second.goto(`/chat/${encodeURIComponent(id)}`);

  const question = clarificationCard(second);
  await expect(question).toBeVisible();
  await question.getByRole("radio", { name: "Concise" }).check();
  await question.getByRole("button", { name: "Submit answer" }).click();

  const approval = approvalCard(second);
  await expect(approval).toBeVisible();
  await approval.getByRole("button", { name: "Approve once" }).click();

  await waitForRunStatus(page, id, "completed");
  const first = await snapshotOf(page, id);
  const other = await snapshotOf(second, id);
  expect(first.tasks.length).toBe(other.tasks.length);
  expect(first.artifacts.length).toBe(other.artifacts.length);
  expect(first.tools.length).toBe(other.tools.length);
  await expect(log(page).locator('[data-role="assistant"]')).toHaveCount(1);
  await expect(log(second).locator('[data-role="assistant"]')).toHaveCount(1);
});
