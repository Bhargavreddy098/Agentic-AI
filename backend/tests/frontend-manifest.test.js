import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildFrontendManifest,renderFrontendManifest} from '../../scripts/export-frontend-manifest.mjs';
test('frontend API manifest is current, complete for registered Stage 01–06 routes and explicit about aliases',()=>{
 const actual=buildFrontendManifest();assert.deepEqual(JSON.parse(readFileSync('docs/backend/api/frontend-stage01-06.manifest.json','utf8')),actual);
 assert.equal(readFileSync('docs/backend/22-FRONTEND-API-RECONCILIATION.md','utf8'),renderFrontendManifest(actual));
 const find=(method,path)=>actual.routes.find(r=>r.method===method&&r.canonicalRoute===path);
 assert.equal(actual.authentication.cookieName,'asi_local_session');
 assert.equal(find('POST','/api/v1/projects/:projectId/snapshots').successStatus,202);
 assert.equal(find('POST','/api/v1/artifacts/:artifactId/export').successStatus,202);
 assert.equal(find('PATCH','/api/v1/settings').authProfile,'Owner-H');
 assert.equal(find('PATCH','/api/v1/settings').ifMatchRequired,true);
 assert.equal(find('PUT','/api/v1/uploads/:uploadId/content').idempotencyKeyRequired,false);
 assert.equal(find('GET','/health/live').authProfile,'Public');
 assert.ok(!find('GET','/api/v1/health/live'));
 assert.ok(actual.compatibilityAliases.some(r=>r.path==='/api/v1/health/live'));
 for(const r of actual.routes){assert.ok(r.requestDto);assert.ok(r.responseDto);assert.ok(r.implementationFile);assert.ok(['Public','Owner-R','Owner-W','Owner-H'].includes(r.authProfile));}
});
