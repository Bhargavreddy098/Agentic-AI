// @ts-check
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { executeCommand } from '../../platform/database/commands.js';
import { withScopedTransaction } from '../../platform/database/transaction.js';
import { canonicalJson, digestFor } from '../../shared/canonicalization.js';
import { apiError } from '../../../middlewares/error-handler.js';

export const AUTONOMY_MODES = Object.freeze(['plan_only', 'ask_before_every_change', 'autonomous_coding', 'full_autonomous_build']);
export const OWNER_ONLY_CAPABILITIES = Object.freeze(['policy.manage', 'grants.manage', 'approvals.decide', 'budget.manage', 'usage.read', 'workspace.read', 'plan.draft']);

const capabilityName = z.string().regex(/^[a-z][a-z0-9_.:-]{2,127}$/);
const condition = z.object({
    field: z.enum(['action', 'capability', 'target', 'mode', 'principalKind']),
    operator: z.enum(['equals', 'contains', 'startsWith']),
    value: z.union([z.string().max(512), z.boolean(), z.array(z.string().max(128)).max(64)]),
}).strict();
const capabilityRule = z.object({
    capability: capabilityName,
    effect: z.enum(['allow', 'deny', 'requires_approval']),
    conditions: z.array(condition).max(16).default([]),
}).strict();
const modeRules = z.object({
    allowedCapabilities: z.array(capabilityName).max(256),
    approvalCapabilities: z.array(capabilityName).max(256).default([]),
    allowMutations: z.boolean(),
}).strict();

export const policyRulesSchema = z.object({
    schemaVersion: z.literal(1),
    autonomyModes: z.object({
        plan_only: modeRules,
        ask_before_every_change: modeRules,
        autonomous_coding: modeRules,
        full_autonomous_build: modeRules,
    }).strict(),
    capabilityRules: z.array(capabilityRule).max(256),
    highImpactActions: z.array(z.string().min(1).max(128)).max(128),
    forbiddenTargets: z.array(z.string().min(1).max(256)).max(128),
    budgetRules: z.object({
        requireReservation: z.boolean(),
        maxSingleActionMicroUsd: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    }).strict(),
    privacyRules: z.object({
        denyEgress: z.boolean(),
        allowedEgressHosts: z.array(z.string().min(1).max(256)).max(64),
    }).strict(),
}).strict();

const READ_CAPABILITIES = ['workspace.read', 'policy.read', 'approval.read', 'budget.read', 'usage.read', 'grant.read'];

export function defaultPolicyRules() {
    const base = [...READ_CAPABILITIES, 'plan.draft'];
    const mutating = ['workspace.write', 'tool.invoke', 'coding.execute', 'effect.external', 'effect.production', 'deploy.production'];
    return policyRulesSchema.parse({
        schemaVersion: 1,
        autonomyModes: {
            plan_only: { allowedCapabilities: base, approvalCapabilities: [], allowMutations: false },
            ask_before_every_change: { allowedCapabilities: [...base, ...mutating], approvalCapabilities: mutating, allowMutations: true },
            autonomous_coding: { allowedCapabilities: [...base, ...mutating], approvalCapabilities: ['effect.external', 'effect.production', 'deploy.production'], allowMutations: true },
            full_autonomous_build: { allowedCapabilities: [...base, ...mutating], approvalCapabilities: ['effect.external', 'effect.production', 'deploy.production'], allowMutations: true },
        },
        capabilityRules: [],
        highImpactActions: ['effect.production', 'deploy.production'],
        forbiddenTargets: [],
        budgetRules: { requireReservation: true, maxSingleActionMicroUsd: 5000000 },
        privacyRules: { denyEgress: true, allowedEgressHosts: [] },
    });
}

export function policyDigest(rules) {
    return digestFor('asi-policy-v1', policyRulesSchema.parse(rules));
}

const MUTATING_CAPABILITY = capability => !capability.endsWith('.read') && !capability.endsWith('.list') && capability !== 'plan.draft';

export function validatePolicySafety(rules) {
    const parsed = policyRulesSchema.safeParse(rules);
    if (!parsed.success) return { ok: false, code: 'INVALID_POLICY' };
    const value = parsed.data;
    if (!value.budgetRules.requireReservation) return { ok: false, code: 'UNSAFE_POLICY' };
    if (value.autonomyModes.plan_only.allowMutations) return { ok: false, code: 'UNSAFE_POLICY' };
    if (value.autonomyModes.plan_only.allowedCapabilities.some(MUTATING_CAPABILITY)) return { ok: false, code: 'UNSAFE_POLICY' };
    for (const required of ['effect.production', 'deploy.production']) {
        if (!value.highImpactActions.includes(required)) return { ok: false, code: 'UNSAFE_POLICY' };
    }
    for (const mode of Object.values(value.autonomyModes)) {
        if (mode.approvalCapabilities.some(capability => !mode.allowedCapabilities.includes(capability))) return { ok: false, code: 'RULE_CONFLICT' };
    }
    const signatures = new Map();
    for (const rule of value.capabilityRules) {
        const signature = canonicalJson({ capability: rule.capability, conditions: rule.conditions });
        const previous = signatures.get(signature);
        if (previous && previous !== rule.effect) return { ok: false, code: 'RULE_CONFLICT' };
        signatures.set(signature, rule.effect);
    }
    return { ok: true };
}

const policyView = row => ({
    id: row.id,
    revision: String(row.revision),
    digest: Buffer.isBuffer(row.digest) ? row.digest.toString('hex') : String(row.digest),
    rules: row.rules,
    active: row.activated_at !== null && row.activated_at !== undefined && (row.superseded_at === null || row.superseded_at === undefined),
    createdAt: row.created_at.toISOString(),
    ...(row.activated_at ? { activatedAt: row.activated_at.toISOString() } : {}),
    ...(row.superseded_at ? { supersededAt: row.superseded_at.toISOString() } : {}),
});

function conditionMatches(item, input) {
    const values = {
        action: input.action,
        capability: input.capability,
        target: input.target,
        mode: input.mode,
        principalKind: input.principal?.kind,
    };
    const actual = values[item.field];
    if (item.operator === 'equals') return actual === item.value;
    if (item.operator === 'startsWith') return typeof actual === 'string' && typeof item.value === 'string' && actual.startsWith(item.value);
    if (item.operator === 'contains') {
        if (Array.isArray(actual)) return actual.includes(item.value);
        return typeof actual === 'string' && typeof item.value === 'string' && actual.includes(item.value);
    }
    return false;
}

function microUsd(value, label) {
    if (typeof value !== 'string' || !/^\d{1,19}$/.test(value)) throw new Error('Invalid ' + label);
    return BigInt(value);
}

/**
 * Deterministic policy evaluation. Deny overrides allow; approval-required is
 * preserved only when no later hard constraint denies the action.
 */
export function evaluatePolicy(input) {
    let rules;
    try {
        rules = policyRulesSchema.parse(input.policy);
    } catch {
        return { decision: 'deny', reasonCode: 'INVALID_POLICY' };
    }
    if (!input.principal || !['local_user', 'worker'].includes(input.principal.kind)) return { decision: 'deny', reasonCode: 'UNAUTHENTICATED_PRINCIPAL' };
    if (!input.principal.workspaceId || !input.principal.id) return { decision: 'deny', reasonCode: 'MISSING_SCOPE' };
    if (!AUTONOMY_MODES.includes(input.mode)) return { decision: 'deny', reasonCode: 'INVALID_AUTONOMY_MODE' };
    if (typeof input.action !== 'string' || !/^[a-z][a-z0-9_.:-]{2,127}$/.test(input.action)) return { decision: 'deny', reasonCode: 'INVALID_ACTION' };
    if (typeof input.capability !== 'string' || !/^[a-z][a-z0-9_.:-]{2,127}$/.test(input.capability)) return { decision: 'deny', reasonCode: 'INVALID_CAPABILITY' };
    if (typeof input.inputDigest !== 'string' || !/^[0-9a-f]{64}$/.test(input.inputDigest)) return { decision: 'deny', reasonCode: 'INVALID_INPUT_DIGEST' };
    if (input.principal.kind === 'worker' && OWNER_ONLY_CAPABILITIES.includes(input.capability)) return { decision: 'deny', reasonCode: 'WORKER_NOT_ALLOWED' };

    const mode = rules.autonomyModes[input.mode];
    if (!mode) return { decision: 'deny', reasonCode: 'INVALID_AUTONOMY_MODE' };
    const target = typeof input.target === 'string' ? input.target : '';
    const classification = input.classification ?? 'internal';

    for (const forbidden of rules.forbiddenTargets) {
        if (target.toLowerCase().includes(forbidden.toLowerCase())) return { decision: 'deny', reasonCode: 'FORBIDDEN_TARGET' };
    }
    if (input.egress === true) {
        if (rules.privacyRules.denyEgress) return { decision: 'deny', reasonCode: 'EGRESS_DENIED' };
        if (['restricted', 'confidential'].includes(classification)) return { decision: 'deny', reasonCode: 'PRIVACY_DENIED' };
        if (rules.privacyRules.allowedEgressHosts.length > 0 && typeof input.egressHost === 'string' && !rules.privacyRules.allowedEgressHosts.includes(input.egressHost)) {
            return { decision: 'deny', reasonCode: 'EGRESS_DENIED' };
        }
    }

    let requiresApproval = false;
    for (const rule of rules.capabilityRules) {
        if (rule.capability !== input.capability) continue;
        if (!rule.conditions.every(item => conditionMatches(item, input))) continue;
        if (rule.effect === 'deny') return { decision: 'deny', reasonCode: 'POLICY_DENIED' };
        if (rule.effect === 'requires_approval') requiresApproval = true;
    }

    const mutating = !input.capability.endsWith('.read') && !input.capability.endsWith('.list') && input.capability !== 'plan.draft';
    if (!mode.allowedCapabilities.includes(input.capability)) return { decision: 'deny', reasonCode: 'MODE_DENIED' };
    if (mutating && !mode.allowMutations) return { decision: 'deny', reasonCode: 'MODE_DENIED' };
    if (mode.approvalCapabilities.includes(input.capability)) requiresApproval = true;

    const requiresSandbox = input.capability.startsWith('execute.') || input.capability.startsWith('effect.') || input.capability === 'workspace.write' || input.capability === 'coding.execute';
    if (requiresSandbox && input.sandboxQualified !== true) return { decision: 'deny', reasonCode: 'SANDBOX_UNAVAILABLE' };

    const grantRequired = mutating || input.capability.startsWith('effect.');
    if (grantRequired) {
        const grant = input.grant;
        if (!grant || grant.revokedAt || (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now())) {
            return { decision: 'deny', reasonCode: 'CAPABILITY_NOT_GRANTED' };
        }
    }

    const highImpact = rules.highImpactActions.some(action => action === input.action || action === input.capability || (target !== '' && target.toLowerCase().includes(action.toLowerCase())));
    if (highImpact) requiresApproval = true;

    if (input.approval) {
        if (['rejected', 'revoked'].includes(input.approval.state)) return { decision: 'deny', reasonCode: 'APPROVAL_' + String(input.approval.state).toUpperCase() };
        if (input.approval.state === 'expired') return { decision: 'deny', reasonCode: 'APPROVAL_EXPIRED' };
        if (input.approval.consumedAt || input.approval.state === 'consumed') return { decision: 'deny', reasonCode: 'APPROVAL_CONSUMED' };
        if (input.approval.expiresAt && Date.parse(input.approval.expiresAt) <= Date.now()) return { decision: 'deny', reasonCode: 'APPROVAL_EXPIRED' };
        const approvalDigest = input.approval.digest ?? input.approval.inputDigest;
        if (approvalDigest && approvalDigest !== input.inputDigest) return { decision: 'deny', reasonCode: 'APPROVAL_DIGEST_MISMATCH' };
    }

    if (mutating && rules.budgetRules.requireReservation) {
        if (!input.budget || !input.budget.reservationId) return { decision: 'deny', reasonCode: 'BUDGET_REQUIRED' };
    }
    if (input.budget) {
        let cost;
        try {
            cost = microUsd(input.budget.costMicroUsd ?? '0', 'action cost');
            const limit = microUsd(input.budget.limitMicroUsd, 'budget limit');
            const spent = microUsd(input.budget.spentMicroUsd ?? '0', 'budget spend');
            const reserved = microUsd(input.budget.reservedMicroUsd ?? '0', 'budget reservation');
            if (cost > BigInt(rules.budgetRules.maxSingleActionMicroUsd)) return { decision: 'deny', reasonCode: 'BUDGET_LIMIT' };
            if (spent + reserved + cost > limit) return { decision: 'deny', reasonCode: 'BUDGET_EXCEEDED' };
        } catch {
            return { decision: 'deny', reasonCode: 'INVALID_BUDGET' };
        }
    }

    if (requiresApproval && input.approval?.state !== 'approved') return { decision: 'requires_approval', reasonCode: 'APPROVAL_REQUIRED', constraints: { capability: input.capability, mode: input.mode } };
    return { decision: 'allow', reasonCode: 'ALLOWED', constraints: { capability: input.capability, mode: input.mode } };
}

export function createPolicy({ pool, audit }) {
    const requireAudit = () => {
        if (!audit) throw apiError('CAPABILITY_UNAVAILABLE', 'Audit is not configured.', 503);
        return audit;
    };
    return {
        async activeInTransaction(tx, workspaceId) {
            const row = (await tx.query('SELECT * FROM control.policy_revisions WHERE workspace_id=$1 AND activated_at IS NOT NULL AND superseded_at IS NULL', [workspaceId])).rows[0];
            return row ? policyView(row) : null;
        },
        async current(scope) {
            return withScopedTransaction(pool, scope, async tx => {
                const row = (await tx.query('SELECT * FROM control.policy_revisions WHERE activated_at IS NOT NULL AND superseded_at IS NULL')).rows[0];
                if (!row) throw apiError('POLICY_NOT_CONFIGURED', 'No active policy revision exists.', 409);
                return policyView(row);
            });
        },
        async createRevision(scope, key, input) {
            return executeCommand(pool, scope, 'POST /policies/revisions', key, input, async tx => {
                const workspace = (await tx.query('SELECT workspace_id FROM identity.workspaces WHERE workspace_id=$1 FOR UPDATE', [scope.workspaceId])).rows[0];
                if (!workspace) throw apiError('NOT_FOUND', 'Workspace was not found.', 404);
                const parsed = policyRulesSchema.safeParse(input.rules);
                if (!parsed.success) throw apiError('INVALID_POLICY', 'Policy rules are invalid.', 400);
                const safety = validatePolicySafety(parsed.data);
                if (!safety.ok) throw apiError(safety.code, 'Policy removes a required protection or contains conflicting rules.', 400);
                const rules = parsed.data;
                const active = (await tx.query('SELECT * FROM control.policy_revisions WHERE activated_at IS NOT NULL AND superseded_at IS NULL')).rows[0];
                if (input.baseRevisionId) {
                    if (!active || active.id !== input.baseRevisionId) throw apiError('BASE_CHANGED', 'The policy base revision changed.', 409);
                } else if (active) {
                    throw apiError('BASE_CHANGED', 'A base revision is required when an active policy exists.', 409);
                }
                const next = (await tx.query('SELECT COALESCE(MAX(revision),0)+1 AS revision FROM control.policy_revisions WHERE workspace_id=$1', [scope.workspaceId])).rows[0].revision;
                const id = randomUUID();
                const digest = policyDigest(rules);
                const row = (await tx.query(`INSERT INTO control.policy_revisions
                    (id,workspace_id,revision,digest,rules,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
                [id, scope.workspaceId, next, digest, rules, scope.principalId])).rows[0];
                await requireAudit().append(tx, scope, { action: 'policy.revision_created', targetRef: id, metadata: { revision: String(row.revision), digest: digest.toString('hex'), reason: input.reason ?? '' } });
                return { status: 201, data: policyView(row) };
            });
        },
        async activate(scope, revisionId, key, input) {
            return executeCommand(pool, scope, 'POST /policies/' + revisionId + '/activate', key, input, async tx => {
                await tx.query('SELECT workspace_id FROM identity.workspaces WHERE workspace_id=$1 FOR UPDATE', [scope.workspaceId]);
                const target = (await tx.query('SELECT * FROM control.policy_revisions WHERE workspace_id=$1 AND id=$2 FOR UPDATE', [scope.workspaceId, revisionId])).rows[0];
                if (!target) throw apiError('NOT_FOUND', 'Policy revision was not found.', 404);
                if (target.superseded_at) throw apiError('POLICY_SUPERSEDED', 'Policy revision was superseded.', 409);
                const digest = Buffer.isBuffer(target.digest) ? target.digest.toString('hex') : String(target.digest);
                if (digest !== input.digest) throw apiError('DIGEST_MISMATCH', 'Policy digest does not match the revision.', 409);
                if (target.activated_at) return { status: 200, data: policyView(target) };
                await tx.query(`UPDATE control.policy_revisions SET superseded_at=clock_timestamp()
                    WHERE workspace_id=$1 AND activated_at IS NOT NULL AND superseded_at IS NULL`, [scope.workspaceId]);
                const row = (await tx.query(`UPDATE control.policy_revisions SET activated_at=clock_timestamp()
                    WHERE workspace_id=$1 AND id=$2 RETURNING *`, [scope.workspaceId, revisionId])).rows[0];
                await requireAudit().append(tx, scope, { action: 'policy.activated', targetRef: revisionId, metadata: { revision: String(row.revision), digest } });
                return { status: 200, data: policyView(row) };
            });
        },
    };
}
