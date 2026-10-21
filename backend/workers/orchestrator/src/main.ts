import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "http";
import { createHmac, timingSafeEqual } from "crypto";
import { Orchestrator, createOrchestrator } from "@asi/orchestrator";
import type { SessionEvent, RunContext, Principal, OpaqueId } from "@asi/contracts";

interface OrchestratorConfig {
  port: number;
  signingKey: Uint8Array;
  keyId: string;
  orchestrator: Orchestrator;
}

interface StartRunRequest {
  event: SessionEvent;
}

interface AdvanceRunRequest {
  context: RunContext;
}

interface ResumeRunRequest {
  runId: OpaqueId;
  principal: Principal;
}

interface CancelRunRequest {
  runId: OpaqueId;
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

async function handleStartRun(config: OrchestratorConfig, request: StartRunRequest) {
  const result = await config.orchestrator.startRun(request.event);
  return result;
}

async function handleAdvanceRun(config: OrchestratorConfig, request: AdvanceRunRequest) {
  const result = await config.orchestrator.advanceRun(request.context);
  return result;
}

async function handleResumeRun(config: OrchestratorConfig, request: ResumeRunRequest) {
  await config.orchestrator.resumeRun(request.runId, request.principal);
  return { resumed: true };
}

async function handleCancelRun(config: OrchestratorConfig, request: CancelRunRequest) {
  await config.orchestrator.cancelRun(request.runId, request.principal);
  return { cancelled: true };
}

async function handleGetStatus(config: OrchestratorConfig, runId: string) {
  const state = config.orchestrator["runs"].get(runId);
  if (!state) {
    return { error: "Run not found" };
  }
  return {
    runId: state.runId,
    status: state.status,
    modelCallCount: state.modelCallCount,
    delegationDepth: state.delegationDepth,
    observationsCount: state.observations.length,
  };
}

export async function startOrchestrator(config: OrchestratorConfig): Promise<void> {
  const server = createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing URL" }));
      return;
    }

    const url = new URL(req.url, `http://localhost:${config.port}`);
    const path = url.pathname;

    if (req.method !== "POST" && req.method !== "GET") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }

    if (req.method === "POST" && !verifyRequestSignature(config.signingKey, body, req.headers["x-signature"] as string)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid signature" }));
      return;
    }

    let response: unknown;
    let statusCode = 200;

    try {
      if (path === "/runs/start" && req.method === "POST") {
        const request = JSON.parse(body) as StartRunRequest;
        response = await handleStartRun(config, request);
      } else if (path === "/runs/advance" && req.method === "POST") {
        const request = JSON.parse(body) as AdvanceRunRequest;
        response = await handleAdvanceRun(config, request);
      } else if (path === "/runs/resume" && req.method === "POST") {
        const request = JSON.parse(body) as ResumeRunRequest;
        response = await handleResumeRun(config, request);
      } else if (path === "/runs/cancel" && req.method === "POST") {
        const request = JSON.parse(body) as CancelRunRequest;
        response = await handleCancelRun(config, request);
      } else if (path === "/runs/status" && req.method === "GET") {
        const runId = url.searchParams.get("runId");
        if (!runId) {
          statusCode = 400;
          response = { error: "Missing runId parameter" };
        } else {
          response = await handleGetStatus(config, runId);
        }
      } else {
        statusCode = 404;
        response = { error: "Not found" };
      }
    } catch (err) {
      statusCode = 500;
      response = { error: err instanceof Error ? err.message : "Internal error" };
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
    console.log(`Orchestrator listening on port ${config.port}`);
  });

  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down...");
    server.close(() => process.exit(0));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const signingKey = Buffer.from(process.env.ORCHESTRATOR_SIGNING_KEY ?? "", "base64");
  const keyId = process.env.ORCHESTRATOR_KEY_ID ?? "key-1";

  if (!signingKey.length) {
    console.error("ORCHESTRATOR_SIGNING_KEY environment variable is required");
    process.exit(1);
  }

  const orchestrator = createOrchestrator();

  await startOrchestrator({
    port: parseInt(process.env.ORCHESTRATOR_PORT ?? "8084", 10),
    signingKey,
    keyId,
    orchestrator,
  });
}