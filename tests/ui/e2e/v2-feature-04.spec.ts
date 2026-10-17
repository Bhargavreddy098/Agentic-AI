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

const verificationCard = (page: Page) => page.locator('section[data-testid^="verification-"]');

test("a verified goal projects criterion results, evidence and limitations into Chat", async ({ page }) => {
  const id = await startConversation(page);
  await composerSend(page, "/goal");

  const card = verificationCard(page);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-status", "verified");
  await expect(card.locator('[data-criterion-id="criterion-1"]')).toHaveAttribute("data-satisfied", "true");
  await expect(card).toContainText("Satisfied");
  await expect(card).toContainText("Demo only; criterion evaluation is synthetic.");

  await expect.poll(async () => (await snapshotOf(page, id)).runStatus).toBe("completed");
  const snapshot = await snapshotOf(page, id);
  expect(snapshot.verifications?.[0]?.status).toBe("verified");
  expect(snapshot.verifications?.[0]?.reportId).toBeTruthy();
});

test("an unmet goal is shown as not satisfied and never claims goal achieved", async ({ page }) => {
  await startConversation(page);
  await composerSend(page, "/unmet");

  const card = verificationCard(page);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-status", "unmet");
  await expect(card.locator('[data-criterion-id="criterion-1"]')).toHaveAttribute("data-satisfied", "unknown");
  await expect(card).toContainText("Not determined");
  await expect(card).not.toContainText("goal achieved");
  await expect(card).not.toContainText("Satisfied by");
});
