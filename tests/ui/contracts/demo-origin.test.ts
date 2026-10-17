import { describe, it, expect } from "vitest";
import { createDemoGateway } from "@asi/gateway-fixture/scenarios.js";

const preview = "https://owned-preview.example";
const mutate = (app: ReturnType<typeof createDemoGateway>, origin: string, extra: Record<string, string> = {}) => app.request("http://localhost/api/ui/v1/conversations", { method: "POST", headers: { origin, cookie: "asi-demo=demo-session", "x-csrf-token": "demo-csrf", "content-type": "application/json", ...extra }, body: JSON.stringify({ commandId: "create" }) });
describe("demo origin trust", () => {
  it("rejects arbitrary run.app deployments", async () => {
    expect((await mutate(createDemoGateway(), "https://host.attacker.run.app")).status).toBe(403);
  });
  it("accepts only explicitly configured preview origins while retaining authentication and CSRF", async () => {
    const app = createDemoGateway({ previewOrigins: [preview] });
    expect((await mutate(app, preview)).status).toBe(200);
    expect((await mutate(app, "https://other.example")).status).toBe(403);
    expect((await mutate(app, preview, { cookie: "" })).status).toBe(401);
    expect((await mutate(app, preview, { "x-csrf-token": "wrong" })).status).toBe(403);
  });
  it("uses Strict cookies by default even with spoofed forwarded HTTPS", async () => {
    const response = await createDemoGateway().request("http://localhost/api/ui/v1/me", { headers: { "x-forwarded-proto": "https" } });
    expect(response.headers.get("set-cookie")).toContain("SameSite=Strict");
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });
  it("requires explicit HTTPS preview and proxy trust for cross-site cookies", async () => {
    const app = createDemoGateway({ previewOrigins: [preview], trustedProxy: true, crossSiteCookies: true });
    const response = await app.request("http://localhost/api/ui/v1/me", { headers: { "x-forwarded-proto": "https" } });
    expect(response.headers.get("set-cookie")).toContain("SameSite=None");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    const plain = await app.request("http://localhost/api/ui/v1/me");
    expect(plain.headers.get("set-cookie")).toContain("SameSite=Strict");
  });
  it.each(["https://*.example", "https://user@example.com", "https://example.com/path", "https://example.com/", "null", "http://preview.example", "https://example.com?x=1"]) ("rejects invalid preview origin %s", origin => {
    expect(() => createDemoGateway({ previewOrigins: [origin] })).toThrow(/preview origin/i);
  });
  it("rejects cross-site cookie configuration without explicit proxy trust", () => {
    expect(() => createDemoGateway({ previewOrigins: [preview], crossSiteCookies: true })).toThrow(/proxy/i);
    expect(() => createDemoGateway({ trustedProxy: true, crossSiteCookies: true })).toThrow(/preview/i);
  });
});
