import { createHash } from "crypto";
import type { SensitivityLevel } from "@asi/contracts";

export type ClassificationResult = {
  sensitivity: SensitivityLevel;
  confidence: number;
  matchedRules: string[];
  piiDetected: boolean;
  restrictedPiiDetected: boolean;
  phiDetected: boolean;
  financialDetected: boolean;
  credentialsDetected: boolean;
};

const PII_PATTERNS = [
  { name: "email", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, weight: 0.9 },
  { name: "phone", pattern: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, weight: 0.8 },
  { name: "ip_address", pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, weight: 0.5 },
];

const RESTRICTED_PII_PATTERNS = [
  { name: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/g, weight: 1.0 },
  { name: "credit_card", pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, weight: 1.0 },
];

const CREDENTIAL_PATTERNS = [
  { name: "api_key", pattern: /\b(sk|pk|rk|ak|apikey|api_key|secret|token)[_-]?[A-Za-z0-9]{20,}\b/gi, weight: 1.0 },
  { name: "aws_access_key", pattern: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, weight: 1.0 },
  { name: "aws_secret_key", pattern: /\b[A-Za-z0-9/+=]{40}\b/g, weight: 1.0 },
  { name: "jwt", pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, weight: 1.0 },
  { name: "private_key", pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, weight: 1.0 },
  { name: "generic_secret", pattern: /\b(secret|password|pwd|pass|api[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*[^\s]{8,}\b/gi, weight: 0.9 },
];

const FINANCIAL_PATTERNS = [
  { name: "currency", pattern: /\$\d{1,3}(,\d{3})*(\.\d{2})?/g, weight: 0.3 },
  { name: "bank_account", pattern: /\b\d{8,17}\b/g, weight: 0.4 },
  { name: "routing_number", pattern: /\b\d{9}\b/g, weight: 0.4 },
];

const PHI_PATTERNS = [
  { name: "medical_record", pattern: /\b(MR|MRN)\d{6,10}\b/gi, weight: 0.8 },
  { name: "icd_code", pattern: /\b[A-Z]\d{2}(\.\d{1,2})?\b/g, weight: 0.4 },
  { name: "npi", pattern: /\b\d{10}\b/g, weight: 0.5 },
];

const ALL_PATTERNS = [
  ...PII_PATTERNS.map(p => ({ ...p, category: "pii" })),
  ...RESTRICTED_PII_PATTERNS.map(p => ({ ...p, category: "restricted_pii" })),
  ...CREDENTIAL_PATTERNS.map(p => ({ ...p, category: "credentials" })),
  ...FINANCIAL_PATTERNS.map(p => ({ ...p, category: "financial" })),
  ...PHI_PATTERNS.map(p => ({ ...p, category: "phi" })),
];

export interface ClassificationConfig {
  customPatterns?: Array<{ name: string; pattern: RegExp; weight: number; category: string }>;
  threshold: number;
}

const DEFAULT_CONFIG: ClassificationConfig = {
  customPatterns: [],
  threshold: 0.5,
};

let activeConfig: ClassificationConfig = DEFAULT_CONFIG;

export function configureClassifier(newConfig: Partial<ClassificationConfig>): void {
  activeConfig = { ...activeConfig, ...newConfig };
}

export function getConfig(): ClassificationConfig {
  return activeConfig;
}

export function classifyText(text: string, customConfig?: Partial<ClassificationConfig>): ClassificationResult {
  const effectiveConfig = customConfig ? { ...activeConfig, ...customConfig } : activeConfig;
  const patterns = [...ALL_PATTERNS, ...(effectiveConfig.customPatterns ?? activeConfig.customPatterns ?? [])];

  let piiDetected = false;
  let restrictedPiiDetected = false;
  let phiDetected = false;
  let financialDetected = false;
  let credentialsDetected = false;
  let maxConfidence = 0;
  const matchedRules: string[] = [];

  for (const pattern of patterns) {
    const matches = text.match(pattern.pattern);
    if (matches && matches.length > 0) {
      matchedRules.push(`${pattern.name} (${matches.length} matches)`);
      maxConfidence = Math.max(maxConfidence, pattern.weight);

      switch (pattern.category) {
        case "pii":
          piiDetected = true;
          break;
        case "restricted_pii":
          restrictedPiiDetected = true;
          break;
        case "phi":
          phiDetected = true;
          break;
        case "financial":
          financialDetected = true;
          break;
        case "credentials":
          credentialsDetected = true;
          break;
      }
    }
  }

  let sensitivity: "public" | "internal" | "confidential" | "restricted" = "public";

  if (credentialsDetected || phiDetected || restrictedPiiDetected) {
    sensitivity = "restricted";
  } else if (piiDetected || financialDetected) {
    sensitivity = "confidential";
  } else if (maxConfidence > 0.3) {
    sensitivity = "internal";
  }

  return {
    sensitivity,
    confidence: maxConfidence,
    matchedRules,
    piiDetected,
    restrictedPiiDetected,
    phiDetected,
    financialDetected,
    credentialsDetected,
  };
}

export function classifyPrincipal(principal: { tenantId: string; subjectId: string; roles: string[]; capabilities: string[] }): {
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

export function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}