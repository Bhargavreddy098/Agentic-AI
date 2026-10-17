import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { SensitivityLevel, MicroUsd } from "@asi/contracts";
import { classifyText, type ClassificationResult } from "./classify.js";
import { redactWithClassification } from "./redact.js";

export interface PrivacyDb {
  query<R = unknown>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount?: number | null }>;
}

export interface PrivacyRouterConfig {
  pool: PrivacyDb;
  localModels: LocalModelConfig[];
  remoteProviders: RemoteProviderConfig[];
  budgetPool: PrivacyDb;
  signingKey: Uint8Array;
  keyId: string;
  uncertaintyThreshold: number;
  maxStreamingTokens: number;
}

export interface LocalModelConfig {
  modelId: string;
  modelClass: "embedding" | "generation" | "reasoning" | "classification";
  maxSensitivity: SensitivityLevel;
  endpoint: string;
  capabilities: string[];
}

export interface RemoteProviderConfig {
  providerId: string;
  name: string;
  models: RemoteModelConfig[];
  credentialsRef: string;
  maxSensitivity: SensitivityLevel;
  region: string;
  costPerTokenMicroUsd: MicroUsd;
}

export interface RemoteModelConfig {
  modelId: string;
  modelClass: "embedding" | "generation" | "reasoning" | "classification";
  maxTokens: number;
  maxOutputTokens: number;
  supportedSensitivities: SensitivityLevel[];
}

export interface RouteInferenceConfig {
  pool: PrivacyDb;
  budgetPool: PrivacyDb;
  localModels: LocalModelConfig[];
  remoteProviders: RemoteProviderConfig[];
  signingKey: Uint8Array;
  keyId: string;
  uncertaintyThreshold: number;
  maxStreamingTokens: number;
};

export interface RouteInferenceInput {
  principal: {
    tenantId: string;
    subjectId: string;
    roles: string[];
    capabilities: string[];
    audience: string;
    expiresAt: string;
    authenticatedSource: string;
  };
  request: {
    modelClass: "embedding" | "generation" | "reasoning" | "classification";
    promptParts: Array<{ type: "text"; text: string }>;
    stablePrefix: string;
    sensitivity: "public" | "internal" | "confidential" | "restricted";
    maxOutputTokens: number;
    runContext: {
      runId: string;
      sessionId: string;
      writerEpoch: number;
      mode: "observe" | "assist" | "execute";
      deadlineAt: string;
      budgetRef: {
        tenantId: string;
        accountId: string;
        rootRunId: string;
      };
    };
    budgetReservation: {
      reservationId: string;
      budgetRef: {
        tenantId: string;
        accountId: string;
        rootRunId: string;
      };
      reservedTokens: number;
      reservedCostMicroUsd: number;
      status: "reserved" | "settled" | "unknown";
    };
    traceId: string;
    stream?: boolean;
    cancellationToken?: string;
  };
};

export interface RouteInferenceResult {
  route: "local" | "remote";
  modelId: string;
  providerId?: string;
  endpoint: string;
  sensitivity: "public" | "internal" | "confidential" | "restricted";
  redactedInput: string;
  originalHash: string;
  redactedHash: string;
  classification: {
    sensitivity: "public" | "internal" | "confidential" | "restricted";
    confidence: number;
    matchedRules: string[];
    piiDetected: boolean;
    phiDetected: boolean;
    financialDetected: boolean;
    credentialsDetected: boolean;
  };
  allowed: boolean;
  denialReason?: string;
  settlement?: BudgetSettlement;
  receipt?: AuditReceipt;
  streamingLimits?: StreamingLimits;
}

export interface BudgetSettlement {
  reservationId: string;
  actualTokens: number;
  actualCostMicroUsd: number;
  status: "settled" | "released";
  settledAt: string;
}

export interface AuditReceipt {
  receiptId: string;
  traceId: string;
  principalId: string;
  modelId: string;
  providerId?: string;
  route: "local" | "remote";
  sensitivity: string;
  inputHash: string;
  outputHash: string;
  tokensUsed: number;
  costMicroUsd: number;
  timestamp: string;
  signature: string;
}

export interface StreamingLimits {
  maxTokens: number;
  tokenCount: number;
  cancelled: boolean;
  cancellationToken?: string;
}

export type RouteResult = RouteInferenceResult;
 
export async function routeInference(
  config: RouteInferenceConfig,
  input: RouteInferenceInput,
): Promise<RouteInferenceResult> {
  const { principal, request } = input;
  const { promptParts, sensitivity, stream, cancellationToken } = request;

  const sensitivityOrder = ["public", "internal", "confidential", "restricted"];

  // Step 1: Classify the input for sensitivity
  const fullPrompt = promptParts.map(p => p.text).join("\n");
  const classification = classifyText(fullPrompt);

  // Step 1b: Explicit uncertainty routing - if confidence is below threshold, route to local or deny
  if (classification.confidence < config.uncertaintyThreshold) {
    // Uncertain classification - route to local only for safety
    const localModel = config.localModels.find(m =>
      m.modelClass === request.modelClass &&
      sensitivityOrder.indexOf(m.maxSensitivity) >= sensitivityOrder.indexOf(classification.sensitivity) &&
      m.capabilities.includes("inference")
    );

    if (localModel) {
      return {
        route: "local",
        modelId: localModel.modelId,
        endpoint: localModel.endpoint,
        sensitivity: classification.sensitivity,
        redactedInput: fullPrompt,
        originalHash: createHash("sha256").update(fullPrompt).digest("hex"),
        redactedHash: createHash("sha256").update(fullPrompt).digest("hex"),
        classification,
        allowed: true,
        ...(stream ? { streamingLimits: { maxTokens: config.maxStreamingTokens, tokenCount: 0, cancelled: false, ...(cancellationToken !== undefined ? { cancellationToken } : {}) } } : {}),
      };
    }

    return {
      route: "local",
      modelId: "",
      endpoint: "",
      sensitivity: classification.sensitivity,
      redactedInput: "",
      originalHash: "",
      redactedHash: "",
      classification,
      allowed: false,
      denialReason: `Classification confidence ${classification.confidence} below threshold ${config.uncertaintyThreshold}; no local model available for uncertain content`,
    };
  }

  // Step 2: Check if requested sensitivity exceeds classification
  const requestedLevel = sensitivityOrder.indexOf(sensitivity);
  const classifiedLevel = sensitivityOrder.indexOf(classification.sensitivity);

  if (classifiedLevel > requestedLevel) {
    return {
      route: "local",
      modelId: "",
      endpoint: "",
      sensitivity: classification.sensitivity,
      redactedInput: "",
      originalHash: "",
      redactedHash: "",
      classification,
      allowed: false,
      denialReason: `Content classified as ${classification.sensitivity} exceeds requested sensitivity ${sensitivity}`,
    };
  }

  // Step 3: Check principal clearance
  const clearance = getPrincipalClearance(principal);
  const clearanceLevel = sensitivityOrder.indexOf(clearance.clearance);
  const contentLevel = sensitivityOrder.indexOf(classification.sensitivity);

  if (contentLevel > clearanceLevel) {
    return {
      route: "local",
      modelId: "",
      endpoint: "",
      sensitivity: classification.sensitivity,
      redactedInput: "",
      originalHash: "",
      redactedHash: "",
      classification,
      allowed: false,
      denialReason: `Principal clearance ${clearance.clearance} insufficient for ${classification.sensitivity} content`,
    };
  }

  // Step 4: Redact sensitive content
  const redactedPrompt = request.promptParts.map(p => p.text).join("\n");
  const redactionResult = redactWithClassification(redactedPrompt);

  // Step 5: Find suitable local model
  const localModel = config.localModels.find(m =>
    m.modelClass === request.modelClass &&
    sensitivityOrder.indexOf(m.maxSensitivity) >= sensitivityOrder.indexOf(classification.sensitivity) &&
    m.capabilities.includes("inference")
  );

  if (localModel) {
    return {
      route: "local",
      modelId: localModel.modelId,
      endpoint: localModel.endpoint,
      sensitivity: classification.sensitivity,
      redactedInput: redactionResult.redacted,
      originalHash: redactionResult.originalHash,
      redactedHash: redactionResult.redactedHash,
      classification,
      allowed: true,
      ...(stream ? { streamingLimits: { maxTokens: config.maxStreamingTokens, tokenCount: 0, cancelled: false, ...(cancellationToken !== undefined ? { cancellationToken } : {}) } } : {}),
    };
  }

  // Step 6: Find suitable remote provider
  const remoteProvider = config.remoteProviders.find(p =>
    p.models.some(m =>
      m.modelClass === request.modelClass &&
      m.maxOutputTokens >= request.maxOutputTokens &&
      m.supportedSensitivities.includes(classification.sensitivity) &&
      sensitivityOrder.indexOf(p.maxSensitivity) >= sensitivityOrder.indexOf(classification.sensitivity)
    )
  );

  if (remoteProvider) {
    const model = remoteProvider.models.find(m =>
      m.modelClass === request.modelClass &&
      m.maxOutputTokens >= request.maxOutputTokens &&
      m.supportedSensitivities.includes(classification.sensitivity)
    );

    if (!model) {
      return {
        route: "local",
        modelId: "",
        endpoint: "",
        sensitivity: classification.sensitivity,
        redactedInput: "",
        originalHash: "",
        redactedHash: "",
        classification,
        allowed: false,
        denialReason: "No suitable remote model found",
      };
    }

    // Check budget
    const budgetCheck = await checkBudget(config.budgetPool, request.budgetReservation);
    if (!budgetCheck.allowed) {
      return {
        route: "local",
        modelId: "",
        endpoint: "",
        sensitivity: classification.sensitivity,
        redactedInput: "",
        originalHash: "",
        redactedHash: "",
        classification,
        allowed: false,
        denialReason: `Budget exceeded: ${budgetCheck.reason}`,
      };
    }

    // Router fallback: recheck sensitivity/destination/cost before routing to remote
    const fallbackCheck = await performRouterFallback(config, remoteProvider, model, classification, request);
    if (!fallbackCheck.allowed) {
      return {
        route: "local",
        modelId: "",
        endpoint: "",
        sensitivity: classification.sensitivity,
        redactedInput: "",
        originalHash: "",
        redactedHash: "",
        classification,
        allowed: false,
        denialReason: `Router fallback denied: ${fallbackCheck.reason}`,
      };
    }

    return {
      route: "remote",
      modelId: model.modelId,
      providerId: remoteProvider.providerId,
      endpoint: remoteProvider.region,
      sensitivity: classification.sensitivity,
      redactedInput: redactionResult.redacted,
      originalHash: redactionResult.originalHash,
      redactedHash: redactionResult.redactedHash,
      classification,
      allowed: true,
      ...(stream ? { streamingLimits: { maxTokens: config.maxStreamingTokens, tokenCount: 0, cancelled: false, ...(cancellationToken !== undefined ? { cancellationToken } : {}) } } : {}),
    };
  }

  return {
    route: "local",
    modelId: "",
    endpoint: "",
    sensitivity: classification.sensitivity,
    redactedInput: "",
    originalHash: "",
    redactedHash: "",
    classification,
    allowed: false,
    denialReason: "No suitable model or provider available",
  };
}

async function performRouterFallback(
  config: RouteInferenceConfig,
  remoteProvider: RemoteProviderConfig,
  model: RemoteModelConfig,
  classification: ClassificationResult,
  request: RouteInferenceInput["request"]
): Promise<{ allowed: boolean; reason?: string }> {
  // Re-check sensitivity against provider's max sensitivity
  const sensitivityOrder = ["public", "internal", "confidential", "restricted"];
  const contentLevel = sensitivityOrder.indexOf(classification.sensitivity);
  const providerMaxLevel = sensitivityOrder.indexOf(remoteProvider.maxSensitivity);

  if (contentLevel > providerMaxLevel) {
    return { allowed: false, reason: `Content sensitivity ${classification.sensitivity} exceeds provider max ${remoteProvider.maxSensitivity}` };
  }

  // Re-check cost against budget
  const estimatedCost = request.maxOutputTokens * remoteProvider.costPerTokenMicroUsd;
  const budgetCheck = await checkBudget(config.budgetPool, {
    ...request.budgetReservation,
    reservedCostMicroUsd: estimatedCost,
  });
  if (!budgetCheck.allowed) {
    return { allowed: false, reason: `Budget check failed on fallback: ${budgetCheck.reason}` };
  }

  // Re-check destination (region/provider) is allowed
  // In a real implementation, this would check against tenant/provider allowlists
  // For now, we allow all configured providers

  return { allowed: true };
}

export function getPrincipalClearance(principal: { roles: string[] }): {
  clearance: "public" | "internal" | "confidential" | "restricted";
  allowedSensitivities: SensitivityLevel[];
} {
  const hasAdminRole = principal.roles.includes("admin");
  const hasSecurityRole = principal.roles.includes("security");
  const hasComplianceRole = principal.roles.includes("compliance");

  if (hasAdminRole || hasSecurityRole || hasComplianceRole) {
    return {
      clearance: "restricted",
      allowedSensitivities: ["public", "internal", "confidential", "restricted"],
    };
  }

  const hasInternalRole = principal.roles.some(r => ["user", "developer", "analyst"].includes(r));
  if (hasInternalRole) {
    return {
      clearance: "confidential",
      allowedSensitivities: ["public", "internal", "confidential"],
    };
  }

  return {
    clearance: "internal",
    allowedSensitivities: ["public", "internal"],
  };
}

interface BudgetAccountRow {
  current_spend_micro_usd: string | number;
  monthly_limit_micro_usd: string | number;
}

async function checkBudget(budgetPool: PrivacyDb, reservation: {
  reservationId: string;
  budgetRef: {
    tenantId: string;
    accountId: string;
    rootRunId: string;
  };
  reservedTokens: number;
  reservedCostMicroUsd: number;
  status: "reserved" | "settled" | "unknown";
}): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const result = await budgetPool.query<BudgetAccountRow>(
      `SELECT current_spend_micro_usd, monthly_limit_micro_usd FROM budget_accounts WHERE account_id = $1`,
      [reservation.budgetRef.accountId]
    );

    if (result.rows.length === 0) {
      return { allowed: false, reason: "Budget account not found" };
    }

    const account = result.rows[0];
    if (!account) {
      return { allowed: false, reason: "Budget account not found" };
    }
    const projectedSpend = Number(account.current_spend_micro_usd) + reservation.reservedCostMicroUsd;
    const monthlyLimit = Number(account.monthly_limit_micro_usd);

    if (projectedSpend > monthlyLimit) {
      return { allowed: false, reason: "Budget would be exceeded" };
    }

    return { allowed: true };
  } catch {
    return { allowed: false, reason: "Budget check failed" };
  }
}

export async function settleBudget(
  budgetPool: PrivacyDb,
  reservation: {
    reservationId: string;
    budgetRef: {
      tenantId: string;
      accountId: string;
      rootRunId: string;
    };
    reservedTokens: number;
    reservedCostMicroUsd: number;
    status: "reserved" | "settled" | "unknown";
  },
  actualTokens: number,
  actualCostMicroUsd: number
): Promise<BudgetSettlement> {
  const settlement: BudgetSettlement = {
    reservationId: reservation.reservationId,
    actualTokens,
    actualCostMicroUsd,
    status: "settled",
    settledAt: new Date().toISOString(),
  };

  try {
    await budgetPool.query(
      `UPDATE budget_reservations SET status = 'settled', actual_tokens = $1, actual_cost_micro_usd = $2, settled_at = $3 WHERE reservation_id = $4`,
      [actualTokens, actualCostMicroUsd, settlement.settledAt, reservation.reservationId]
    );

    await budgetPool.query(
      `UPDATE budget_accounts SET current_spend_micro_usd = current_spend_micro_usd + $1 WHERE account_id = $2`,
      [actualCostMicroUsd, reservation.budgetRef.accountId]
    );
  } catch {
    settlement.status = "released";
  }

  return settlement;
}

export async function createAuditReceipt(
  signingKey: Uint8Array,
  keyId: string,
  params: {
    traceId: string;
    principalId: string;
    modelId: string;
    providerId?: string;
    route: "local" | "remote";
    sensitivity: string;
    inputHash: string;
    outputHash: string;
    tokensUsed: number;
    costMicroUsd: number;
  }
): Promise<AuditReceipt> {
  const receiptId = `receipt-${Date.now()}-${randomBytes(8).toString("hex")}`;
  const timestamp = new Date().toISOString();

  const payload = `${receiptId}|${params.traceId}|${params.principalId}|${params.modelId}|${params.providerId ?? ""}|${params.route}|${params.sensitivity}|${params.inputHash}|${params.outputHash}|${params.tokensUsed}|${params.costMicroUsd}|${timestamp}`;
  const signature = createHmac("sha256", signingKey).update(payload).digest("hex");

  return {
    receiptId,
    traceId: params.traceId,
    principalId: params.principalId,
    modelId: params.modelId,
    ...(params.providerId !== undefined ? { providerId: params.providerId } : {}),
    route: params.route,
    sensitivity: params.sensitivity,
    inputHash: params.inputHash,
    outputHash: params.outputHash,
    tokensUsed: params.tokensUsed,
    costMicroUsd: params.costMicroUsd,
    timestamp,
    signature,
  };
}

export function verifyAuditReceipt(
  signingKey: Uint8Array,
  receipt: AuditReceipt
): boolean {
  const payload = `${receipt.receiptId}|${receipt.traceId}|${receipt.principalId}|${receipt.modelId}|${receipt.providerId ?? ""}|${receipt.route}|${receipt.sensitivity}|${receipt.inputHash}|${receipt.outputHash}|${receipt.tokensUsed}|${receipt.costMicroUsd}|${receipt.timestamp}`;
  const expectedSignature = createHmac("sha256", signingKey).update(payload).digest("hex");
  return timingSafeEqual(Buffer.from(receipt.signature, "hex"), Buffer.from(expectedSignature, "hex"));
}