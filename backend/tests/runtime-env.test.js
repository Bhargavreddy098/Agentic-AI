import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {loadRuntimeEnvironment} from '../config/runtime-env.js';
test('runtime environment cannot be replaced by the administrator/general file',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'asi-env-'));
 try{await writeFile(join(directory,'.env.runtime'),'DATABASE_URL=postgresql://runtime.invalid/app\nASI_PORT=3100\n');await writeFile(join(directory,'.env'),'DATABASE_URL=postgresql://admin.invalid/postgres\nASI_PORT=4400\nMODEL_NAME=fixture\n');
 const env={ASI_PORT:'3201'};loadRuntimeEnvironment({env,directory});assert.equal(env.DATABASE_URL,'postgresql://runtime.invalid/app');assert.equal(env.ASI_PORT,'3201');assert.equal(env.MODEL_NAME,'fixture');
 const missing={};loadRuntimeEnvironment({env:missing,directory:join(directory,'missing')});assert.deepEqual(missing,{});
 }finally{assert.ok(directory.startsWith(join(tmpdir(),'asi-env-')));await rm(directory,{recursive:true,force:true});}
});
