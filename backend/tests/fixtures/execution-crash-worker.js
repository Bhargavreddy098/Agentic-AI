// Test-only child process. It never receives production credentials or scope.
import {createContainer} from '../../src/bootstrap/container.js';
import {loadConfig} from '../../config/env.js';
import {withScopedTransaction} from '../../src/platform/database/transaction.js';
import {createAudit} from '../../src/modules/governance/audit.js';
import {createOrchestration} from '../../src/modules/orchestration/index.js';
const input=JSON.parse(process.env.STAGE07_CRASH_FIXTURE);
const container=await createContainer({config:loadConfig({NODE_ENV:'test',DATABASE_URL:process.env.TEST_DATABASE_URL})});
const database=container.database;
const hang=async(label,data)=>{process.send?.({label,...data});await new Promise(()=>{});};
const service=createOrchestration({pool:database.pool,audit:createAudit({pool:database.pool}),artifacts:container.services.artifacts,qualificationMode:true,fault:async(label,data)=>{if(input.phase===label)await hang(label,data);}});
if(input.phase==='before-admission-commit')await service.admitFixture(input.scope,input.key,input.admission);
else {
 const assignment=await service.claim(input.scope,input.owner);
 if(!assignment)throw new Error('No fixture task available');
 if(input.phase==='after-claim')await hang(input.phase,{assignment});
 const effect=await service.prepareEffect(input.scope,assignment,{index:0,toolId:input.toolId,targetRef:'fixture:crash',argumentsDigest:'d'.repeat(64)});
 if(input.phase==='after-prepare')await hang(input.phase,{assignment,effect});
 await service.dispatchEffect(input.scope,assignment,effect.id);
 if(input.phase==='after-dispatch')await hang(input.phase,{assignment,effect});
 const receiptArtifact=await withScopedTransaction(database.pool,{...input.scope,projectId:input.admission.projectId},tx=>container.services.artifacts.store(tx,{...input.scope,projectId:input.admission.projectId},Buffer.from(JSON.stringify({schemaVersion:1,effectId:effect.id,inputDigest:effect.inputDigest,runEpoch:assignment.runEpoch,taskEpoch:assignment.taskEpoch,outcome:'succeeded'})),'application/json'));
 await service.receipt(input.scope,assignment,{effectId:effect.id,inputDigest:effect.inputDigest,receiptRef:receiptArtifact.id});
 if(input.phase==='after-receipt')await hang(input.phase,{assignment,effect});
 await service.finish(input.scope,assignment);
 await hang(input.phase,{assignment,effect});
}
