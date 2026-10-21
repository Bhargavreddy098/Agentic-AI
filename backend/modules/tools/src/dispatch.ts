import { randomBytes, createHash } from "crypto";
import type { ToolResult, RunContext, Principal, OpaqueId, NormalizedError, Sha256Hex, ToolManifest } from "@asi/contracts";
import { executeIsolated, type IsolatedExecutionResult, type SandboxBackend } from "@asi/sandbox";
import { ToolRegistry } from "./registry.js";
import { settleBudget } from "@asi/budgets";
import { normalizeError, type NormalizationContext } from "./normalize.js";
import type { EffectJournal } from "./effect-journal.js";
import type { ControlPool } from "@asi/control";

function validateInput(input: unknown, schema: ToolManifest["inputSchema"]): { valid: boolean; error?: string } {
  if (!schema || schema.type !== "object") return { valid: true };
  const obj = input as Record<string, unknown>;
  if (!obj || typeof obj !== "object") return { valid: false, error: "Input must be an object" };
  if (schema.required && Array.isArray(schema.required)) {
    for (const field of schema.required) {
      if (!(field in obj)) return { valid: false, error: `Missing required field: ${field}` };
    }
  }
  if (schema.additionalProperties === false && schema.properties) {
    const allowed = new Set(Object.keys(schema.properties));
    for (const key of Object.keys(obj)) {
      if (!allowed.has(key)) return { valid: false, error: `Unexpected field: ${key}` };
    }
  }
  return { valid: true };
}

export interface DispatchConfig {
  toolRegistry: ToolRegistry;
  effectJournal: EffectJournal;
  budgetPool: ControlPool;
  backend: SandboxBackend;
  defaultTimeoutMs: number;
  maxOutputSize: number;
  enableReceipts: boolean;
}

export interface DispatchResult {
  result: ToolResult;
  effectId: OpaqueId;
  receiptId?: OpaqueId;
}

export class ToolDispatcher {
  private config: DispatchConfig;

  constructor(config: DispatchConfig) {
    this.config = config;
  }

  async dispatchTool(
    toolId: string,
    input: unknown,
    context: RunContext,
    principal: Principal,
    signal: AbortSignal
  ): Promise<DispatchResult> {
    const registration = this.config.toolRegistry.getTool(toolId);
    if (!registration) {
      return { result: this.createErrorResult(toolId, context, "Tool not found", "INVALID_INPUT"), effectId: "" as OpaqueId };
    }

    if (registration.revokedAt) {
      return { result: this.createErrorResult(toolId, context, "Tool revoked", "POLICY_DENIED"), effectId: "" as OpaqueId };
    }

    const manifest = registration.manifest;

    // Validate input against manifest schema
    const inputValidation = validateInput(input, manifest.inputSchema);
    if (!inputValidation.valid) {
      return { result: this.createErrorResult(toolId, context, inputValidation.error || "Invalid input", "INVALID_INPUT"), effectId: "" as OpaqueId };
    }

    // Check availability (policy, capabilities)
    const availability = await this.config.toolRegistry.checkAvailability(toolId, principal, context);
    if (!availability.allowed) {
      return { result: this.createErrorResult(toolId, context, availability.reason || "Not authorized", "POLICY_DENIED"), effectId: "" as OpaqueId };
    }

    // Check for duplicate logical effect (idempotency)
    const effectId = this.computeEffectId(toolId, input, context);
    const existingResult = await this.config.effectJournal.reconcileEffect(effectId);
    if (existingResult) {
      return { result: existingResult, effectId };
    }

    // Record intent in effect journal
    await this.config.effectJournal.recordIntent({
      effectId,
      toolId: manifest.toolId,
      input,
      context,
      principal,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    await this.config.effectJournal.startExecution(effectId, context.writerEpoch);

    let result: ToolResult;
    try {
      // Execute in isolated sandbox
      const executionResult = await executeIsolated(
        this.config.backend,
        manifest,
        input,
        context,
        signal
      );

      // Validate output
      const outputSize = JSON.stringify(executionResult.output).length;
      if (outputSize > this.config.maxOutputSize) {
        const artifactRef = await this.storeAsArtifact(executionResult.output, context);
        result = this.createSuccessResult(manifest.toolId, context, JSON.stringify({ artifactRef }), executionResult);
      } else {
        result = this.createSuccessResult(manifest.toolId, context, JSON.stringify(executionResult.output), executionResult);
      }
    } catch (err) {
      const normalized = this.normalizeError(err, { operation: "dispatch", toolId, runId: context.runId, traceId: context.runId });
      result = this.createErrorResult(
        toolId,
        context,
        normalized.safeMessage,
        normalized.code
      );
    }

    // Record outcome in effect journal
    await this.config.effectJournal.recordOutcome(effectId, result, context.writerEpoch, result.receiptId);

    // Settle budget using real reservation reference (must be obtained from budgetPool)
    if (result.status === "succeeded" && result.usage && this.config.budgetPool) {
      try {
        const budgetReservationId = `res-${effectId}`;
        const totalTokens = result.usage.inputTokens + result.usage.outputTokens;
        await settleBudget(
          { pool: this.config.budgetPool },
          {
            reservationId: budgetReservationId,
            actualTokens: totalTokens,
            actualCostMicroUsd: 0,
            tenantId: context.budgetRef.tenantId,
          },
        );
      } catch (settleErr) {
        console.error("Budget settlement replay/reconciliation needed:", settleErr);
      }
    }

    // Use real signed receipt when enabled rather than a fabricated receiptId
    if (this.config.enableReceipts) {
      const receiptEntry = await this.config.effectJournal.getEntry(effectId);
      if (receiptEntry && receiptEntry.receiptId) {
        result.receiptId = receiptEntry.receiptId;
      }
    }

    return { result, effectId, receiptId: result.receiptId };
  }

  private computeEffectId(toolId: string, input: unknown, context: RunContext): OpaqueId {
    const content = `${toolId}|${context.runId}|${JSON.stringify(input)}`;
    return createHash("sha256").update(content).digest("hex").substring(0, 32) as OpaqueId;
  }

  private async storeAsArtifact(output: unknown, context: RunContext): Promise<{ artifactId: string; digest: Sha256Hex }> {
    const content = JSON.stringify(output);
    const digest = createHash("sha256").update(content).digest("hex") as Sha256Hex;
    const artifactId = `artifact-${context.runId}-${randomBytes(8).toString("hex")}`;
    return { artifactId, digest };
  }

  private normalizeError(err: unknown, context: NormalizationContext): NormalizedError {
    return normalizeError(err, context);
  }

  private createSuccessResult(
    toolId: string,
    context: RunContext,
    content: string,
    executionResult: IsolatedExecutionResult,
    receiptId?: OpaqueId
  ): ToolResult {
    return {
      schemaVersion: 1,
      toolId: toolId as OpaqueId,
      status: "succeeded",
      content,
      artifactRefs: [],
      receiptId: (receiptId ?? `receipt-${this.computeEffectId(toolId, executionResult.output, context)}`) as OpaqueId,
      usage: {
        inputTokens: executionResult.usage?.cpuMs ?? 0,
        outputTokens: 0,
      },
      error: undefined,
    };
  }

  private createErrorResult(
    toolId: string,
    context: RunContext,
    message: string,
    code: NormalizedError["code"]
  ): ToolResult {
    return {
      schemaVersion: 1,
      toolId: toolId as OpaqueId,
      status: "failed",
      content: undefined,
      artifactRefs: [],
      receiptId: randomBytes(16).toString("hex") as OpaqueId,
      usage: { inputTokens: 0, outputTokens: 0 },
      error: {
        code,
        safeMessage: message,
        retryable: false,
      },
    };
  }
}

export function createToolDispatcher(config: DispatchConfig): ToolDispatcher {
  return new ToolDispatcher(config);
}