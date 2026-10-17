import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "http";
import { createHmac, timingSafeEqual } from "crypto";
import { routeInference } from "@asi/privacy";
import { generate, embedText } from "@asi/models";
import type { Principal, RunContext, SensitivityLevel } from "@asi/contracts";
import type { RouteInferenceConfig, RouteInferenceInput, RouteInferenceResult, LocalModelConfig as RoutingLocalModelConfig, RemoteProviderConfig as RoutingRemoteProviderConfig } from "@asi/privacy";
import type { GenerateConfig, GenerateConfigInput, EmbedConfig } from "@asi/models";

export interface PrivacyRouterConfig {
  port: number;
  dbPool: RouteInferenceConfig["pool"] | null;
  budgetPool: RouteInferenceConfig["budgetPool"] | null;
  localModels: LocalModelConfig[];
  remoteProviders: RemoteProviderConfig[];
  embedding?: Pick<EmbedConfig, "localModels" | "remoteProviders">;
  signingKey: Uint8Array;
  keyId: string;
  uncertaintyThreshold: number;
  maxStreamingTokens: number;
}

export type LocalModelConfig = RoutingLocalModelConfig & GenerateConfig["localModels"][number];
export type RemoteModelConfig = RoutingRemoteProviderConfig["models"][number] & GenerateConfig["remoteProviders"][number]["models"][number];
export type RemoteProviderConfig = Omit<RoutingRemoteProviderConfig, "models"> & { models: RemoteModelConfig[] };
export type { RouteInferenceConfig, RouteInferenceInput, RouteInferenceResult, GenerateConfigInput };
type RouteRequest = RouteInferenceInput;
type GenerateRequest = Parameters<typeof generate>[1];
interface EmbedRequest { principal: Principal; text: string; sensitivity: SensitivityLevel; context: RunContext }

function routingConfiguration(config: PrivacyRouterConfig): RouteInferenceConfig {
  if (!config.dbPool || !config.budgetPool) {
    throw new Error("Privacy router owner configuration is required");
  }
  if (!Number.isFinite(config.uncertaintyThreshold) || config.uncertaintyThreshold < 0 || config.uncertaintyThreshold > 1) {
    throw new Error("Invalid privacy uncertainty threshold");
  }
  if (!Number.isSafeInteger(config.maxStreamingTokens) || config.maxStreamingTokens <= 0) {
    throw new Error("Invalid privacy streaming token limit");
  }
  return {
    pool: config.dbPool, budgetPool: config.budgetPool,
    localModels: config.localModels, remoteProviders: config.remoteProviders,
    signingKey: config.signingKey, keyId: config.keyId,
    uncertaintyThreshold: config.uncertaintyThreshold, maxStreamingTokens: config.maxStreamingTokens,
  };
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

async function handleRoute(config: PrivacyRouterConfig, request: RouteRequest) {
  const result = await routeInference(routingConfiguration(config), request);

  return result;
}

async function handleGenerate(config: PrivacyRouterConfig, request: GenerateRequest) {
  const result = await generate({
    localModels: config.localModels,
    remoteProviders: config.remoteProviders,
    privacyRouter: {
      routeInference: async (input) => {
        return routeInference(routingConfiguration(config), input);
      },
    },
  }, request);

  return result;
}

async function handleEmbed(config: PrivacyRouterConfig, request: EmbedRequest) {
  if (!config.embedding) throw new Error("Embedding model configuration is required");
  const result = await embedText({
    localModels: config.embedding.localModels,
    remoteProviders: config.embedding.remoteProviders,
    privacyRouter: {
      routeInference: async (input) => {
        return routeInference(routingConfiguration(config), input);
      },
    },
  }, request.principal, request.context, request.text, request.sensitivity);

  return { vector: result.vector, modelId: result.modelId };
}

export async function startPrivacyRouter(config: PrivacyRouterConfig): Promise<void> {
  routingConfiguration(config);
  const server = createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing URL" }));
      return;
    }

    const url = new URL(req.url, `http://localhost:${config.port}`);
    const path = url.pathname;

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
      if (path === "/inference/route" && req.method === "POST") {
        const parsed = JSON.parse(body) as RouteRequest;
        response = await handleRoute(config, parsed);
      } else if (path === "/inference/generate" && req.method === "POST") {
        const parsed = JSON.parse(body) as GenerateRequest;
        response = await handleGenerate(config, parsed);
      } else if (path === "/inference/embed" && req.method === "POST") {
        const parsed = JSON.parse(body) as EmbedRequest;
        response = await handleEmbed(config, parsed);
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
    console.log(`Privacy router listening on port ${config.port}`);
  });

  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down...");
    server.close(() => process.exit(0));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config: PrivacyRouterConfig = {
    port: parseInt(process.env.PRIVACY_ROUTER_PORT ?? "8081", 10),
    dbPool: null, // Will be initialized from env
    localModels: [],
    remoteProviders: [],
    budgetPool: null,
    uncertaintyThreshold: Number(process.env.PRIVACY_UNCERTAINTY_THRESHOLD),
    maxStreamingTokens: Number(process.env.PRIVACY_MAX_STREAMING_TOKENS),
    signingKey: Buffer.from(process.env.PRIVACY_ROUTER_SIGNING_KEY ?? "", "base64"),
    keyId: process.env.PRIVACY_ROUTER_KEY_ID ?? "key-1",
  };

  if (!config.signingKey.length) {
    console.error("PRIVACY_ROUTER_SIGNING_KEY environment variable is required");
    process.exit(1);
  }

  await startPrivacyRouter(config);
}

