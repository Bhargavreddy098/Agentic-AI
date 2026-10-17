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

const goalCard = (page: Page) => page.locator('section[data-testid^="goal-"]');

test("a verified goal is shown as achieved with its success metrics", async ({ page }) => {
  const id = await startConversation(page);
  await composerSend(page, "/goal");

  const card = goalCard(page);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-status", "achieved");
  await expect(card).toContainText("Goal achieved");
  await expect(card.locator('[data-criterion-id="criterion-1"]')).toHaveAttribute("data-satisfied", "true");
  await expect(card).toContainText("Satisfied");

  await expect.poll(async () => (await snapshotOf(page, id)).runStatus).toBe("completed");
  const snapshot = await snapshotOf(page, id);
  expect(snapshot.goals?.[0]?.status).toBe("verified");
  expect(snapshot.goals?.[0]?.goalId).toBeTruthy();
  expect(snapshot.verifications?.[0]?.goalId).toBe(snapshot.goals?.[0]?.goalId);
});

test("an unmet goal never displays success", async ({ page }) => {
  await startConversation(page);
  await composerSend(page, "/unmet");

  const card = goalCard(page);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-status", "unmet");
  await expect(card).toContainText("Goal not met");
  await expect(card.locator('[data-criterion-id="criterion-1"]')).toHaveAttribute("data-satisfied", "unknown");
  await expect(card).not.toContainText("Goal achieved");
});
