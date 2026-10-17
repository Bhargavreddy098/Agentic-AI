import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "http";
import { createHmac, timingSafeEqual } from "crypto";
import { createControlPool, type ControlPool } from "@asi/control";
import {
  ToolRegistry,
  createToolRegistry,
  ToolDispatcher,
  createToolDispatcher,
  EffectJournal,
  createEffectJournal,
} from "@asi/tools";
import { createWindowsSandboxBackend } from "@asi/sandbox";
import type { ToolManifest, RunContext, Principal, OpaqueId } from "@asi/contracts";
import { normalizeError } from "@asi/tools";
import "@asi/policy";
import "@asi/privacy";
import "@asi/telemetry";

interface ToolEngineConfig {
  port: number;
  dbPool: ControlPool;
  signingKey: Uint8Array;
  keyId: string;
  toolRegistry: ToolRegistry;
  dispatcher: ToolDispatcher;
  effectJournal: EffectJournal;
}

interface DispatchRequest {
  toolId: string;
  input: unknown;
  context: RunContext;
  principal: Principal;
}

function verifyRequestSignature(
  signingKey: Uint8Array,
  body: string,
  signature: string,
): boolean {
  const expected = createHmac("sha256", signingKey).update(body).digest("hex");
  const provided = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  return timingSafeEqual(provided, expectedBuf);
}

function signResponse(signingKey: Uint8Array, body: string): string {
  return createHmac("sha256", signingKey).update(body).digest("hex");
}

async function handleRegister(config: ToolEngineConfig, request: ToolManifest) {
  const result = await config.toolRegistry.registerTool(request);
  return result;
}

async function handleDispatch(config: ToolEngineConfig, request: DispatchRequest) {
  const abortController = new AbortController();
  
  const timeout = setTimeout(() => {
    abortController.abort();
  }, config.dispatcher["config"].defaultTimeoutMs || 30000);

  try {
    const result = await config.dispatcher.dispatchTool(
      request.toolId,
      request.input,
      request.context,
      request.principal,
      abortController.signal
    );
    
    clearTimeout(timeout);
    return result;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function handleReconcile(config: ToolEngineConfig, effectId: OpaqueId) {
  const result = await config.effectJournal.reconcileEffect(effectId);
  return result;
}

export async function startToolEngine(config: ToolEngineConfig): Promise<void> {
  await config.effectJournal.initialize();

  const server = createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing URL" }));
      return;
    }

    const url = new URL(req.url, `http://localhost:${config.port}`);
    const path = url.pathname;

    // Handle GET endpoints before the POST guard
    if (req.method === "GET" && path === "/tools/list") {
      const responseBody = JSON.stringify({ tools: config.toolRegistry.listTools() });
      const signature = signResponse(config.signingKey, responseBody);
      res.writeHead(200, {
        "Content-Type": "application/json",
        "X-Signature": signature,
      });
      res.end(responseBody);
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }

    if (!verifyRequestSignature(config.signingKey, body, req.headers["x-signature"] as string)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid signature" }));
      return;
    }

    let response: unknown;
    let statusCode = 200;

    try {
      if (path === "/tools/register") {
        const request = JSON.parse(body) as ToolManifest;
        response = await handleRegister(config, request);
      } else if (path === "/tools/dispatch") {
        const request = JSON.parse(body) as DispatchRequest;
        response = await handleDispatch(config, request);
      } else if (path === "/tools/reconcile") {
        const { effectId } = JSON.parse(body) as { effectId: OpaqueId };
        response = await handleReconcile(config, effectId);
      } else if (path === "/tools/get") {
        const { toolId } = JSON.parse(body) as { toolId: string };
        const tool = config.toolRegistry.getTool(toolId);
        response = { tool };
      } else {
        statusCode = 404;
        response = { error: "Not found" };
      }
    } catch (err) {
      statusCode = 500;
      const normalized = normalizeError(err, { operation: path });
      response = { error: normalized.safeMessage, code: normalized.code };
    }

    const responseBody = JSON.stringify(response);
    const signature = signResponse(config.signingKey, responseBody);

    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      "X-Signature": signature,
    });
    res.end(responseBody);
  });

  server.listen(config.port, () => {
    console.log(`Tool engine listening on port ${config.port}`);
  });

  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down...");
    server.close(() => process.exit(0));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dbPool = createControlPool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

  const signingKey = Buffer.from(process.env.TOOL_ENGINE_SIGNING_KEY ?? "", "base64");
  const keyId = process.env.TOOL_ENGINE_KEY_ID ?? "key-1";

  if (!signingKey.length) {
    console.error("TOOL_ENGINE_SIGNING_KEY environment variable is required");
    process.exit(1);
  }

  const toolRegistry = createToolRegistry({
    maxTools: 1000,
    allowedPublishers: [],
    requireSignatureVerification: false,
  });

  const effectJournal = createEffectJournal({ pool: dbPool });

  const backend = createWindowsSandboxBackend();

  const budgetPool = createControlPool({
    connectionString: process.env.BUDGET_DATABASE_URL ?? process.env.DATABASE_URL,
    max: 5,
  });

  const dispatcher = createToolDispatcher({
    toolRegistry,
    effectJournal,
    budgetPool,
    backend,
    defaultTimeoutMs: 30000,
    maxOutputSize: 10 * 1024 * 1024,
    enableReceipts: true,
  });

  await startToolEngine({
    port: parseInt(process.env.TOOL_ENGINE_PORT ?? "8082", 10),
    dbPool,
    signingKey,
    keyId,
    toolRegistry,
    dispatcher,
    effectJournal,
  });
}