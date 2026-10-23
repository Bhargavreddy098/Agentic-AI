// @ts-check
import { randomUUID } from 'node:crypto';
import { executeCommand } from '../../platform/database/commands.js';
import { withScopedTransaction } from '../../platform/database/transaction.js';
import { apiError } from '../../../middlewares/error-handler.js';
const view = row => ({ id: row.id, projectId: row.project_id, title: row.title, status: row.status, version: row.version });
const messageView = (row, attachmentIds) => ({ id: row.id, conversationId: row.conversation_id, sequence: row.sequence,
    role: row.role, attachmentIds, createdAt: row.created_at.toISOString(), trustLabel: row.trust_label });

export function createConversations({ pool, projects, artifacts }) {
    const lookup = async (tx, id, lock = false) => {
        const row = (await tx.query('SELECT * FROM product.conversations WHERE id=$1' + (lock ? ' FOR UPDATE' : ''), [id])).rows[0];
        if (!row) throw apiError('NOT_FOUND', 'Conversation was not found.', 404);
        return row;
    };
    return {
        async create(scope, projectId, key, input) {
            return executeCommand(pool, scope, 'POST /projects/' + projectId + '/conversations', key, input, async tx => {
                await projects.requireActive(tx, projectId);
                const row = (await tx.query('INSERT INTO product.conversations (id,workspace_id,project_id,title) VALUES ($1,$2,$3,$4) RETURNING *', [randomUUID(), scope.workspaceId, projectId, input.title ?? 'New conversation'])).rows[0];
                return { status: 201, projectId, data: view(row) };
            });
        },
        async read(scope, id) { return withScopedTransaction(pool, scope, async tx => view(await lookup(tx, id))); },
        async list(scope, projectId, { limit, after }) {
            return withScopedTransaction(pool, scope, async tx => {
                await projects.readInTransaction(tx, projectId);
                const result = await tx.query('SELECT * FROM product.conversations WHERE project_id=$1 AND ($2::uuid IS NULL OR id>$2::uuid) ORDER BY id LIMIT $3', [projectId, after, limit + 1]);
                const rows = result.rows.slice(0, limit);
                return { data: rows.map(view), nextCursor: result.rows.length > limit ? Buffer.from(rows.at(-1).id).toString('base64url') : null };
            });
        },
        async append(scope, id, key, input) {
            const response = await executeCommand(pool, scope, 'POST /conversations/' + id + '/messages', key, input, async tx => {
                const initial = await lookup(tx, id);
                await projects.requireActive(tx, initial.project_id);
                const conversation = await lookup(tx, id, true);
                if (conversation.status !== 'active') throw apiError('STATE_CONFLICT', 'Conversation is archived.', 409);
                const attachmentIds = input.attachmentIds ?? [];
                await artifacts.validateAttachments(tx, conversation.project_id, attachmentIds);
                const artifact = await artifacts.store(tx, { ...scope, projectId: conversation.project_id }, Buffer.from(input.text, 'utf8'), 'text/plain; charset=utf-8');
                const sequence = (await tx.query('UPDATE product.conversations SET last_sequence=last_sequence+1,version=version+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING last_sequence', [id])).rows[0].last_sequence;
                const row = (await tx.query(`INSERT INTO product.messages
                    (id,workspace_id,project_id,conversation_id,sequence,author_principal_id,role,content_ref,trust_label)
                    VALUES ($1,$2,$3,$4,$5,$6,'user',$7,'user_input') RETURNING *`,
                [randomUUID(), scope.workspaceId, conversation.project_id, id, sequence, scope.principalId, artifact.id])).rows[0];
                for (const artifactId of attachmentIds) await tx.query('INSERT INTO product.message_attachments (workspace_id,project_id,message_id,artifact_id) VALUES ($1,$2,$3,$4)', [scope.workspaceId, conversation.project_id, row.id, artifactId]);
                const artifactScope = { ...scope, projectId: conversation.project_id };
                await artifacts.link(tx, artifactScope, artifact.id, 'message', row.id, 'message_content');
                for (const artifactId of attachmentIds) await artifacts.link(tx, artifactScope, artifactId, 'message', row.id, 'attachment');
                // Replay metadata excludes plaintext; exact request digest binds the supplied text.
                return { status: 201, projectId: conversation.project_id, data: messageView(row, attachmentIds) };
            });
            return { ...response, data: { ...response.data, text: input.text } };
        },
        async messages(scope, id, { limit, after }) {
            return withScopedTransaction(pool, scope, async tx => {
                const conversation = await lookup(tx, id);
                const result = await tx.query('SELECT * FROM product.messages WHERE conversation_id=$1 AND sequence>$2::bigint ORDER BY sequence LIMIT $3', [id, after ?? '0', limit + 1]);
                const rows = result.rows.slice(0, limit);
                const data = [];
                for (const row of rows) {
                    const attachments = await tx.query('SELECT artifact_id FROM product.message_attachments WHERE message_id=$1 ORDER BY artifact_id', [row.id]);
                    const bytes = await artifacts.content(tx, { ...scope, projectId: conversation.project_id }, row.content_ref);
                    data.push({ ...messageView(row, attachments.rows.map(item => item.artifact_id)), text: bytes.toString('utf8') });
                }
                return { data, nextCursor: result.rows.length > limit ? Buffer.from(rows.at(-1).sequence).toString('base64url') : null };
            });
        },
    };
}
