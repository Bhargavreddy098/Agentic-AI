// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import {
  createMemoryUiPorts,
  createSessionStore,
  createUiGateway,
} from "@asi/gateway-app/ui/index.js";
import { createSyntheticCapabilityBindings, createGatewayCapabilityProvider } from "@asi/gateway-app/ui/capabilities.js";
import { UiCapabilitiesSchema } from "@asi/contracts";

const realFetch = globalThis.fetch;
const jars = new Map<string, Map<string, string>>();

function jarFor(origin: string): Map<string, string> {
  const existing = jars.get(origin);
  if (existing) return existing;
  const created = new Map<string, string>();
  jars.set(origin, created);
  return created;
}

function storeCookies(jar: Map<string, string>, response: Response) {
  const header = response.headers as Headers & { getSetCookie?: () => string[] };
  const list = typeof header.getSetCookie === "function" ? header.getSetCookie() : (response.headers.get("set-cookie") ? [response.headers.get("set-cookie") as string] : []);
  for (const raw of list) {
    const pair = raw.split(";")[0] ?? "";
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    const expired = /max-age=0/i.test(raw) || /expires=thu, 01 jan 1970/i.test(raw);
    if (!value || expired) jar.delete(name);
    else jar.set(name, value);
  }
}

function installInterceptor() {
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const requested = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const resolved = requested.startsWith("/") ? primaryBase + requested : requested;
    const origin = new URL(resolved).origin;
    const jar = jarFor(origin);
    const headers = new Headers(init.headers ?? {});
    if (jar.size) headers.set("cookie", [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; "));
    if (!headers.has("origin")) headers.set("origin", origin);
    const response = await realFetch(resolved, { ...init, headers });
    storeCookies(jar, response);
    return response;
  }) as typeof fetch;
}

async function listen(fetchHandler: (request: Request) => Response | Promise<Response>): Promise<string> {
  const server = serve({ fetch: fetchHandler, hostname: "127.0.0.1", port: 0 });
  servers.push(server);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server missing port");
  return `http://127.0.0.1:${address.port}`;
}

let primaryBase = "";
let secondaryBase = "";
let tertiaryBase = "";
const servers: ServerType[] = [];

async function signIn(base: string, assertion: string) {
  const response = await fetch(`${base}/api/ui/v1/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assertion }),
  });
  expect(response.status).toBe(200);
}

describe("openclaw capability discovery", () => {
  beforeAll(async () => {
    installInterceptor();
    primaryBase = await listen(createUiGateway({
      ...createMemoryUiPorts(),
      sessions: createSessionStore(),
      capabilities: createGatewayCapabilityProvider(createSyntheticCapabilityBindings()),
    }).fetch);

    secondaryBase = await listen(createUiGateway({
      ...createMemoryUiPorts(),
      sessions: createSessionStore(),
    }).fetch);

    const failing = createGatewayCapabilityProvider([{
      operation: "conversation.read" as const,
      adapterId: "failing-adapter",
      source: "live" as const,
      qualificationRef: "qualified-owner-record",
      readiness: async () => {
        throw new Error("provider credential rejected: secret AKIAEXAMPLE1234567890abcdef");
      },
    }]);
    tertiaryBase = await listen(createUiGateway({
      ...createMemoryUiPorts(),
      sessions: createSessionStore(),
      capabilities: failing,
    }).fetch);

    await signIn(primaryBase, "assert-workspace-a");
    await signIn(secondaryBase, "assert-workspace-a");
    await signIn(tertiaryBase, "assert-workspace-a");
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    for (const server of servers) await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  });

  it("unauthenticated discovery is 401", async () => {
    const response = await realFetch(`${primaryBase}/api/ui/v1/capabilities`);
    expect(response.status).toBe(401);
  });

  it("unknown assertions cannot bootstrap", async () => {
    const response = await fetch(`${primaryBase}/api/ui/v1/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assertion: "assert-unknown-workspace" }),
    });
    expect(response.status).toBe(401);
  });

  it("valid existing test-session setup returns schema-valid discovery", async () => {
    const response = await fetch(`${primaryBase}/api/ui/v1/capabilities`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(UiCapabilitiesSchema.safeParse(body).success).toBe(true);
  });

  it("missing provider yields zero live operations", async () => {
    const response = await fetch(`${secondaryBase}/api/ui/v1/capabilities`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(UiCapabilitiesSchema.safeParse(body).success).toBe(true);
    expect(body.operations.filter((o: { state: string }) => o.state === "live").length).toBe(0);
  });

  it("default protected composition cannot advertise Chat/upload/catalog support", async () => {
    const response = await fetch(`${primaryBase}/api/ui/v1/capabilities`);
    const body = await response.json();
    const states = Object.fromEntries(body.operations.map((o: { operation: string; state: string }) => [o.operation, o.state]));
    expect(states["message.send"]).not.toBe("live");
    expect(states["upload.create"]).not.toBe("live");
    expect(states["provider.read"]).not.toBe("live");
    expect(states["model.read"]).not.toBe("live");
    expect(states["skill.read"]).not.toBe("live");
    expect(states["connection.read"]).not.toBe("live");
    expect(states["memory.read"]).not.toBe("live");
    expect(states["activity.read"]).not.toBe("live");
    expect(states["settings.read"]).not.toBe("live");
    expect(states["artifact.read"]).not.toBe("live");
    expect(states["usage.read"]).not.toBe("live");
  });

  it("owner failure exposes no internal error or credential text", async () => {
    const response = await fetch(`${tertiaryBase}/api/ui/v1/capabilities`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(UiCapabilitiesSchema.safeParse(body).success).toBe(true);
    const text = JSON.stringify(body);
    expect(text).not.toContain("secret");
    expect(text).not.toContain("AKIA");
    expect(text).not.toContain("credential");
    expect(text).not.toMatch(/Error:/);
    const op = body.operations.find((o: { operation: string }) => o.operation === "conversation.read");
    expect(op.state).toBe("unavailable");
  });
});