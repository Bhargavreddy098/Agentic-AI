import { expect, it } from "vitest";
import { ApprovalDecisionInputSchema, ClarificationAnswerSchema, ProviderViewSchema, UiEventSchema, SendMessageInputSchema } from "../../../packages/contracts/src/ui/index.js";
import { UiApprovalRequestSchema, UiCommandResultSchema } from "../../../packages/contracts/src/ui/index.js";
import { readFileSync } from "node:fs";
import { gatewayPath } from "@asi/web/lib/gateway/client.js";

it("requires command identity and conversation revision", () => {
  expect(SendMessageInputSchema.safeParse({ text: "hello" }).success).toBe(false);
});
it("never accepts replacement effect arguments with an approval decision", () => {
  expect(ApprovalDecisionInputSchema.safeParse({ commandId: "cmd", expectedVersion: 1, decision: "approve", effectArgs: { path: "/" } }).success).toBe(false);
});
it("cannot parse clarification answers as approval decisions", () => {
  const answer = { commandId: "cmd", expectedVersion: 1, optionIds: ["yes"] };
  expect(ClarificationAnswerSchema.safeParse(answer).success).toBe(true);
  expect(ApprovalDecisionInputSchema.safeParse(answer).success).toBe(false);
});
it("rejects provider keys in readable projections", () => {
  expect(ProviderViewSchema.safeParse({ providerId: "p", displayName: "Provider", revision: 1, status: "disconnected", allowedActions: [], apiKey: "secret" }).success).toBe(false);
});
it("rejects unknown events and unsafe sequences", () => {
  const event = { schemaVersion: 1, eventId: "e", conversationId: "c", sequence: 1, occurredAt: "2026-10-06T00:00:00Z", eventType: "made-up", payload: {} };
  expect(UiEventSchema.safeParse(event).success).toBe(false);
  expect(UiEventSchema.safeParse({ ...event, sequence: -1 }).success).toBe(false);
});
it("accepts frozen decision fixtures without implying execution completion", () => {
  const request = JSON.parse(readFileSync("tests/fixtures/contracts/ui-pending-approval.json", "utf8"));
  expect(UiApprovalRequestSchema.safeParse(request).success).toBe(true);
  const result = JSON.parse(readFileSync("tests/fixtures/contracts/ui-approved-result.json", "utf8"));
  expect(UiCommandResultSchema.parse(result).status).toBe("applied");
  expect(UiCommandResultSchema.safeParse({ ...result, executionCompleted: true }).success).toBe(false);
});
it("encodes interaction IDs while preserving distinct command endpoints", () => {
  expect(gatewayPath("answerClarification", "q/1")).toBe("/api/ui/v1/clarifications/q%2F1/answers");
  expect(gatewayPath("decideApproval", "a/1")).toBe("/api/ui/v1/approvals/a%2F1/decisions");
});
