import { test, expect } from "@playwright/test";
test("authenticated demo history and pending decisions open the owning Chat", async ({ page }) => {
  await page.goto("/chat");
  await expect(page.getByRole("button", { name: "New conversation" })).toBeEnabled();
  expect(await page.getByRole("button", { name: "New conversation" }).evaluate(element => Number.parseFloat(getComputedStyle(element).paddingLeft))).toBeGreaterThanOrEqual(16);
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page).toHaveURL(/\/chat\/conversation-/);
  await expect(page.getByText("Conversation state: connected.", { exact: false })).toBeVisible();
  const id = page.url().split("/").at(-1)!;
  const response = await page.request.post(`/api/ui/v1/conversations/${id}/messages`, { headers: { origin: "http://127.0.0.1:3000", "x-csrf-token": "demo-csrf" }, data: { commandId: "browser-approval", clientMessageId: "browser-message", expectedConversationRevision: 0, text: "/approval", attachmentIds: [], requestedSkillIds: [] } });
  expect(response.ok()).toBe(true);
  await expect(page.getByLabel(/\d+ pending decisions/)).toBeVisible();
  await page.getByRole("link", { name: "Models & Providers", exact: true }).click();
  await page.getByRole("link", { name: "Chat", exact: true }).click();
  await page.locator(`a[href="/chat/${id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/chat/${id}$`));
});
test("seven sections share one shell and desktop collapse retains accessible labels", async ({ page }) => {
  await page.goto("/chat");
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(navigation.getByRole("link")).toHaveCount(7);
  await expect(page.getByLabel("Conversation history")).toBeVisible();
  await page.getByRole("button", { name: "Collapse navigation" }).click();
  expect(await page.locator(".workspace-sidebar").evaluate(el => el.getBoundingClientRect().width)).toBe(64);
  await navigation.getByRole("link", { name: "Models & Providers" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Models & Providers");
  await expect(page.getByText("Backend integration pending")).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Models & Providers" })).toHaveAttribute("aria-current", "page");
});
test("mobile navigation supports Escape and restores focus without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/chat");
  const menu = page.getByRole("button", { name: "Toggle navigation" });
  await menu.click(); await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(menu).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
