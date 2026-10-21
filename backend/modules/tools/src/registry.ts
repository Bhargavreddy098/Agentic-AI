import { EventEmitter } from "events";
import type { ToolManifest, Principal, RunContext } from "@asi/contracts";
import { validateManifest, type ValidatedToolManifest, verifyManifestSignature } from "./manifests.js";

export interface ToolRegistration {
  manifest: ValidatedToolManifest;
  registeredAt: string;
  revokedAt?: string;
  revokedReason?: string;
}

export interface RegistryConfig {
  maxTools: number;
  allowedPublishers: string[];
  /** Legacy option retained for callers; verification cannot be disabled. */
  requireSignatureVerification: boolean;
  /** Trusted exact [toolId, toolVersion] JSON tuple -> Ed25519 public PEM. */
  publisherKeys?: ReadonlyMap<string, string>;
}

const DEFAULT_CONFIG: RegistryConfig = {
  maxTools: 1000,
  allowedPublishers: [],
  requireSignatureVerification: true,
};

export interface AvailabilityResult {
  allowed: boolean;
  reason?: string;
}

export class ToolRegistry extends EventEmitter {
  private tools: Map<string, ToolRegistration> = new Map();
  private config: RegistryConfig;
  private publisherKeys: ReadonlyMap<string, string>;

  constructor(config: Partial<RegistryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (!Number.isInteger(this.config.maxTools) || this.config.maxTools < 1 || this.config.maxTools > 10000) throw new Error("Invalid registry capacity");
    if ((config.publisherKeys?.size ?? 0) > this.config.maxTools) throw new Error("Publisher key inventory exceeds capacity");
    this.publisherKeys = new Map(config.publisherKeys);
  }

  async registerTool(manifest: ToolManifest): Promise<{ success: boolean; toolId?: string; errors: string[] }> {
    const validation = validateManifest(manifest);
    
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    const validatedManifest = validation.manifest!;
    // Escape separators injectively while preserving existing simple tool handles.
    const segment = (value: string) => value.replace(/[%@]/g, character => character === "%" ? "%25" : "%40");
    const toolKey = segment(validatedManifest.toolId) + "@" + segment(validatedManifest.toolVersion);

    if (this.tools.has(toolKey)) {
      const existing = this.tools.get(toolKey)!;
      if (existing.revokedAt) {
        return { success: false, errors: ["Tool version was revoked and cannot be re-registered"] };
      }
      return { success: false, errors: ["Tool version already registered"] };
    }

    if (this.tools.size >= this.config.maxTools) {
      return { success: false, errors: ["Registry at capacity"] };
    }

    const key = this.publisherKeys.get(JSON.stringify([validatedManifest.toolId, validatedManifest.toolVersion]));
    if (!key || !verifyManifestSignature(validatedManifest, key)) {
      return { success: false, errors: ["Missing trusted publisher key or invalid publisher signature"] };
    }
    // Signature binds the artifact digest. The isolation owner must verify actual bytes immediately before execution.

    const registration: ToolRegistration = {
      manifest: structuredClone(validatedManifest),
      registeredAt: new Date().toISOString(),
    };

    this.tools.set(toolKey, registration);
    this.emit("registered", toolKey, structuredClone(registration));

    return { success: true, toolId: toolKey, errors: [] };
  }

  async revokeTool(toolId: string, reason: string): Promise<boolean> {
    const registration = this.tools.get(toolId);
    if (!registration) return false;

    registration.revokedAt = new Date().toISOString();
    registration.revokedReason = reason;
    this.emit("revoked", toolId, reason);
    return true;
  }

  getTool(toolId: string): ToolRegistration | undefined {
    const registration = this.tools.get(toolId);
    return registration ? structuredClone(registration) : undefined;
  }

  listTools(): ToolRegistration[] {
    return Array.from(this.tools.values()).filter(t => !t.revokedAt).map(t => structuredClone(t));
  }

  isRevoked(toolId: string): boolean {
    const tool = this.tools.get(toolId);
    return tool?.revokedAt !== undefined;
  }

  async checkAvailability(toolId: string, principal: Principal, context: RunContext): Promise<AvailabilityResult> {
    const registration = this.tools.get(toolId);
    if (!registration) {
      return { allowed: false, reason: "Tool not found" };
    }

    if (registration.revokedAt) {
      return { allowed: false, reason: `Tool revoked: ${registration.revokedReason}` };
    }

    const manifest = registration.manifest;
    
    // Check capabilities
    const hasCapabilities = manifest.requiredCapabilities.every(cap => 
      principal.capabilities.includes(cap)
    );
    if (!hasCapabilities) {
      return { allowed: false, reason: "Missing required capabilities" };
    }

    // Check epoch
    if (context.writerEpoch < 1) {
      return { allowed: false, reason: "Invalid writer epoch" };
    }

    // Check deadline
    const deadline = new Date(context.deadlineAt).getTime();
    const now = Date.now();
    if (now > deadline) {
      return { allowed: false, reason: "Deadline exceeded" };
    }

    return { allowed: true };
  }


}

export function createToolRegistry(config?: Partial<RegistryConfig>): ToolRegistry {
  return new ToolRegistry(config);
}