// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { defaultPolicyRules, policyDigest, evaluatePolicy, validatePolicySafety } from '../src/modules/governance/policy.js';

const policy = defaultPolicyRules();
const owner = { id: randomUUID(), kind: 'local_user', workspaceId: randomUUID() };
const worker = { ...owner, kind: 'worker' };
const grant = { id: randomUUID(), expiresAt: new Date(Date.now() + 60000).toISOString() };
const budget = { reservationId: randomUUID(), limitMicroUsd: '1000', spentMicroUsd: '100', reservedMicroUsd: '100', costMicroUsd: '100' };
const base = { policy, principal: owner, action: 'workspace.write', capability: 'workspace.write', mode: 'autonomous_coding', inputDigest: 'a'.repeat(64), target: 'workspace', grant, sandboxQualified: true, budget };

test('policy evaluation is deny-overrides and enforces mode, sandbox, grant, budget, and approval constraints', () => {
    assert.equal(evaluatePolicy({ ...base, mode: 'plan_only' }).reasonCode, 'MODE_DENIED');
    assert.equal(evaluatePolicy({ ...base, sandboxQualified: false }).reasonCode, 'SANDBOX_UNAVAILABLE');
    assert.equal(evaluatePolicy({ ...base, grant: null }).reasonCode, 'CAPABILITY_NOT_GRANTED');
    assert.equal(evaluatePolicy({ ...base, grant: { ...grant, revokedAt: new Date().toISOString() } }).reasonCode, 'CAPABILITY_NOT_GRANTED');
    assert.equal(evaluatePolicy({ ...base, grant: { ...grant, expiresAt: new Date(Date.now() - 1000).toISOString() } }).reasonCode, 'CAPABILITY_NOT_GRANTED');
    assert.equal(evaluatePolicy({ ...base, budget: { ...budget, costMicroUsd: '801' } }).reasonCode, 'BUDGET_EXCEEDED');
    assert.equal(evaluatePolicy({ ...base, budget: { ...budget, costMicroUsd: '5000001' } }).reasonCode, 'BUDGET_LIMIT');
    assert.equal(evaluatePolicy({ ...base, budget: null }).reasonCode, 'BUDGET_REQUIRED');
});

test('high-impact effects require an exact approval that the evaluator can consume', () => {
    const effect = { ...base, action: 'deploy.production', capability: 'deploy.production', mode: 'full_autonomous_build' };
    assert.equal(evaluatePolicy(effect).decision, 'requires_approval');
    assert.equal(evaluatePolicy({ ...effect, approval: { state: 'approved', digest: 'b'.repeat(64) } }).reasonCode, 'APPROVAL_DIGEST_MISMATCH');
    assert.equal(evaluatePolicy({ ...effect, approval: { state: 'approved', digest: effect.inputDigest } }).decision, 'allow');
    assert.equal(evaluatePolicy({ ...effect, approval: { state: 'rejected' } }).reasonCode, 'APPROVAL_REJECTED');
    assert.equal(evaluatePolicy({ ...effect, approval: { state: 'revoked' } }).reasonCode, 'APPROVAL_REVOKED');
    assert.equal(evaluatePolicy({ ...effect, approval: { state: 'expired' } }).reasonCode, 'APPROVAL_EXPIRED');
    assert.equal(evaluatePolicy({ ...effect, approval: { state: 'approved', digest: effect.inputDigest, consumedAt: new Date().toISOString() } }).reasonCode, 'APPROVAL_CONSUMED');
    assert.equal(evaluatePolicy({ ...effect, approval: { state: 'approved', digest: effect.inputDigest, expiresAt: new Date(Date.now() - 1000).toISOString() } }).reasonCode, 'APPROVAL_EXPIRED');
});

test('owner-only reads are denied to workers and forbidden targets/privacy rules deny first', () => {
    assert.equal(evaluatePolicy({ ...base, principal: worker, action: 'policy.manage', capability: 'policy.manage' }).reasonCode, 'WORKER_NOT_ALLOWED');
    assert.equal(evaluatePolicy({ ...base, target: 'http://forbidden.example', policy: { ...policy, forbiddenTargets: ['forbidden'] } }).reasonCode, 'FORBIDDEN_TARGET');
    assert.equal(evaluatePolicy({ ...base, capability: 'workspace.read', action: 'workspace.read', egress: true, target: 'https://example.com' }).reasonCode, 'EGRESS_DENIED');
    assert.equal(evaluatePolicy({ ...base, policy: { ...policy, autonomyModes: { ...policy.autonomyModes, autonomous_coding: { ...policy.autonomyModes.autonomous_coding, allowedCapabilities: [] } } } }).reasonCode, 'MODE_DENIED');
    assert.equal(evaluatePolicy({ ...base, principal: null }).reasonCode, 'UNAUTHENTICATED_PRINCIPAL');
    assert.equal(evaluatePolicy({ ...base, inputDigest: 'not-a-digest' }).reasonCode, 'INVALID_INPUT_DIGEST');
    assert.equal(evaluatePolicy({ ...base, policy: { schemaVersion: 2 } }).reasonCode, 'INVALID_POLICY');
});

test('policy safety rejects protections removed and contradictory rules', () => {
    assert.equal(validatePolicySafety(policy).ok, true);
    assert.equal(validatePolicySafety({ ...policy, budgetRules: { ...policy.budgetRules, requireReservation: false } }).code, 'UNSAFE_POLICY');
    assert.equal(validatePolicySafety({ ...policy, autonomyModes: { ...policy.autonomyModes, plan_only: { ...policy.autonomyModes.plan_only, allowMutations: true } } }).code, 'UNSAFE_POLICY');
    assert.equal(validatePolicySafety({ ...policy, highImpactActions: [] }).code, 'UNSAFE_POLICY');
    assert.equal(validatePolicySafety({ ...policy, capabilityRules: [ { capability: 'workspace.write', effect: 'allow' }, { capability: 'workspace.write', effect: 'deny' } ] }).code, 'RULE_CONFLICT');
});

test('policy digest is deterministic and changes with every material revision', () => {
    const first = policyDigest(policy);
    assert.equal(first.toString('hex'), policyDigest(defaultPolicyRules()).toString('hex'));
    const changed = { ...policy, highImpactActions: [...policy.highImpactActions, 'workspace.write'] };
    assert.notEqual(first.toString('hex'), policyDigest(changed).toString('hex'));
    assert.equal(first.length, 32);
});
