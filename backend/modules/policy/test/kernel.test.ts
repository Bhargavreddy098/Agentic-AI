import { describe, expect, it } from "vitest";
import type { EffectRequest, Principal } from "@asi/contracts";
import { createExecutionToken, validateExecutionToken, createModeToken, validateModeToken } from "../src/index.js";
import { evaluatePolicy } from '../src/evaluate.js';

const key = "policy-test-key-32-bytes-minimum-0123456789";
function fixture() {
  const principal: Principal = { tenantId: "tenant", subjectId: "user", roles: ["user"], capabilities: ["invoke:tool"], audience: "policy-kernel", expiresAt: new Date(Date.now() + 300000).toISOString(), authenticatedSource: "asi-identity" };
  const request: EffectRequest = { schemaVersion: 1, effectId: "effect", action: "tool:invoke", resource: "tool:search", inputHash: "01".repeat(32), artifactHash: "02".repeat(32), requiredCapabilities: ["invoke:tool"], idempotencyKey: "operation", traceId: "trace", runContext: { runId: "run", sessionId: "session", writerEpoch: 1, mode: "execute", deadlineAt: new Date(Date.now() + 60000).toISOString(), budgetRef: { tenantId: "tenant", accountId: "account", rootRunId: "run" } } };
  const config = { tenantId: "tenant", principal, runMode: "execute" as const, policyVersion: "1", currentTime: new Date(), signingKey: key };
  return { principal, request, config };
}
it.each(['matches','lessThan','greaterThan'] as const)('fails closed for unsupported %s deny constraints despite another allow',operator=>{
  const {request,principal}=fixture();
  expect(evaluatePolicy({version:'1',defaultEffect:'allow',modeCapabilities:{execute:['invoke:tool']},rules:[{capability:'invoke:tool',effect:'allow',conditions:[]},{capability:'invoke:tool',effect:'deny',conditions:[{field:'effectRequest.resource',operator,value:'.*'}]}],approvalRequired:[],protectedPaths:[],maxEffectCostMicroUsd:1000,approvalExpirySeconds:60},request,principal).decision).toBe('deny');
});

describe("policy signed execution binding", () => {
  it("requires an explicit signing key", () => {
    const { request, config } = fixture();
    expect(() => createExecutionToken("invoke:tool", { ...config, signingKey: undefined }, request, 30000)).toThrow(/key/i);
  });
  it("preserves canonical hex and verifies a complete signed request", () => {
    const { request, config } = fixture(), token = createExecutionToken("invoke:tool", config, request, 30000);
    expect(token.inputHash).toBe(request.inputHash);
    expect(token.artifactHash).toBe(request.artifactHash);
    expect(validateExecutionToken(token, request, new Date(), "tenant", key).valid).toBe(true);
  });
  it("rejects unsigned tokens and absent verifier keys", () => {
    const { request, config } = fixture(), token = createExecutionToken("invoke:tool", config, request, 30000);
    expect(validateExecutionToken({ ...token, signature: undefined }, request, new Date(), "tenant", key).valid).toBe(false);
    expect(validateExecutionToken(token, request, new Date(), "tenant").valid).toBe(false);
  });
  it.each(["effectId", "action", "resource", "idempotencyKey", "traceId"] as const)("rejects changed %s", field => {
    const { request, config } = fixture(), token = createExecutionToken("invoke:tool", config, request, 30000);
    expect(validateExecutionToken(token, { ...request, [field]: "substitution" }, new Date(), "tenant", key).valid).toBe(false);
  });
  it("rejects absent and substituted artifacts", () => {
    const { request, config } = fixture(), token = createExecutionToken("invoke:tool", config, request, 30000);
    const { artifactHash: omitted, ...withoutArtifact } = request;
    expect(omitted).toBeDefined();
    expect(validateExecutionToken(token, withoutArtifact, new Date(), "tenant", key).valid).toBe(false);
    expect(validateExecutionToken(token, { ...request, artifactHash: "03".repeat(32) }, new Date(), "tenant", key).valid).toBe(false);
  });
  it("rejects changed epoch and capability set", () => {
    const { request, config } = fixture(), token = createExecutionToken("invoke:tool", config, request, 30000);
    expect(validateExecutionToken(token, { ...request, runContext: { ...request.runContext, writerEpoch: 2 } }, new Date(), "tenant", key).valid).toBe(false);
    expect(validateExecutionToken(token, { ...request, requiredCapabilities: ["admin"] }, new Date(), "tenant", key).valid).toBe(false);
  });
  it("rejects tampered policy, identity and constraints", () => {
    const { request, config } = fixture(), token = createExecutionToken("invoke:tool", config, request, 30000);
    for (const changed of [{ ...token, policyVersion: "2" }, { ...token, subjectId: "other" }, { ...token, constraints: [] }]) {
      expect(validateExecutionToken(changed, request, new Date(), "tenant", key).valid).toBe(false);
    }
  });
  it("bounds expiry to the run deadline and rejects invalid lifetimes", () => {
    const { request, config } = fixture(), token = createExecutionToken("invoke:tool", config, request, 300000);
    expect(Date.parse(token.expiresAt)).toBeLessThanOrEqual(Date.parse(request.runContext.deadlineAt));
    expect(() => createExecutionToken("invoke:tool", config, request, NaN)).toThrow();
  });
});

describe("policy signed mode binding", () => {
  it("rejects dummy/forged signatures even for unexpired matching payloads", () => {
    const payload = Buffer.from(JSON.stringify({ mode: "execute", policyVersion: "1", exp: Math.floor(Date.now() / 1000) + 60 })).toString("base64url");
    expect(validateModeToken(`e30.${payload}.forged`, "execute", "1")).toBe(false);
  });
  it("requires a key at mode issuance", () => {
    const { principal } = fixture();
    expect(() => createModeToken("execute", principal, "1", 30000)).toThrow(/key|scope/i);
  });
  it('verifies a signed mode only for the exact principal, context and policy',()=>{
    const {principal,request}=fixture(),security={signingKey:key,principal,runContext:request.runContext};
    const {token}=createModeToken('execute',principal,'1',30000,security);
    expect(validateModeToken(token,'execute','1',security)).toBe(true);
    expect(validateModeToken(token,'execute','2',security)).toBe(false);
    expect(validateModeToken(token,'execute','1',{...security,principal:{...principal,subjectId:'other'}})).toBe(false);
    expect(validateModeToken(token,'execute','1',{...security,runContext:{...request.runContext,writerEpoch:2}})).toBe(false);
    expect(validateModeToken(token+'0','execute','1',security)).toBe(false);
  });
});
