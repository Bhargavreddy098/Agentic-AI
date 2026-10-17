import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => console.log("CONSOLE", m.type(), m.text()));
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("requestfailed", (r) => console.log("REQFAIL", r.method(), r.url(), r.failure()?.errorText));
page.on("response", async (r) => {
  if (r.url().includes("/api/ui/v1/")) {
    console.log("RESP", r.status(), r.request().method(), r.url());
    if (r.request().method() === "POST") {
      try { console.log("  REQBODY", (r.request().postData() ?? "").slice(0, 300)); } catch { /* Response diagnostics can be unavailable after navigation. */ }
      try { console.log("  RESPBODY", (await r.text()).slice(0, 300)); } catch { /* Response diagnostics can be unavailable after navigation. */ }
    }
  }
});
await page.goto("http://127.0.0.1:3000/chat");
await page.getByRole("button", { name: "New conversation" }).click();
await page.waitForTimeout(4000);
console.log("URL", page.url());
console.log("ALERTS", JSON.stringify(await page.locator("[role=alert]").allTextContents()));
console.log("BODY", (await page.locator("body").innerText()).slice(0, 500).replace(/\n+/g, " | "));
await browser.close();
