import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, statSync } from "node:fs";

const OUT = "docs/evidence/ui/u20";
const CSRF = { origin: "http://127.0.0.1:3000", "x-csrf-token": "demo-csrf" };
const VIEWPORTS = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 900 },
] as const;
const THEMES = ["light", "dark"] as const;
const LONG_MESSAGE = [
  "## Synthetic release notes",
  "",
  "The Gateway contract is connected; no model or tool was called.",
  "",
  "```ts",
  "export function summarize(events: UiEvent[]): string {",
  "  return events.map(event => `${event.sequence}: ${event.eventType}`).join(\"\\n\");",
  "}",
  "```",
  "",
  "| Step | Status | Evidence |",
  "| --- | --- | --- |",
  "| Clarify | suspended | none yet |",
  "| Approve | waiting_approval | synthetic only |",
  "| Verify | completed | receipt-1 |",
].join("\n");

test.describe.configure({ mode: "serial" });

async function createConversation(page: Page): Promise<string> {
  const response = await page.request.post("/api/ui/v1/conversations", { headers: CSRF, data: { commandId: crypto.randomUUID() } });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { conversationId: string }).conversationId;
}

async function sendMessage(page: Page, conversationId: string, text: string): Promise<void> {
  const response = await page.request.post(`/api/ui/v1/conversations/${conversationId}/messages`, {
    headers: CSRF,
    data: { commandId: crypto.randomUUID(), clientMessageId: crypto.randomUUID(), expectedConversationRevision: 0, text, attachmentIds: [], requestedSkillIds: [] },
  });
  expect(response.ok()).toBe(true);
}

async function capture(page: Page, name: string): Promise<void> {
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  expect(statSync(file).size).toBeGreaterThan(1000);
}

test.beforeAll(() => { mkdirSync(OUT, { recursive: true }); });

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`visual matrix ${viewport.name} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.addInitScript(value => { try { window.localStorage.setItem("asi.ui.appearance", JSON.stringify({ theme: value, reducedMotion: false })); } catch { /* ignore */ } }, theme);

      await page.goto("/chat");
      await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
      await expect(page.getByRole("button", { name: "New conversation" })).toBeEnabled();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await capture(page, `${viewport.name}-${theme}-chat-empty`);

      await page.goto("/memory");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await capture(page, `${viewport.name}-${theme}-memory-empty`);

      const contentId = await createConversation(page);
      await page.goto(`/chat/${contentId}`);
      await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
      await sendMessage(page, contentId, LONG_MESSAGE);
      await expect(page.getByText("Synthetic release notes")).toBeVisible();
      await expect(page.getByRole("table")).toBeVisible();
      await capture(page, `${viewport.name}-${theme}-conversation-code-table`);

      const failureId = await createConversation(page);
      await page.goto(`/chat/${failureId}`);
      await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
      await sendMessage(page, failureId, "/unknown");
      await expect(page.getByText(/synthetic failure scenario/i).first()).toBeVisible();
      await capture(page, `${viewport.name}-${theme}-failure`);

      const pendingId = await createConversation(page);
      await page.goto(`/chat/${pendingId}`);
      await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
      await sendMessage(page, pendingId, "/protected");
      await expect(page.getByText(/protected synthetic action/i)).toBeVisible();
      await capture(page, `${viewport.name}-${theme}-streaming-pending`);
    });
  }
}
