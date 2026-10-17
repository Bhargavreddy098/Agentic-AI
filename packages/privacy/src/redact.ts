import { createHash } from "node:crypto";

import { classifyText, type ClassificationResult } from "./classify.js";

export interface RedactionRule {
  pattern: RegExp;
  replacement: string;
  category: string;
}

const DEFAULT_REDACTION_RULES: Array<{ pattern: RegExp; replacement: string; category: string }> = [
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: "[EMAIL]", category: "pii" },
  { pattern: /\b(sk|pk|rk|ak|apikey|api_key|secret|token)[_-]?[A-Za-z0-9]{20,}\b/gi, replacement: "[API_KEY]", category: "credentials" },
  { pattern: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, replacement: "[AWS_ACCESS_KEY]", category: "credentials" },
  { pattern: /\b[A-Za-z0-9/+=]{40}\b/g, replacement: "[AWS_SECRET_KEY]", category: "credentials" },
  { pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: "[CREDIT_CARD]", category: "financial" },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[SSN]", category: "pii" },
  { pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, replacement: "[JWT]", category: "credentials" },
  { pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, replacement: "[PRIVATE_KEY]", category: "credentials" },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[SSN]", category: "pii" },
  { pattern: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: "[PHONE]", category: "pii" },
  { pattern: /\$\d{1,3}(,\d{3})*(\.\d{2})?/g, replacement: "[AMOUNT]", category: "financial" },
  { pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, replacement: "[PRIVATE_KEY]", category: "credentials" },
];

export interface RedactionConfig {
  customRules?: Array<{ pattern: RegExp; replacement: string; category: string }>;
  enabled: boolean;
  preserveStructure: boolean;
}

const DEFAULT_CONFIG: {
  customRules: Array<{ pattern: RegExp; replacement: string; category: string }>;
  enabled: boolean;
  preserveStructure: boolean;
} = {
  customRules: [],
  enabled: true,
  preserveStructure: true,
};

let config = DEFAULT_CONFIG;

export function configureRedaction(cfg: Partial<typeof DEFAULT_CONFIG>): void {
  config = { ...config, ...cfg };
}

export function getRedactionRules(): Array<{ pattern: RegExp; replacement: string; category: string }> {
  return [...DEFAULT_REDACTION_RULES, ...config.customRules];
}

export function redactString(input: string, sensitivity: "public" | "internal" | "confidential" | "restricted" = "restricted"): string {
  if (!config.enabled) return input;

  let output = input;
  const rules = getRedactionRules();

  // Filter rules based on sensitivity level
  const applicableRules = rules.filter(rule => {
    if (sensitivity === "public") return false; // No redaction for public
    if (sensitivity === "internal") return rule.category !== "credentials"; // Don't redact credentials for internal
    if (sensitivity === "confidential") return rule.category !== "financial"; // Don't redact financial for confidential
    return true; // Restricted: all rules apply
  });

  for (const rule of applicableRules) {
    output = output.replace(rule.pattern, rule.replacement);
  }

  return output;
}

export interface RedactionResult {
  redacted: string;
  classification: ClassificationResult;
  rulesApplied: string[];
  originalHash: string;
  redactedHash: string;
}

export function redactWithClassification(input: string): RedactionResult {
  const classification = classifyText(input);
  const originalHash = createHash("sha256").update(input).digest("hex");
  const redacted = redactString(input);
  const redactedHash = createHash("sha256").update(redacted).digest("hex");

  const rulesApplied = [];
  for (const rule of getRedactionRules()) {
    if (rule.pattern.test(input)) {
      rulesApplied.push(`${rule.category}: ${rule.replacement}`);
    }
  }

  return {
    redacted,
    classification,
    rulesApplied,
    originalHash,
    redactedHash,
  };
}

export function redactObject(obj: unknown, sensitivity: "public" | "internal" | "confidential" | "restricted" = "restricted"): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return redactString(obj, sensitivity);
  if (Array.isArray(obj)) return obj.map(item => redactObject(item, sensitivity));
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = redactObject(value, sensitivity);
    }
    return result;
  }
  return obj;
}

export function isRedactionEnabled(): boolean {
  return true;
}