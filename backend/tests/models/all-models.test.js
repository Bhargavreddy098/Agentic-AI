import test from 'node:test';
import assert from 'node:assert/strict';
import * as models from '../../models/index.js';
import * as schemas from '../../schemas/index.js';

const CTX_A = {
    tenantId: 'tenant-alpha',
    principalId: 'principal-1',
    requestId: 'req-1',
    commandId: 'cmd-1',
    now: '2026-10-21T12:00:00.000Z',
};

const CTX_B = {
    tenantId: 'tenant-beta',
    principalId: 'principal-2',
    requestId: 'req-2',
    commandId: 'cmd-2',
    now: '2026-10-21T12:00:00.000Z',
};

const DIGEST_A = 'a'.repeat(64);

test('all 43 model families and schema exports are present and instantiate cleanly', () => {
    const factories = Object.keys(models).filter(
        key => key.startsWith('create') && key.endsWith('Model') && typeof models[key] === 'function'
    );
    const schemaExports = Object.keys(schemas).filter(
        key => key.endsWith('Schema') && typeof schemas[key] === 'object'
    );

    assert.equal(factories.length, 46, 'Expected all 46 domain model factory exports across 43 model families');
    assert.ok(schemaExports.length >= 43, `Expected at least 43 domain schema exports, found ${schemaExports.length}`);

    for (const factoryName of factories) {
        const instance = models[factoryName]();
        assert.equal(typeof instance, 'object', `Factory ${factoryName} must return an object`);
        const methods = Object.keys(instance).filter(k => typeof instance[k] === 'function');
        assert.ok(methods.length > 0, `Factory ${factoryName} must expose domain methods`);
    }
});


test('Core, Memory, Orchestrator, Inference, Episode, ToolRuntime, and Specialist models enforce schemas, tenant isolation, CAS, and domain invariants', async () => {
    // 1. skill
    const skillModel = models.createSkillModel();
    await skillModel.registerCatalogSkill({
        skillId: 'skill-1',
        version: '1.0.0',
        publisherId: 'pub-1',
        manifestDigest: DIGEST_A,
        signatureVerified: true,
        revocationState: 'active',
        catalogRevision: 1,
        capabilityRefs: ['cap-read'],
    }, CTX_A);
    assert.equal(await skillModel.getSkill('skill-1', CTX_B), null);
    const prop = await skillModel.proposeInstall({
        proposalId: 'prop-1',
        skillId: 'skill-1',
        version: '1.0.0',
        publisherId: 'pub-1',
        manifestDigest: DIGEST_A,
        requestedCapabilityRefs: ['cap-read'],
        catalogEntryRef: 'cat-1',
        expectedCatalogRevision: 1,
        policyDecisionRef: 'pol-1',
        reviewState: 'pending',
        revocationState: 'active',
    }, CTX_A);
    assert.equal(prop.status, 'created');
    assert.equal(prop.record.installed, false);

    // 2. project
    const projectModel = models.createProjectModel();
    const proj = await projectModel.createProject({
        projectId: 'proj-1',
        conversationId: 'conv-1',
        title: 'Microservices Migration',
        goalRefs: [{ goalId: 'goal-1', required: true, verified: true }],
    }, CTX_A);
    assert.equal(proj.status, 'created');
    const projRev = await projectModel.reviseProject({
        projectId: 'proj-1',
        status: 'completed',
    }, 1, CTX_A);
    assert.equal(projRev.status, 'updated');
    assert.equal(projRev.record.version, 2);

    // 3. memory-branch
    const mbModel = models.createMemoryBranchModel();
    const mb = await mbModel.createBranch({
        branchId: 'br-1',
        expiresAt: '2026-10-22T12:00:00.000Z',
        grantRefs: ['grant-1'],
        visibilityScope: 'Private',
        memoryRefs: ['mem-1'],
    }, CTX_A);
    assert.equal(mb.status, 'created');
    const qBranch = await mbModel.queryBranch({
        branchId: 'br-1',
        requestedScopeRefs: ['Private'],
        queryRef: 'q-1',
        expectedBranchVersion: 1,
        limit: 10,
    }, CTX_A);
    assert.deepEqual(qBranch.ancestry, ['br-1']);

    // 4. worker-score
    const wsModel = models.createWorkerScoreModel();
    await wsModel.recordWorkerScore({
        workerId: 'worker-1',
        sampleCount: 20,
        qualityScore: 0.95,
        latencyMsP95: 150,
        costMicroUsdAvg: 500,
        healthy: true,
        hasCurrentGrant: true,
        hasCapacity: true,
        policyAllowed: true,
        evidenceRefs: ['ev-1'],
        measuredAt: '2026-10-21T11:00:00.000Z',
        validUntil: '2026-10-22T12:00:00.000Z',
    }, CTX_A);
    const ranked = await wsModel.rankEligibleWorkers(undefined, CTX_A);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].eligibility, 'eligible');

    // 5. model-routing
    const mrModel = models.createModelRoutingModel();
    const mr = await mrModel.selectApprovedModel({
        taskClass: 'reasoning',
        requiredPrivacyTier: 'zero_retention',
        policyDecisionRef: 'pol-1',
        budgetReservationRef: 'bud-1',
        qualifiedCandidateModelRefs: [
            { modelRef: 'std-1', privacyTier: 'standard', policyApproved: true, qualityScore: 0.99, costMicroUsdPer1k: 100, latencyMsP95: 200 },
            { modelRef: 'zr-1', privacyTier: 'zero_retention', policyApproved: true, qualityScore: 0.91, costMicroUsdPer1k: 150, latencyMsP95: 250 },
        ],
    }, CTX_A);
    assert.equal(mr.selectedModelRef, 'zr-1');

    // 6. recovery-plan & trust-label
    const rpModel = models.createRecoveryPlanModel();
    const rp = await rpModel.deriveRecoveryPlan({
        failedTaskRef: 'task-1',
        normalizedError: 'UNKNOWN_EXTERNAL_OUTCOME',
        currentPlanRef: 'plan-1',
        attemptsAlreadyUsed: 1,
        maxAllowedAttempts: 3,
    }, CTX_A);
    assert.equal(rp.decision, 'reconcile');

    const tlModel = models.createTrustLabelModel();
    const tl = await tlModel.labelInput({
        inputRef: 'in-1',
        origin: 'web',
        observedDigest: DIGEST_A,
        contentRef: 'cnt-1',
        suspiciousPatterns: ['ignore_previous_instructions'],
    }, CTX_A);
    assert.equal(tl.instructionTrust, 'untrusted_data');
    assert.equal(tl.quarantineRef, 'quarantine-in-1');

    // 7. episode & tool-runtime
    const epModel = models.createEpisodeModel();
    const ep = await epModel.appendEpisode({
        episodeId: 'ep-1',
        sessionId: 'sess-1',
        conversationId: 'conv-1',
        sequence: 1,
        role: 'user',
        content: 'Hello',
        payloadDigest: DIGEST_A,
        occurredAt: CTX_A.now,
    }, CTX_A);
    assert.equal(ep.status, 'created');

    const trModel = models.createToolRuntimeModel();
    const exec = await trModel.executeGovernedTool({
        executionId: 'exec-1',
        toolId: 'fs.read',
        version: '1.0.0',
        inputDigest: DIGEST_A,
        leaseEpoch: 1,
        grantRef: 'grant-1',
        policyDecisionRef: 'pol-1',
        budgetReservationRef: 'bud-1',
        audience: 'tool-runtime',
        expiresAt: '2026-10-22T12:00:00.000Z',
        sandboxQualified: false,
    }, CTX_A);
    assert.equal(exec.status, 'unavailable');
});
