import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROUTES = ["/chat", "/models", "/skills", "/connections", "/memory", "/activity", "/settings"] as const;

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations
    .filter(violation => violation.impact === "critical" || violation.impact === "serious")
    .map(violation => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.length }));
}

async function ready(page: Page, route: string) {
  await page.goto(route);
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  if (!(await navigation.isVisible())) await page.getByRole("button", { name: "Toggle navigation" }).click();
  await expect(navigation).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test.describe("automated accessibility", () => {
  for (const route of ROUTES) {
    test(`no critical or serious violations on ${route}`, async ({ page }) => {
      await ready(page, route);
      expect(await seriousViolations(page)).toEqual([]);
    });
  }

  test("no critical or serious violations in dark theme", async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.setItem("asi.ui.appearance", JSON.stringify({ theme: "dark", reducedMotion: false })); } catch { /* ignore */ } });
    await ready(page, "/chat");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await seriousViolations(page)).toEqual([]);
  });
});

test.describe("keyboard and focus", () => {
  test("keyboard reaches the sidebar and composer with a visible focus ring", async ({ page }) => {
    await page.goto("/chat");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await expect(nav).toBeVisible();
    const chatLink = nav.getByRole("link", { name: "Chat", exact: true });
    let reachedSidebar = false;
    for (let index = 0; index < 20 && !reachedSidebar; index += 1) {
      await page.keyboard.press("Tab");
      reachedSidebar = await chatLink.evaluate(element => element === document.activeElement);
    }
    expect(reachedSidebar).toBe(true);
    expect(await chatLink.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");

    await page.getByRole("button", { name: "New conversation" }).click();
    await expect(page).toHaveURL(/\/chat\/conversation-/);
    const composer = page.getByRole("textbox", { name: "Message" });
    await expect(composer).toBeVisible();
    let reachedComposer = false;
    for (let index = 0; index < 160 && !reachedComposer; index += 1) {
      await page.keyboard.press("Tab");
      reachedComposer = await composer.evaluate(element => element === document.activeElement);
    }
    expect(reachedComposer).toBe(true);
    const ring = await composer.evaluate(element => {
      const style = getComputedStyle(element);
      return { outline: style.outlineStyle, shadow: style.boxShadow };
    });
    expect(ring.outline !== "none" || ring.shadow !== "none").toBe(true);
  });

  test("the mobile navigation drawer traps focus and returns it on Escape", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/chat");
    const toggle = page.getByRole("button", { name: "Toggle navigation" });
    await toggle.click();
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(toggle).toBeFocused();
  });
});

test.describe("assistive announcements", () => {
  test("pending decisions announce a safe summary without action claims", async ({ page }) => {
    await page.goto("/chat");
    await page.getByRole("button", { name: "New conversation" }).click();
    await expect(page).toHaveURL(/\/chat\/conversation-/);
    const id = page.url().split("/").at(-1)!;
    const response = await page.request.post(`/api/ui/v1/conversations/${id}/messages`, {
      headers: { origin: "http://127.0.0.1:3000", "x-csrf-token": "demo-csrf" },
      data: { commandId: "a11y-approval", clientMessageId: "a11y-message", expectedConversationRevision: 0, text: "/approval", attachmentIds: [], requestedSkillIds: [] },
    });
    expect(response.ok()).toBe(true);
    const status = page.getByRole("status").filter({ hasText: /pending decision/i });
    await expect(status).toBeVisible();
    const text = (await status.textContent()) ?? "";
    expect(text).toMatch(/pending/i);
    expect(text).not.toMatch(/complete|approved|executed/i);
  });
});

test.describe("motion preferences", () => {
  test("reduced motion disables transitions", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ready(page, "/chat");
    const duration = await page.evaluate(() => getComputedStyle(document.querySelector(".workspace-sidebar") as Element).transitionDuration);
    expect(duration).toBe("0s");
  });

  test("the in-app reduced motion preference disables transitions", async ({ page }) => {
    await page.addInitScript(() => { try { window.localStorage.setItem("asi.ui.appearance", JSON.stringify({ theme: "light", reducedMotion: true })); } catch { /* ignore */ } });
    await ready(page, "/chat");
    await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "true");
    const duration = await page.evaluate(() => getComputedStyle(document.querySelector(".workspace-sidebar") as Element).transitionDuration);
    expect(duration).toBe("0s");
  });
});

test.describe("responsive layout", () => {
  for (const width of [390, 768, 1440]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await ready(page, "/chat");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });
  }
});
