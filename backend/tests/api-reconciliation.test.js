import {createClient} from '../../frontend/my-app/lib/api/client.ts';
import {parseCommand,pathParamsFor} from '../../frontend/my-app/components/console/parse.ts';
import {buildBody} from '../../frontend/my-app/components/console/bodies.ts';
import {buildQuery} from '../../frontend/my-app/components/console/query.ts';
import {uploadFile} from '../../frontend/my-app/lib/api/upload.ts';
import {createConversations} from '../src/modules/conversations/index.js';
import {createUploads} from '../src/modules/artifacts/uploads.js';
import {createPolicy,createGrants,createBudgets} from '../src/modules/governance/index.js';
import {createProviders} from '../src/modules/providers/index.js';
import {createEnvironmentSecrets} from '../src/modules/providers/secrets.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {mkdtemp,writeFile,readFile,rm,symlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createPostgresFixture} from './fixtures/postgres.js';
import {createIdentity} from '../src/modules/identity/index.js';
import {createProjects} from '../src/modules/projects/index.js';
import {createArtifacts} from '../src/modules/artifacts/index.js';
import {createSnapshots} from '../src/modules/projects/snapshots.js';
import {createExports} from '../src/modules/artifacts/exports.js';
import {createSettings} from '../src/modules/operations/settings.js';
import {createAudit} from '../src/modules/governance/audit.js';
import {createOperations} from '../src/modules/operations/index.js';
import {createArtifactStore} from '../src/platform/blob-store/index.js';
import {withScopedTransaction} from '../src/platform/database/transaction.js';
import {exportLocal} from '../src/platform/repository/export.js';
import {createApp} from '../app.js';
import {loadConfig} from '../config/env.js';

test('canonical Stage 01–06 gaps use real PostgreSQL, native snapshots and safe native export',{timeout:120000},async t=>{
 const f=await createPostgresFixture({poolMax:4});const scopes=[0,1].map(()=>({workspaceId:randomUUID(),principalId:randomUUID()}));
 const directory=await mkdtemp(join(tmpdir(),'asi-api-reconcile-'));let server,blobs;
 try{
  const git=args=>promisify(execFile)('git.exe',['-C',directory,...args],{windowsHide:true});await git(['init']);await writeFile(join(directory,'source.txt'),'Committed content\n');await git(['add','source.txt']);await git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture']);
  blobs=await createArtifactStore();const pool=f.db.pool,identity=createIdentity({pool}),projects=createProjects({pool}),artifacts=createArtifacts({pool,blobs,projects}),audit=createAudit({pool}),settings=createSettings({pool,audit}),snapshots=createSnapshots({pool,projects,artifacts}),exports=createExports({pool,artifacts}),operations=createOperations({pool});
  const conversations=createConversations({pool,projects,artifacts}),uploads=createUploads({pool,projects,artifacts,operations}),policies=createPolicy({pool,audit}),grants=createGrants({pool,audit}),budgets=createBudgets({pool,audit});
  const providers=createProviders({pool,audit,policies,grants,budgets,operations,artifacts,secrets:createEnvironmentSecrets({env:{}})});
  const config=loadConfig({DATABASE_URL:f.runtimeUrl.href});server=createApp({config,services:{identity,projects,artifacts,settings,snapshots,exports,operations,conversations,uploads,policies,grants,budgets,providers}}).listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`,clients=[];
  for(const s of scopes){await f.owner.query("INSERT INTO identity.principals(principal_id,kind,display_name) VALUES($1,'local_user','Fixture')",[s.principalId]);await f.owner.query('INSERT INTO identity.workspaces(workspace_id,owner_principal_id,slug,display_name) VALUES($1,$2,$3,$4)',[s.workspaceId,s.principalId,'w-'+s.workspaceId,'Fixture']);const r=await fetch(base+'/api/v1/session/bootstrap',{method:'POST',headers:{origin:config.allowedOrigins[0],'content-type':'application/json'},body:JSON.stringify(await identity.issueChallenge(s))});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/^asi_local_session=/);clients.push({cookie:r.headers.get('set-cookie').split(';')[0],origin:config.allowedOrigins[0],'x-csrf-token':(await r.json()).data.csrfToken});}
  const call=(path,method='GET',body,headers={},client=0)=>fetch(base+'/api/v1'+path,{method,headers:{...clients[client],'content-type':'application/json','idempotency-key':randomUUID(),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const project=(await (await call('/projects','POST',{name:'Snapshot fixture',kind:'greenfield'})).json()).data;
  const rootId=randomUUID();await f.owner.query("INSERT INTO identity.workspace_roots(id,workspace_id,authorized_by,canonical_path,repository_kind) VALUES($1,$2,$3,$4,'git')",[rootId,scopes[0].workspaceId,scopes[0].principalId,directory]);await f.owner.query('UPDATE product.projects SET workspace_root_ref=$2 WHERE project_id=$1',[project.id,rootId]);
  await t.test('canonical health DTOs and compatibility aliases are distinct',async()=>{assert.deepEqual(await (await fetch(base+'/health/live')).json(),{status:'live'});assert.equal((await (await fetch(base+'/api/v1/health/live')).json()).status,'ok');});
  await t.test('settings require owner, CSRF, CAS, strict DTO, durable replay and policy consistency',async()=>{
   assert.equal((await fetch(base+'/api/v1/settings')).status,401);const first=await (await call('/settings')).json();assert.equal(first.data.version,'1');
   assert.equal((await call('/settings','PATCH',{defaultAutonomy:'plan_only'})).status,428);
   assert.equal((await call('/settings','PATCH',{defaultAutonomy:'plan_only'},{'if-match':'"1"','x-csrf-token':''})).status,403);
   assert.equal((await call('/settings','PATCH',{unknown:true},{'if-match':'"1"'})).status,400);
   assert.equal((await call('/settings','PATCH',{privacy:{denyEgress:false,allowedEgressHosts:[]}},{'if-match':'"1"'})).status,409);
   const body={defaultAutonomy:'ask_before_every_change'},h={'if-match':'"1"','idempotency-key':'settings-replay'};
   const updated=await call('/settings','PATCH',body,h);assert.equal(updated.status,200);const value=(await updated.json()).data;assert.equal(value.version,'2');assert.equal((await (await call('/settings','PATCH',body,h)).json()).data.version,'2');
   assert.equal((await call('/settings','PATCH',{defaultAutonomy:'plan_only'},h)).status,409);
   assert.equal((await call('/settings','PATCH',body,{'if-match':'"1"'})).status,412);
   assert.equal((await createSettings({pool,audit}).read(scopes[0])).defaultAutonomy,'ask_before_every_change');assert.equal((await createSettings({pool,audit}).read(scopes[1])).defaultAutonomy,'plan_only');
  });
  await t.test('snapshot operation replays exact scoped durable snapshot and encrypted bytes',async()=>{
   const path='/projects/'+project.id+'/snapshots',body={includeUncommitted:false},h={'idempotency-key':'snapshot-replay'};
   assert.equal((await call(path,'POST',{...body,path:directory})).status,400);assert.equal((await call(path,'POST',body,{},1)).status,404);
   const r=await call(path,'POST',body,h);assert.equal(r.status,202);assert.match(r.headers.get('location'),/^\/api\/v1\/operations\//);const op=(await r.json()).data;assert.equal(op.state,'succeeded');assert.deepEqual((await (await call(path,'POST',body,h)).json()).data,op);
   assert.equal((await call(path,'POST',{includeUncommitted:true},h)).status,409);
   const snapshot=(await f.owner.query('SELECT * FROM product.repository_snapshots WHERE id=$1',[op.resourceId])).rows[0];assert.equal(snapshot.project_id,project.id);assert.equal(snapshot.index_status,'not_indexed');
   const artifact=await withScopedTransaction(pool,scopes[0],tx=>artifacts.candidateContent(tx,{...scopes[0],projectId:project.id},snapshot.artifact_id));assert.equal(Buffer.from(JSON.parse(artifact).files[0].content,'base64').toString(),'Committed content\n');
   assert.equal((await operations.read(scopes[0],op.id)).resourceId,op.resourceId);await assert.rejects(operations.read(scopes[1],op.id),{code:'NOT_FOUND'});
   await f.owner.query('UPDATE identity.workspace_roots SET revoked_at=clock_timestamp() WHERE id=$1',[rootId]);assert.equal((await call(path,'POST',body)).status,403);
   assert.deepEqual((await (await call(path,'POST',body,h)).json()).data,op);
  });
  await t.test('native exports bind authorized destination, refuse overwrite and never redispatch replay',async()=>{
   const bytes=Buffer.from('Export fixture content');const artifact=await withScopedTransaction(pool,scopes[0],tx=>artifacts.store(tx,{...scopes[0],projectId:project.id},bytes,'text/plain'));
   const dest=randomUUID(),destination=join(directory,'exported.txt');await f.owner.query('INSERT INTO identity.export_destinations(id,workspace_id,project_id,authorized_by,canonical_path) VALUES($1,$2,$3,$4,$5)',[dest,scopes[0].workspaceId,project.id,scopes[0].principalId,destination]);
   const path='/artifacts/'+artifact.id+'/export';assert.equal((await call(path,'POST',{destinationRef:destination})).status,400);assert.equal((await call(path,'POST',{destinationRef:randomUUID()})).status,403);
   const h={'idempotency-key':'export-once'},body={destinationRef:dest};const r=await call(path,'POST',body,h);assert.equal(r.status,202);const op=(await r.json()).data;assert.equal((await operations.read(scopes[0],op.id)).state,'succeeded');assert.deepEqual(await readFile(destination),bytes);
   assert.deepEqual((await (await call(path,'POST',body,h)).json()).data,op);await assert.rejects(exportLocal(destination,Buffer.from('overwrite')));assert.deepEqual(await readFile(destination),bytes);
   const junction=join(directory,'redirect');await symlink(tmpdir(),junction,'junction');try{await assert.rejects(exportLocal(join(junction,'asi-escape-'+randomUUID()),bytes));}finally{await rmdir(junction);}
   await f.owner.query('UPDATE identity.export_destinations SET revoked_at=clock_timestamp() WHERE id=$1',[dest]);assert.equal((await call(path,'POST',body)).status,403);
  });
  await t.test('artifact listing supports project-scoped limit/cursor and rejects reserved future filters',async()=>{
   const another=(await projects.create(scopes[0],randomUUID(),{name:'Different project',kind:'greenfield'})).data;
   const excluded=await withScopedTransaction(pool,scopes[0],tx=>artifacts.store(tx,{...scopes[0],projectId:another.id},Buffer.from('Other project'),'text/plain'));
   const path='/projects/'+project.id+'/artifacts';
   const first=await call(path+'?limit=1');assert.equal(first.status,200);const page=await first.json();assert.equal(page.data.length,1);assert.ok(page.meta.nextCursor);
   const second=await (await call(path+'?limit=1&cursor='+encodeURIComponent(page.meta.nextCursor))).json();assert.equal(second.data.length,1);assert.notEqual(second.data[0].id,page.data[0].id);
   for(const item of [...page.data,...second.data]){assert.equal(item.projectId,project.id);assert.notEqual(item.id,excluded.id);}
   assert.equal((await call(path+'?kind=source')).status,400);assert.equal((await call(path+'?runId='+randomUUID())).status,400);
   assert.equal((await call(path+'?limit=1', 'GET',undefined,{},1)).status,404);
  });
  await t.test('frontend parser, body builder and transport drive real Stage 01–06 APIs',async()=>{
   const client=createClient({getCsrfToken:()=>clients[0]['x-csrf-token'],transport:(url,init)=>fetch(base+url,{...init,headers:{...init.headers,cookie:clients[0].cookie,origin:clients[0].origin}})});
   const command=async text=>{const parsed=parseCommand(text);assert.equal(parsed.ok,true,text);const built=buildBody(parsed.route,parsed.positional,parsed.flags);assert.ok(!('error' in built),text);const result=await client.request(parsed.route,{pathParams:pathParamsFor(parsed.route,parsed.positional),query:buildQuery(parsed.route,parsed.flags),ifMatch:parsed.flags['if-match'],...(built.kind==='json'?{body:built.body}:{})});assert.equal(result.ok,true,JSON.stringify(result));return result;};
   assert.deepEqual((await command('health live')).data,{status:'live'});assert.ok((await command('get session')).data.principalId);
   const project=(await command('create project "Frontend transport"')).data;
   const patched=await command('patch project '+project.id+' --name "Renamed" --if-match 1');assert.equal(patched.data.name,'Renamed');
   const list=await command('list projects --limit 1');assert.equal(list.data.length,1);assert.ok(list.meta.nextCursor);const next=await command('list projects --limit 1 --cursor '+list.meta.nextCursor);assert.notEqual(list.data[0].id,next.data[0].id);
   const conversation=(await command('create conversation '+project.id+' --title "Frontend conversation"')).data;
   const message=(await command('send message '+conversation.id+' --text "Real message content"')).data;assert.equal(message.text,'Real message content');
   const bytes=new TextEncoder().encode('Selected file 世界');
   const uploaded=await uploadFile(client,project.id,{name:'fixture.txt',type:'text/plain',size:bytes.length,arrayBuffer:async()=>bytes.buffer});assert.equal(uploaded.data.state,'succeeded');
   const download=await command('artifact content '+uploaded.data.resourceId);assert.equal(new TextDecoder().decode(download.data),'Selected file 世界');
   const settings=(await command('get settings')).data;await command('patch settings --default-autonomy plan_only --if-match '+settings.version);
   await command('create budget '+project.id+' --scope-kind project --limit-micro-usd 10000 --reason "Frontend qualification"');
   assert.equal((await command('list budgets '+project.id)).data[0].limitMicroUsd,'10000');await command('list providers');await command('list models');
   const provider=(await command(`create provider "Frontend provider" --kind openai --endpoint-policy '{"baseUrl":"https://api.openai.com/v1"}' --privacy-policy '{"allowedClassifications":["public","internal"],"providerTraining":false,"retention":"none"}'`)).data;
   assert.equal(provider.kind,'openai');assert.equal(provider.credentialConfigured,false);
   await command('patch provider '+provider.id+' --display-name "Updated provider" --if-match '+provider.version);
   await command('get provider '+provider.id);
  });
  await t.test('trusted native commands register only opaque scoped references',async()=>{
   await f.owner.query("UPDATE identity.principals SET status='revoked' WHERE principal_id=$1",[scopes[1].principalId]);
   const run=promisify(execFile),env={...process.env,DATABASE_URL:f.runtimeUrl.href};
   const registered=await run(process.execPath,['scripts/authorize-root.mjs','--root',directory],{env,windowsHide:true});
   assert.match(registered.stdout,/Authorized workspaceRootRef: [a-f0-9-]{36}/);
   const ref=registered.stdout.trim().split(' ').at(-1);assert.equal((await f.owner.query('SELECT workspace_id FROM identity.workspace_roots WHERE id=$1',[ref])).rows[0].workspace_id,scopes[0].workspaceId);
   const destination=await run(process.execPath,['scripts/authorize-export.mjs','--project-id',project.id,'--destination',join(directory,'native-export.txt')],{env,windowsHide:true});
   assert.match(destination.stdout,/Authorized destinationRef: [a-f0-9-]{36}/);
   const id=destination.stdout.trim().split(' ').at(-1);assert.equal((await f.owner.query('SELECT project_id FROM identity.export_destinations WHERE id=$1',[id])).rows[0].project_id,project.id);
  });
 }finally{if(server)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await blobs?.close();await f.close();for(const scope of scopes){const target=join(process.cwd(),'data','artifacts',scope.workspaceId);assert.ok(target.startsWith(join(process.cwd(),'data','artifacts')+ '\\'));await rm(target,{recursive:true,force:true});}assert.ok(directory.startsWith(join(tmpdir(),'asi-api-reconcile-')));await rm(directory,{recursive:true,force:true});}
});

