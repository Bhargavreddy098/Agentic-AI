import type { AttributeValue } from "@opentelemetry/api";

export interface RedactionRule {
  pattern: RegExp;
  replacement: string;
}

const DEFAULT_REDACTION_RULES: RedactionRule[] = [
  // Email addresses
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: "[EMAIL]" },
  // API keys (common patterns)
  { pattern: /\b(?:(?:sk|pk|rk|ak)[_-][A-Za-z0-9]+|(?:apikey|api_key|secret|token)[_-]?[A-Za-z0-9]{20,})\b/gi, replacement: "[API_KEY]" },
  // AWS keys
  { pattern: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, replacement: "[AWS_ACCESS_KEY]" },
  // AWS secret keys
  { pattern: /\b[A-Za-z0-9/+=]{40}\b/g, replacement: "[AWS_SECRET_KEY]" },
  // Generic secrets
  { pattern: /\b(secret|password|pwd|pass|api[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*[^\s[]{8,}\b/gi, replacement: "[SECRET]" },
  // Credit cards
  { pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: "[CREDIT_CARD]" },
  // SSN
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[SSN]" },
  // Phone numbers
  { pattern: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: "[PHONE]" },
  // JWT tokens
  { pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, replacement: "[JWT]" },
  // Private keys
  { pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, replacement: "[PRIVATE_KEY]" },
];

export interface RedactionConfig {
  customRules?: RedactionRule[];
  enabled: boolean;
}

let config: RedactionConfig = {
  enabled: true,
};

export function configureRedaction(cfg: Partial<RedactionConfig>): void {
  config = { ...config, ...cfg };
}

export function getRedactionRules(): RedactionRule[] {
  return [...(config.customRules ?? []), ...DEFAULT_REDACTION_RULES];
}

export function redactString(input: string): string {
  if (!config.enabled) return input;

  let output = input;
  for (const rule of getRedactionRules()) {
    output = output.replace(rule.pattern, rule.replacement);
  }
  return output;
}

export function redactSpanAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
  if (!config.enabled) return attributes;

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === "string") {
      redacted[key] = redactString(value);
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redactObject(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

export function redactObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return redactString(obj);
  if (Array.isArray(obj)) return obj.map(redactObject);
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = redactObject(value);
    }
    return result;
  }
  return obj;
}

export function redactSpan(span: {
  attributes: Record<string, unknown> | (() => Record<string, unknown>);
  setAttribute(key: string, value: AttributeValue): unknown;
}): void {
  if (!config.enabled) return;

  const attributes = typeof span.attributes === "function" ? span.attributes() : span.attributes;
  if (attributes) {
    const redacted = redactSpanAttributes(attributes);
    for (const [key, value] of Object.entries(redacted)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") span.setAttribute(key, value);
    }
  }
}

export function isRedactionEnabled(): boolean {
  return config.enabled;
}