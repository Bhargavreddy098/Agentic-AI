import { test, expect } from "@playwright/test";
test("demo composer submits, survives navigation, restores Stop after reload and uploads through the public transport", async ({ page }) => {
  await page.goto("/chat"); await expect(page.getByRole("button", { name: "New conversation" })).toBeEnabled();
  await page.getByRole("button", { name: "New conversation" }).click(); await expect(page).toHaveURL(/\/chat\/conversation-/);
  const id = page.url().split("/").at(-1)!;
  const input = page.getByRole("textbox", { name: "Message" });
  await input.fill("hello"); await input.press("Enter"); await expect(input).toHaveValue("");
  await expect.poll(async () => (await (await page.request.get(`/api/ui/v1/conversations/${id}/snapshot`)).json()).runStatus).toBe("completed");
  await input.fill("/approval"); await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled(); await input.press("Enter"); await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await page.reload(); await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await input.fill("preserved draft"); await page.getByRole("link", { name: "Models & Providers", exact: true }).click();
  await page.getByRole("link", { name: "Chat", exact: true }).click(); await page.locator(`a[href="/chat/${id}"]`).click();
  await expect(input).toHaveValue("preserved draft");
  await page.getByRole("button", { name: "Stop" }).click(); await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0);
  await page.getByLabel("Attach files").setInputFiles({ name: "demo.txt", mimeType: "text/plain", buffer: Buffer.from("demo") });
  await expect(page.getByText("demo.txt · ready")).toBeVisible();
  await page.getByRole("button", { name: "Send", exact: true }).click(); await expect(input).toHaveValue("");
});
