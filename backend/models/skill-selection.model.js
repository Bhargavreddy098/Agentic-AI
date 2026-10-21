import { SkillSelectionRequestSchema, QualifiedSkillSelectionSchema } from '../schemas/skill-selection.schema.js';
import { validateContext, parseSchema } from './_shared.js';

export function createSkillSelectionModel() {
    return {
        async selectQualifiedSkills(request, context) {
            validateContext(context);
            const req = parseSchema(SkillSelectionRequestSchema, request, 'Invalid skill selection request');
            const requestedSet = new Set(req.requestedSkillRefs);
            const omittedReasons = [];
            const eligible = [];

            for (const candidate of req.availableSkillRefs) {
                if (!candidate.verified) {
                    omittedReasons.push({ skillId: candidate.skillId, reason: 'unverified' });
                    continue;
                }
                if (candidate.revoked) {
                    omittedReasons.push({ skillId: candidate.skillId, reason: 'revoked' });
                    continue;
                }
                if (!candidate.authorized) {
                    omittedReasons.push({ skillId: candidate.skillId, reason: 'unauthorized' });
                    continue;
                }
                if (requestedSet.size > 0 && !requestedSet.has(candidate.skillId)) {
                    omittedReasons.push({ skillId: candidate.skillId, reason: 'not_requested' });
                    continue;
                }
                eligible.push(candidate);
            }

            eligible.sort((a, b) => a.skillId.localeCompare(b.skillId) || a.version.localeCompare(b.version));

            const selectedSkills = [];
            const selectedInstructionRefs = [];
            let tokenCount = 0;

            for (const skill of eligible) {
                if (tokenCount + skill.tokenCount > req.maxContextTokens) {
                    omittedReasons.push({ skillId: skill.skillId, reason: 'token_budget_exceeded' });
                    continue;
                }
                tokenCount += skill.tokenCount;
                selectedSkills.push({
                    skillId: skill.skillId,
                    version: skill.version,
                    manifestDigest: skill.manifestDigest,
                });
                selectedInstructionRefs.push(skill.instructionRef);
            }

            return parseSchema(QualifiedSkillSelectionSchema, {
                selectedSkills,
                selectedInstructionRefs,
                omittedReasons,
                tokenCount,
            });
        },
    };
}
