import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildQuery} from '../components/console/query.ts';
import {buildBody} from '../components/console/bodies.ts';
import {parseCommand} from '../components/console/parse.ts';
import {buildHeaders,beginOperation} from '../lib/api/requirements.ts';
import {findRoute} from '../lib/api/manifest.ts';
import {createSessionStore} from '../lib/session/session-store.ts';
import {uploadFile} from '../lib/api/upload.ts';

test('list commands forward approved filters and pagination, not body flags',()=>{
 const parsed=parseCommand('list projects --status active --limit 1 --cursor abc');assert.equal(parsed.ok,true);
 assert.deepEqual(buildQuery(parsed.route,parsed.flags),{status:'active',limit:'1',cursor:'abc'});
 assert.equal(buildQuery({method:'PATCH',path:'/projects/x'},{name:'private'}),undefined);
 assert.equal(parseCommand('list artifacts x --kind invented').ok,false);
 assert.equal(parseCommand('list artifacts x --run-id y').ok,false);
});
test('versions are quoted exactly once and invalid versions are refused',()=>{
 const r=findRoute('PATCH','/settings');
 for(const value of ['1','"1"'])assert.equal(buildHeaders(r,beginOperation(r),{csrfToken:'t',ifMatch:value}).headers['If-Match'],'"1"');
 assert.ok(buildHeaders(r,beginOperation(r),{csrfToken:'t',ifMatch:'v1'}).refusal);
});
test('upload commands cannot synthesize file contents or read arbitrary host paths',()=>{
 const route=findRoute('PUT','/uploads/:uploadId/content');assert.ok(buildBody(route,['x'],{file:'C:/private'}).error);
 assert.ok(buildBody(route,['x'],{bytes:'100'}).error);
 const bytes=new Uint8Array([1,2,255]);assert.equal(buildBody(route,['x'],{},bytes).bytes,bytes);
});
test('revocation sends CSRF/idempotency and failed revocation preserves session',async()=>{
 let captured;let fail=true;
 const store=createSessionStore({transport:async(url,init)=>{
  if(init?.method==='DELETE'){captured=init;return {ok:!fail,status:fail?503:204};}
  return {ok:true,status:200,json:async()=>({data:{principalId:'p',workspaceId:'w',csrfToken:'csrf',expiresAt:'2030-01-01T00:00:00Z'}})};
 }});
 let updates=0;const unsubscribe=store.subscribe(()=>updates++);await store.recover();assert.equal(updates,1);
 await assert.rejects(store.revoke());assert.equal(store.get().status,'connected');
 fail=false;await store.revoke();assert.equal(captured.headers['X-CSRF-Token'],'csrf');assert.ok(captured.headers['Idempotency-Key']);assert.equal(store.get().status,'disconnected');unsubscribe();
});
test('oversized files are refused before allocation or network dispatch',async()=>{
 let calls=0;await assert.rejects(uploadFile({request:async()=>calls++},'11111111-1111-4111-8111-111111111111',{name:'large',type:'text/plain',size:16777217,arrayBuffer:()=>{throw Error('must not allocate');}}));assert.equal(calls,0);
});
