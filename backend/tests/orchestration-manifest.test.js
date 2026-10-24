import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('Stage 07 supplemental frontend manifest matches the canonical approved route set',()=>{
 const manifest=JSON.parse(readFileSync('docs/backend/api/frontend-stage07.manifest.json','utf8'));
 const canonical=readFileSync('docs/backend/05-API-CONTRACTS.md','utf8');
 assert.equal(manifest.routes.length,12);const seen=new Set();
 for(const route of manifest.routes){const key=route.method+' '+route.path;assert.ok(!seen.has(key));seen.add(key);assert.ok(canonical.includes(route.method+' `'+route.path+'`'),key);assert.ok(route.requestDto);assert.ok(route.responseDto);assert.equal(route.csrfRequired,route.method==='POST');assert.equal(route.idempotencyKeyRequired,route.method==='POST');assert.equal(route.ifMatchRequired,false);assert.ok(readFileSync(route.implementationFile,'utf8'));}
 assert.equal(manifest.routes.filter(r=>r.frontendReady).length,11);assert.equal(manifest.routes.find(r=>r.path==='/goals/:goalId/runs').frontendReady,false);
});
