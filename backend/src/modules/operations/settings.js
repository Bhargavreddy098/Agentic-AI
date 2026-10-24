// @ts-check
import { z } from 'zod';
import { withScopedTransaction } from '../../platform/database/transaction.js';
import { executeCommand } from '../../platform/database/commands.js';
import { commandDigest } from '../../shared/canonicalization.js';
import { apiError } from '../../../middlewares/error-handler.js';
import { AUTONOMY_MODES, policyRulesSchema, defaultPolicyRules } from '../governance/policy.js';

export const settingsPatch = z.object({
    privacy: policyRulesSchema.shape.privacyRules.optional(),
    limits: policyRulesSchema.shape.budgetRules.optional(),
    defaultAutonomy: z.string().refine(value => AUTONOMY_MODES.includes(value)).optional(),
    retention: z.object({ diagnosticLogDays: z.number().int().min(1).max(3650), sseEventDays: z.number().int().min(1).max(3650),
        temporaryUploadHours: z.number().int().min(1).max(8760), failedWorkspaceDays: z.number().int().min(1).max(3650) }).strict().optional(),
}).strict().refine(value => Object.keys(value).length > 0);
const defaults = { defaultAutonomy: 'plan_only', retention: { diagnosticLogDays: 14, sseEventDays: 30, temporaryUploadHours: 24, failedWorkspaceDays: 7 } };
export function createSettings({ pool, audit }) {
    const current = async (tx, scope) => {
        const policy = (await tx.query('SELECT rules FROM control.policy_revisions WHERE activated_at IS NOT NULL AND superseded_at IS NULL FOR SHARE')).rows[0]?.rules ?? defaultPolicyRules();
        const row = (await tx.query("SELECT * FROM ops.settings WHERE key='preferences' AND owner_scope=$1", [scope.principalId])).rows[0];
        return { version: row?.version ?? '1', ...defaults, ...row?.value, privacy: policy.privacyRules, limits: policy.budgetRules };
    };
    return {
        read(scope) { return withScopedTransaction(pool, scope, tx => current(tx, scope)); },
        update(scope, key, version, input) {
            return executeCommand(pool, scope, 'PATCH /settings', key, { version, ...input }, async tx => {
                // Same lock order as policy activation; policy cannot change while checked settings commit.
                await tx.query('SELECT workspace_id FROM identity.workspaces WHERE workspace_id=$1 FOR UPDATE', [scope.workspaceId]);
                const before = await current(tx, scope);
                if (before.version !== version) throw apiError('VERSION_MISMATCH', 'Settings version changed.', 412);
                for (const field of ['privacy', 'limits']) if (input[field] && commandDigest(input[field]) !== commandDigest(before[field])) {
                    throw apiError('ACTIVE_POLICY_CONFLICT', 'Privacy and spending limits are controlled by the active policy revision.', 409);
                }
                const value = { defaultAutonomy: input.defaultAutonomy ?? before.defaultAutonomy, retention: input.retention ?? before.retention };
                const row = (await tx.query(`INSERT INTO ops.settings (workspace_id,owner_scope,key,value,schema_version,version)
                    VALUES ($1,$2,'preferences',$3,1,2) ON CONFLICT (workspace_id,owner_scope,key)
                    DO UPDATE SET value=EXCLUDED.value,version=ops.settings.version+1 RETURNING version`, [scope.workspaceId, scope.principalId, value])).rows[0];
                await audit.append(tx, scope, { action: 'settings.updated', targetRef: scope.workspaceId, metadata: { version: row.version } });
                return { status: 200, data: { ...before, ...value, version: row.version } };
            });
        },
    };
}
