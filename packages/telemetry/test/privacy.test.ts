import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  redactString,
  redactSpanAttributes,
  redactObject,
  configureRedaction,
  isRedactionEnabled,
  type RedactionRule,
} from "@asi/telemetry";

describe("Redaction", () => {
  beforeEach(() => {
    configureRedaction({ enabled: true, customRules: [] });
  });

  describe("redactString", () => {
    it("redacts email addresses", () => {
      const input = "Contact me at john.doe@example.com for more info";
      const result = redactString(input);
      expect(result).toBe("Contact me at [EMAIL] for more info");
    });

    it("redacts multiple email addresses", () => {
      const input = "Emails: a@test.com, b@test.org";
      const result = redactString(input);
      expect(result).toBe("Emails: [EMAIL], [EMAIL]");
    });

    it("redacts API keys", () => {
      const input = "API key: sk-1234567890abcdef1234";
      const result = redactString(input);
      expect(result).toBe("API key: [API_KEY]");
    });

    it("redacts AWS access keys", () => {
      const input = "AKIAIOSFODNN7EXAMPLE";
      const result = redactString(input);
      expect(result).toBe("[AWS_ACCESS_KEY]");
    });

    it("redacts credit card numbers", () => {
      const input = "Card: 4111-1111-1111-1111";
      const result = redactString(input);
      expect(result).toBe("Card: [CREDIT_CARD]");
    });

    it("redacts SSN", () => {
      const input = "SSN: 123-45-6789";
      const result = redactString(input);
      expect(result).toBe("SSN: [SSN]");
    });

    it("redacts JWT tokens", () => {
      const input = "Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
      const result = redactString(input);
      expect(result).toContain("[JWT]");
    });

    it("redacts private keys", () => {
      const input = `-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKB\nwM2C\n-----END PRIVATE KEY-----`;
      const result = redactString(input);
      expect(result).toBe("[PRIVATE_KEY]");
    });

    it("redacts phone numbers", () => {
      const input = "Call me at 555-123-4567";
      const result = redactString(input);
      expect(result).toBe("Call me at [PHONE]");
    });

    it("handles custom rules", () => {
      const customRules: RedactionRule[] = [
        { pattern: /CUSTOM_SECRET_[A-Z0-9]+/g, replacement: "[CUSTOM]" },
      ];
      configureRedaction({ enabled: true, customRules });
      const input = "Secret: CUSTOM_SECRET_ABC123";
      const result = redactString(input);
      expect(result).toBe("Secret: [CUSTOM]");
    });

    it("can be disabled", () => {
      configureRedaction({ enabled: false });
      expect(isRedactionEnabled()).toBe(false);
      const input = "Email: test@test.com";
      const result = redactString(input);
      expect(result).toBe(input);
    });

    it("can be re-enabled", () => {
      configureRedaction({ enabled: true });
      const input = "Email: test@test.com";
      const result = redactString(input);
      expect(result).toBe("Email: [EMAIL]");
    });
  });

  describe("redactSpanAttributes", () => {
    it("redacts sensitive values in attributes", () => {
      const attrs = {
        "user.email": "user@example.com",
        "api.key": "sk-1234567890",
        "request.id": "req-123",
        "user.name": "John Doe",
      };

      expect(redactSpanAttributes(attrs)).toEqual({ ...attrs, "user.email": "[EMAIL]", "api.key": "[API_KEY]" });
      const result = redactString(JSON.stringify(attrs));
      expect(result).toContain("[EMAIL]");
      expect(result).toContain("[API_KEY]");
      expect(result).toContain("req-123");
      expect(result).toContain("John Doe");
    });
  });

  describe("redactObject", () => {
    it("recursively redacts nested objects", () => {
      const obj = {
        user: {
          email: "test@test.com",
          profile: {
            apiKey: "sk-secret123",
          },
        },
        items: [
          { id: 1, secret: "sk-abc" },
          { id: 2, secret: "sk-def" },
        ],
      };

      const result = redactObject(obj);
      expect(result).toEqual({
        user: {
          email: "[EMAIL]",
          profile: {
            apiKey: "[API_KEY]",
          },
        },
        items: [
          { id: 1, secret: "[API_KEY]" },
          { id: 2, secret: "[API_KEY]" },
        ],
      });
    });

    it("handles null and undefined", () => {
      expect(redactObject(null)).toBeNull();
      expect(redactObject(undefined)).toBeUndefined();
    });

    it("handles arrays", () => {
      const arr = ["test@test.com", "sk-123", "normal"];
      const result = redactObject(arr);
      expect(result).toEqual(["[EMAIL]", "[API_KEY]", "normal"]);
    });
  });

  describe("redaction disabled", () => {
    beforeEach(() => {
      configureRedaction({ enabled: false });
    });

    it("does not redact when disabled", () => {
      const input = "Email: test@test.com";
      const result = redactString(input);
      expect(result).toBe(input);
    });

    afterEach(() => {
      configureRedaction({ enabled: true });
    });
  });
});

describe("Span redaction", () => {
  it("redacts span attributes", async () => {
    const mockSpan = {
      initialAttributes: {
        "user.email": "user@example.com",
        "api.key": "sk-1234567890",
      },
      setAttribute: vi.fn(),
      attributes: function() {
        return mockSpan.initialAttributes;
      },
    };

    const { redactSpan } = await import("@asi/telemetry");
    redactSpan(mockSpan);
    expect(mockSpan.setAttribute).toHaveBeenCalledWith("user.email", "[EMAIL]");
    expect(mockSpan.setAttribute).toHaveBeenCalledWith("api.key", "[API_KEY]");
  });
});

describe("Custom redaction rules", () => {
  it("supports adding custom rules", () => {
    configureRedaction({
      enabled: true,
      customRules: [
        { pattern: /INTERNAL_ID_\d+/g, replacement: "[INTERNAL_ID]" },
      ],
    });

    const input = "ID: INTERNAL_ID_12345";
    const result = redactString(input);
    expect(result).toBe("ID: [INTERNAL_ID]");

    configureRedaction({ enabled: true, customRules: [] });
  });
});