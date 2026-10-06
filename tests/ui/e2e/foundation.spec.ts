import { test, expect } from "@playwright/test";

test("qualified components render with common tokens and no enabled execution", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("A clear workspace.");
  await expect(page.getByLabel("Component qualification preview")).toContainText("Agent execution is not connected.");
  await expect(page.getByLabel("Preview composer")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Send unavailable" })).toBeDisabled();
  expect(await page.locator("body").evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(247, 249, 252)");
  expect(errors).toEqual([]);
});
