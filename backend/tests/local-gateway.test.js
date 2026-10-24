import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createPostgresFixture} from './fixtures/postgres.js';
import {createIdentity} from '../src/modules/identity/index.js';
import {createLocalGateway} from '../src/platform/gateway/local-gateway.js';
import {get} from 'node:http';

test('native local gateway consumes a single-use proof and issues a real scoped browser session',{timeout:120000},async t=>{
 const f=await createPostgresFixture();let gateway;
 try{
 const scope={workspaceId:randomUUID(),principalId:randomUUID()};
 await f.owner.query("INSERT INTO identity.principals(principal_id,kind,display_name) VALUES($1,'local_user','Gateway qualification')",[scope.principalId]);
 await f.owner.query('INSERT INTO identity.workspaces(workspace_id,owner_principal_id,slug,display_name) VALUES($1,$2,$3,$4)',[scope.workspaceId,scope.principalId,randomUUID(),'Gateway qualification']);
 const identity=createIdentity({pool:f.db.pool});const frontendOrigin='http://127.0.0.1:3000';const options={identity,scope,frontendOrigin,allowedOrigins:[frontendOrigin]};
 await t.test('remote, unallowlisted and invalid lifetime targets fail closed',async()=>{
 await assert.rejects(createLocalGateway({...options,frontendOrigin:'http://example.com'}));await assert.rejects(createLocalGateway({...options,allowedOrigins:[]}));await assert.rejects(createLocalGateway({...options,ttlMs:0}));
 });
 gateway=await createLocalGateway(options);
 await t.test('Host, Origin, methods and unknown ticket cannot establish a session',async()=>{
 // Fetch normalizes Host; the raw HTTP client exercises an actual rebinding header.
 const hostStatus=await new Promise((resolve,reject)=>get(gateway.handoffUrl,{headers:{host:'attacker.invalid'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject));assert.equal(hostStatus,403);
 assert.equal((await fetch(gateway.handoffUrl,{redirect:'manual',headers:{origin:'https://attacker.invalid'}})).status,403);
 assert.equal((await fetch(gateway.handoffUrl,{method:'POST',redirect:'manual'})).status,405);
 assert.equal((await fetch(gateway.handoffUrl+'?redirect=https://attacker.invalid',{redirect:'manual'})).status,404);
 assert.equal((await fetch(new URL('/handoff/'+'x'.repeat(43),gateway.handoffUrl),{redirect:'manual'})).status,404);
 });
 await t.test('concurrent handoffs yield one HttpOnly cookie and no raw proof in the destination',async()=>{
 const responses=await Promise.all([fetch(gateway.handoffUrl,{redirect:'manual'}),fetch(gateway.handoffUrl,{redirect:'manual'})]);assert.deepEqual(responses.map(r=>r.status).sort(),[303,409]);
 const response=responses.find(r=>r.status===303);assert.equal(response.headers.get('location'),frontendOrigin+'/studio');assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.headers.get('cache-control'),'no-store');
 const cookie=response.headers.get('set-cookie');assert.match(cookie,/^asi_local_session=/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Path=\/api\/v1/);assert.equal(await response.text(),'');
 const token=cookie.split(';')[0].slice('asi_local_session='.length);const session=await identity.current(token);assert.equal(session.workspaceId,scope.workspaceId);assert.equal(session.principalId,scope.principalId);await assert.rejects(identity.authenticate(token,'wrong'),e=>e.code==='CSRF_FAILED');await identity.revoke(token,session.csrfToken,randomUUID());await assert.rejects(identity.authenticate(token),e=>e.code==='SESSION_EXPIRED');
 });
 await gateway.close();gateway=await createLocalGateway({...options,ttlMs:1000});await t.test('unclaimed native handoff expires and releases its listener',async()=>{assert.deepEqual(await gateway.completion,{connected:false});await gateway.close();await assert.rejects(fetch(gateway.handoffUrl));});
 }finally{await gateway?.close();await f.close();}
});
