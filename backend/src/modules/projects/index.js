// @ts-check
import { randomUUID } from 'node:crypto';
import { executeCommand } from '../../platform/database/commands.js';
import { withScopedTransaction } from '../../platform/database/transaction.js';
import { apiError } from '../../../middlewares/error-handler.js';

export const projectView = row => ({ id: row.project_id, name: row.title, description: row.description,
    kind: row.kind, status: row.status, ...(row.workspace_root_ref ? { workspaceRootRef: row.workspace_root_ref } : {}),
    version: row.revision, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() });

/** SQL-first project application port. Workspace identity comes only from the session. */
export function createProjects({ pool }) {
    const read = async (tx, id, lock = false) => {
        const row = (await tx.query('SELECT * FROM product.projects WHERE project_id=$1' + (lock ? ' FOR UPDATE' : ''), [id])).rows[0];
        if (!row) throw apiError('NOT_FOUND', 'Project was not found.', 404);
        return row;
    };
    return {
        async readInTransaction(tx, id) { return projectView(await read(tx, id)); },
        async requireActive(tx, id) {
            const row = await read(tx, id, true);
            if (row.status !== 'active') throw apiError('PROJECT_ARCHIVED', 'Project is archived.', 409);
            return projectView(row);
        },
        async create(scope, key, input) {
            return executeCommand(pool, scope, 'POST /projects', key, input, async tx => {
                if (input.repositoryConnectionId) throw apiError('CAPABILITY_UNAVAILABLE', 'Repository connections are not qualified.', 503);
                if (input.kind === 'existing' && !input.workspaceRootRef) throw apiError('ROOT_NOT_AUTHORIZED', 'An existing project requires an authorized repository root.', 403);
                if (input.workspaceRootRef) {
                    const root = await tx.query('SELECT id FROM identity.workspace_roots WHERE id=$1 AND revoked_at IS NULL', [input.workspaceRootRef]);
                    if (!root.rows.length) throw apiError('ROOT_NOT_AUTHORIZED', 'Repository root is not authorized.', 403);
                }
                const id = randomUUID();
                const row = (await tx.query(`INSERT INTO product.projects
                    (project_id,workspace_id,slug,title,kind,workspace_root_ref) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
                [id, scope.workspaceId, 'project-' + id.replaceAll('-', ''), input.name, input.kind, input.workspaceRootRef ?? null])).rows[0];
                return { status: 201, projectId: id, data: projectView(row) };
            });
        },
        async read(scope, id) { return withScopedTransaction(pool, scope, async tx => projectView(await read(tx, id))); },
        async list(scope, { limit, after, status }) {
            return withScopedTransaction(pool, scope, async tx => {
                const rows = (await tx.query(`SELECT * FROM product.projects WHERE ($1::uuid IS NULL OR project_id>$1::uuid)
                    AND ($2::text IS NULL OR status=$2) ORDER BY project_id LIMIT $3`, [after, status ?? null, limit + 1])).rows;
                const items = rows.slice(0, limit);
                return { data: items.map(projectView), nextCursor: rows.length > limit ? Buffer.from(items.at(-1).project_id).toString('base64url') : null };
            });
        },
        async update(scope, id, key, version, input) {
            return executeCommand(pool, scope, 'PATCH /projects/' + id, key, { version, ...input }, async tx => {
                const existing = await read(tx, id, true);
                if (existing.status !== 'active') throw apiError('PROJECT_ARCHIVED', 'Project is archived.', 409);
                if (existing.revision !== version) throw apiError('VERSION_MISMATCH', 'Project version changed.', 412);
                const row = (await tx.query(`UPDATE product.projects SET title=COALESCE($2,title),description=COALESCE($3,description),
                    revision=revision+1,updated_at=clock_timestamp() WHERE project_id=$1 RETURNING *`, [id, input.name ?? null, input.description ?? null])).rows[0];
                return { status: 200, projectId: id, data: projectView(row) };
            });
        },
        async archive(scope, id, key, input) {
            return executeCommand(pool, scope, 'POST /projects/' + id + '/archive', key, input, async tx => {
                const existing = await read(tx, id, true);
                if ((await tx.query("SELECT to_regclass('control.runs') AS runs")).rows[0].runs) {
                    if ((await tx.query("SELECT 1 FROM control.runs WHERE project_id=$1 AND state NOT IN ('verified','failed','cancelled') LIMIT 1", [id])).rows.length) throw apiError('ACTIVE_RUNS_EXIST', 'Reconcile or finish active runs before archiving.', 409);
                }
                if (existing.status === 'archived') return { status: 200, projectId: id, data: projectView(existing) };
                const row = (await tx.query("UPDATE product.projects SET status='archived',revision=revision+1,updated_at=clock_timestamp() WHERE project_id=$1 RETURNING *", [id])).rows[0];
                return { status: 200, projectId: id, data: projectView(row) };
            });
        },
    };
}
