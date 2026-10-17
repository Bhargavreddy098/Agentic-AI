import { Hono } from "hono";
import { timingSafeEqual, createHash, createHmac } from "crypto";
import { PrincipalSchema, type Principal } from "@asi/contracts";

export interface IngressConfig {
  maxInputSize: number;
  signingKey: Uint8Array;
  keyId: string;
}

export interface IngressResult {
  acceptedId: string;
  runId?: string;
}

export class IngressHandler {
  private config: IngressConfig;

  constructor(config: IngressConfig) {
    this.config = config;
  }

  async handleIngress(
    event: unknown,
    principal: Principal
  ): Promise<IngressResult> {
    // Verify input size
    const inputSize = JSON.stringify(event).length;
    if (inputSize > this.config.maxInputSize) {
      throw new Error(`Input size ${inputSize} exceeds limit ${this.config.maxInputSize}`);
    }

    // Verify principal has required capabilities for ingress
    if (!principal.capabilities.includes("ingress")) {
      throw new Error(`Principal ${principal.subjectId} lacks ingress capability`);
    }

    // Create deterministic acceptance record based on input content (idempotent)
    const contentHash = createHash("sha256").update(JSON.stringify(event)).digest("hex");
    const acceptedId = `accept-${contentHash.substring(0, 16)}`;
    const runId = `run-${contentHash.substring(16, 32)}`;

    // In a real implementation, this would call the episodic owner
    // For now, just return the acceptance

    return { acceptedId, runId };
  }
}

export function createIngressHandler(config: IngressConfig): IngressHandler {
  return new IngressHandler(config);
}

export function createGatewayApp(config: IngressConfig) {
  const app = new Hono();
  const handler = createIngressHandler(config);

  app.post("/ingress", async (c) => {
    try {
      const body: unknown = await c.req.json<unknown>();
      const signature = c.req.header("X-Signature");
      
      if (!signature) {
        return c.json({ error: "Missing signature" }, 401);
      }

      const bodyString = JSON.stringify(body);
      const expected = createHmac("sha256", config.signingKey).update(bodyString).digest("hex");
      if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) {
        return c.json({ error: "Invalid signature" }, 401);
      }

      if (body === null || typeof body !== "object" || !("principal" in body)) {
        throw new Error("Invalid ingress body");
      }
      // Validate the JSON contract without claiming an authenticated principal binding.
      const principal = PrincipalSchema.parse(body.principal);
      const result = await handler.handleIngress(body, principal);
      
      const responseBody = JSON.stringify(result);
      const responseSignature = createHmac("sha256", config.signingKey).update(responseBody).digest("hex");
      
      return c.json(result, 200, { "X-Signature": responseSignature });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Internal error";
      return c.json({ error }, 500);
    }
  });

  return app;
}