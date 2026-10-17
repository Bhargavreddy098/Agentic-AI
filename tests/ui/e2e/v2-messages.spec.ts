import { test, expect } from "@playwright/test";

test("canonical chat renders streamed assistant output in an accessible live log", async ({ page }) => {
  await page.goto("/chat"); await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page).toHaveURL(/\/chat\/conversation-/);
  const id = page.url().split("/").at(-1)!;
  const input = page.getByRole("textbox", { name: "Message" });
  await input.fill("hello"); await input.press("Enter");
  await expect.poll(async () => (await (await page.request.get(`/api/ui/v1/conversations/${id}/snapshot`)).json()).runStatus).toBe("completed");
  const log = page.getByRole("log", { name: "Conversation" });
  await expect(log).toHaveAttribute("aria-live", "polite");
  const user = log.locator('[data-role="user"]').last();
  await expect(user).toContainText("hello");
  await expect(user.locator(".message-meta")).toContainText("You");
  const assistant = log.locator('[data-role="assistant"]').last();
  await expect(assistant).toContainText("This is a synthetic response.");
  await expect(assistant.locator(".message-meta")).toContainText("Assistant");
  await expect(page.getByRole("button", { name: /follow/i })).toBeVisible();
});

test("message markdown stays inert: links are safe and no markup is injected", async ({ page }) => {
  await page.goto("/chat"); await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page).toHaveURL(/\/chat\/conversation-/);
  const id = page.url().split("/").at(-1)!;
  const input = page.getByRole("textbox", { name: "Message" });
  await input.fill('<script>window.__asiXss=1</script> see [Docs](https://example.com)');
  await input.press("Enter");
  await expect.poll(async () => (await (await page.request.get(`/api/ui/v1/conversations/${id}/snapshot`)).json()).runStatus).toBe("completed");
  const log = page.getByRole("log", { name: "Conversation" });
  const user = log.locator('[data-role="user"]').last();
  await expect(user).toContainText("<script>window.__asiXss=1</script>");
  const link = user.getByRole("link", { name: "Docs" });
  await expect(link).toHaveAttribute("href", "https://example.com/");
  await expect(link).toHaveAttribute("rel", /noopener/);
  expect(await page.evaluate(() => (window as unknown as { __asiXss?: number }).__asiXss ?? null)).toBeNull();
  expect(await log.locator("script").count()).toBe(0);
});
