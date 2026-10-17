import { createHmac } from "node:crypto";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { createGatewayServer } from "@asi/gateway-app/main.js";

const signingKey = Uint8Array.from({ length: 32 }, (_, index) => index);

async function withGatewayServer(check: (baseUrl: string) => Promise<void>): Promise<void> {
  const { server } = createGatewayServer({
    port: 0,
    maxInputSize: 4096,
    signingKey,
    keyId: "gateway-test",
    stream: { maxConnections: 2, heartbeatIntervalMs: 30000 },
    delivery: { maxRetries: 3, retryDelayMs: 100 },
  });
  const listening = once(server, "listening");
  server.listen(0, "127.0.0.1");
  await listening;

  try {
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected a TCP listening address");
    }
    await check(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
}

describe("Gateway app HTTP adapter", () => {
  it("serves health over an actual localhost HTTP connection", async () => {
    await withGatewayServer(async baseUrl => {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ status: "ok", timestamp: expect.any(String) });
    });
  });

  it("mounts signed ingress and rejects missing signatures over HTTP", async () => {
    await withGatewayServer(async baseUrl => {
      const body = JSON.stringify({
        task: { input: "hello" },
        principal: {
          tenantId: "tenant-a",
          subjectId: "subject-1",
          roles: ["user"],
          capabilities: ["chat:read"],
          audience: "gateway",
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          authenticatedSource: "platform-adapter",
        },
      });
      const signature = createHmac("sha256", signingKey).update(body).digest("hex");
      const response = await fetch(`${baseUrl}/ingress`, {
        method: "POST",
        signal: AbortSignal.timeout(2000),
        headers: { "Content-Type": "application/json", "X-Signature": signature },
        body,
      });
      expect(response.status).toBe(200);
      const responseText = await response.text();
      expect(responseText).toMatch(/"acceptedId":"accept-[0-9a-f]{16}"/);
      expect(response.headers.get("X-Signature")).toBe(
        createHmac("sha256", signingKey).update(responseText).digest("hex")
      );

      const unsigned = await fetch(`${baseUrl}/ingress`, {
        method: "POST",
        signal: AbortSignal.timeout(2000),
        headers: { "Content-Type": "application/json" },
        body,
      });
      expect(unsigned.status).toBe(401);
      expect(await unsigned.json()).toEqual({ error: "Missing signature" });
    });
  });
});
