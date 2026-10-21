import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createGatewayCapabilityProvider, createSyntheticCapabilityBindings, createUiGateway, createProtectedUiPorts, createSessionStore, type UiUploadLimits } from "./ui/index.js";

const DEFAULT_ORIGINS = ["http://127.0.0.1:3100", "http://localhost:3100", "http://127.0.0.1:3000", "http://localhost:3000"];

function allowlistFromEnv(): string[] {
  const configured = process.env.ASI_UI_ALLOWED_ORIGINS;
  if (!configured) return DEFAULT_ORIGINS;
  return configured.split(",").map(origin => origin.trim()).filter(origin => origin.length > 0);
}

function signingKeyFromEnv(): Uint8Array {
  const configured = process.env.ASI_UI_RECEIPT_KEY;
  if (configured) return Buffer.from(configured, "base64");
  return Buffer.from("asi-protected-effect-signing-key-dev-only");
}

export interface UiGatewayServerOptions {
  port?: number;
  hostname?: string;
  allowedOrigins?: string[];
  limits?: UiUploadLimits;
}

export function createUiGatewayServer(options: UiGatewayServerOptions = {}) {
  const gateway = createUiGateway({
    ...createProtectedUiPorts({ signingKey: signingKeyFromEnv() }),
    sessions: createSessionStore(),
    allowedOrigins: options.allowedOrigins ?? allowlistFromEnv(),
    ...(options.limits ? { limits: options.limits } : {}),
    capabilities: createGatewayCapabilityProvider(createSyntheticCapabilityBindings()),
  });
  const app = new Hono();
  app.get("/health", c => c.json({ status: "ok", service: "asi-ui-gateway", protectedEffects: "policy-authorized+receipt-signed", isolation: "unqualified" }));
  app.route("/", gateway);
  return app;
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntrypoint) {
  const port = Number.parseInt(process.env.ASI_UI_GATEWAY_PORT ?? "4400", 10);
  const hostname = process.env.ASI_UI_GATEWAY_HOST ?? "127.0.0.1";
  serve({ fetch: createUiGatewayServer({ port }).fetch, hostname, port });
  console.log(`Protected UI Gateway listening on http://${hostname}:${port}/api/ui/v1 (policy kernel + signed receipts; executable isolation unqualified).`);
}
