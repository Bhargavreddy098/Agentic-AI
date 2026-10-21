import pgvector from 'pgvector';
/** Trusted memory-owner query; never pass a browser-controlled SQL client or scope.
 * @param {import('pg').PoolClient} client
 * @param {{embedding:number[],tenantId:string,limit?:number,modelVersion:string,requestedScopes?:string[],agentId?:string|null,roleIds?:string[]}} input
 */
export async function searchVectors(client, { embedding, tenantId, limit = 20, modelVersion, requestedScopes = ['Global'], agentId = null, roleIds = [] }) {
    if (!Array.isArray(embedding) || embedding.length !== 1536 || !embedding.every(Number.isFinite))
        throw new Error('Embedding must contain 1536 finite numbers.');
    if (typeof tenantId !== 'string' || !tenantId || typeof modelVersion !== 'string' || !modelVersion || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new Error('Invalid scoped vector query.');
    if (!Array.isArray(requestedScopes) || requestedScopes.length < 1 || requestedScopes.length > 3 || !requestedScopes.every(scope => ['Global', 'Role', 'Private'].includes(scope)) || !Array.isArray(roleIds) || roleIds.length > 100 || !roleIds.every(role => typeof role === 'string' && role.length > 0 && role.length <= 128) || requestedScopes.includes('Private') && (typeof agentId !== 'string' || !agentId || agentId.length > 128))
        throw new Error('Invalid memory visibility context.');
    const result = await client.query(`SELECT m.memory_id, m.value, e.embedding <=> $1::vector AS distance
    FROM memory_embeddings e JOIN memory_records m ON m.memory_id=e.memory_id AND m.tenant_id=e.tenant_id
    WHERE e.tenant_id = $2 AND e.model_version = $3 AND m.deleted_at IS NULL
      AND m.scope = ANY($7::text[])
      AND (m.scope = 'Global' OR (m.scope = 'Private' AND m.owner_agent_id = $5)
        OR (m.scope = 'Role' AND m.role_id = ANY($6::text[])))
    ORDER BY e.embedding <=> $1::vector LIMIT $4`, [pgvector.toSql(embedding), tenantId, modelVersion, limit, agentId, roleIds, requestedScopes]);
    return result.rows;
}
