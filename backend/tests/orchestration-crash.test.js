import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {executionFixture} from './fixtures/execution.js';
const worker=new URL('./fixtures/execution-crash-worker.js',import.meta.url);
test('Stage 07 actual process death at durable boundaries', {timeout:120000},async t=>{
 const f=await executionFixture();try{
 for(const phase of ['before-admission-commit','after-claim','after-prepare','after-dispatch','before-receipt-commit','after-receipt','after-finish'])await t.test(phase,async()=>{
  const r=phase==='before-admission-commit'?null:await f.newRun();const key=randomUUID();
  const child=fork(worker,[],{env:{...process.env,TEST_DATABASE_URL:f.fixture.runtimeUrl.href,STAGE07_CRASH_FIXTURE:JSON.stringify({phase,scope:f.scope,key,admission:f.input,owner:randomUUID(),toolId:f.toolId,artifactId:f.artifactId})},stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
  let timeout;try{
   const state=await Promise.race([once(child,'message').then(([value])=>value),once(child,'exit').then(()=>{throw new Error('Crash worker exited before its boundary');}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Crash boundary timeout')),12000);})]);clearTimeout(timeout);child.kill('SIGKILL');await once(child,'exit');
   if(!r){const accepted=await f.services.orchestration.admitFixture(f.scope,key,f.input);assert.equal(accepted.data.state,'queued');await f.services.orchestration.control(f.scope,accepted.data.id,'cancel',randomUUID(),{reason:'fixture complete'});return;}
   await f.expire(r.id);await f.services.orchestration.recover(f.scope);const current=await f.services.orchestration.read(f.scope,r.id);
   if(['after-dispatch','before-receipt-commit'].includes(phase)){assert.equal(current.data.state,'blocked');assert.equal((await f.services.orchestration.children(f.scope,r.id,'effects',{limit:50,after:null})).data[0].state,'unknown');assert.equal(await f.services.orchestration.claim(f.scope,randomUUID()),null);return;}
   const next=await f.services.orchestration.claim(f.scope,randomUUID());assert.equal(next.runId,r.id);if(phase==='after-finish')assert.equal(next.stepKey,'step1');else assert.equal(next.stepKey,'step0');
   if(phase==='after-receipt'){const effect=(await f.services.orchestration.children(f.scope,r.id,'effects',{limit:50,after:null})).data[0];assert.equal(effect.state,'succeeded');await assert.rejects(f.services.orchestration.dispatchEffect(f.scope,next,effect.id));}
   if(phase==='after-prepare'){const effect=(await f.services.orchestration.children(f.scope,r.id,'effects',{limit:50,after:null})).data[0];assert.equal(effect.state,'prepared');await f.services.orchestration.dispatchEffect(f.scope,next,effect.id);const proof=await f.makeReceipt(next,effect);await f.services.orchestration.receipt(f.scope,next,{effectId:effect.id,inputDigest:effect.inputDigest,receiptRef:proof.id});}
   await f.services.orchestration.finish(f.scope,next);if(phase!=='after-finish')await f.services.orchestration.finish(f.scope,await f.services.orchestration.claim(f.scope,randomUUID()));assert.equal((await f.services.orchestration.read(f.scope,r.id)).data.state,'verifying');assert.ok(state.assignment);
  }finally{clearTimeout(timeout);if(child.exitCode===null)child.kill('SIGKILL');}
 });
 }finally{await f.close();}
});
