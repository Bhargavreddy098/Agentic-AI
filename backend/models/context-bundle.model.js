import { ContextCompileRequestSchema, ContextBundleSchema } from '../schemas/context-bundle.schema.js';
import { ModelDomainError, validateContext, parseSchema, computeDigest } from './_shared.js';

export function createContextBundleModel() {
    return {
        async compileContextBundle(request, context) {
            validateContext(context);
            const req = parseSchema(ContextCompileRequestSchema, request, 'Invalid context compile request');

            for (const src of req.permittedSourceRefs) {
                if (!src.authorized) {
                    throw new ModelDomainError('POLICY_DENIED', `Unauthorized context source '${src.sourceRef}' rejected.`, 403);
                }
            }

            const groupMembers = new Map();
            for (const src of req.permittedSourceRefs) {
                if (src.toolGroupRef) {
                    const list = groupMembers.get(src.toolGroupRef) ?? [];
                    list.push(src);
                    groupMembers.set(src.toolGroupRef, list);
                }
            }

            let tokenCount = req.stablePrefixTokens;
            if (tokenCount > req.maxContextTokens) {
                throw new ModelDomainError('INVALID_INPUT', 'Stable prefix exceeds maxContextTokens.', 400);
            }

            const orderedSourceRefs = [];
            const omittedRefs = [];
            const trustLabels = {};
            const processedGroups = new Set();

            for (const src of req.permittedSourceRefs) {
                if (src.toolGroupRef) {
                    if (processedGroups.has(src.toolGroupRef)) continue;
                    processedGroups.add(src.toolGroupRef);
                    const members = groupMembers.get(src.toolGroupRef) ?? [];
                    const groupTokens = members.reduce((sum, m) => sum + m.tokenCount, 0);
                    if (tokenCount + groupTokens > req.maxContextTokens) {
                        for (const m of members) {
                            omittedRefs.push({ sourceRef: m.sourceRef, reason: 'incomplete_tool_group' });
                        }
                        continue;
                    }
                    tokenCount += groupTokens;
                    for (const m of members) {
                        orderedSourceRefs.push(m.sourceRef);
                        trustLabels[m.sourceRef] = m.trustLabel;
                    }
                } else {
                    if (tokenCount + src.tokenCount > req.maxContextTokens) {
                        omittedRefs.push({ sourceRef: src.sourceRef, reason: 'token_budget_exceeded' });
                        continue;
                    }
                    tokenCount += src.tokenCount;
                    orderedSourceRefs.push(src.sourceRef);
                    trustLabels[src.sourceRef] = src.trustLabel;
                }
            }

            return parseSchema(ContextBundleSchema, {
                orderedSourceRefs,
                compiledArtifactRef: `ctx-bundle-${req.stablePrefixRef}`,
                prefixHash: computeDigest(req.stablePrefixRef),
                tokenCount,
                omittedRefs,
                trustLabels,
            });
        },
    };
}
