// @ts-check
import {randomUUID} from 'node:crypto';
import {createPostgresFixture} from './postgres.js';
import {createContainer} from '../../src/bootstrap/container.js';
import {loadConfig} from '../../config/env.js';
import {defaultPolicyRules} from '../../src/modules/governance/policy.js';
import {withScopedTransaction} from '../../src/platform/database/transaction.js';
import {commandDigest} from '../../src/shared/canonicalization.js';

/** Immutable synthetic contracts only; no HTTP route can construct these fixtures. */
export async function executionFixture(){
 const fixture=await createPostgresFixture({poolMax:6});let container;
 try{
  const config=loadConfig({NODE_ENV:'test',DATABASE_URL:fixture.runtimeUrl.href});container=await createContainer({config});
  const scope={workspaceId:randomUUID(),principalId:randomUUID(),sessionId:undefined};
  await fixture.owner.query("INSERT INTO identity.principals(principal_id,kind,display_name) VALUES($1,'local_user','Stage 07 owner')",[scope.principalId]);
  await fixture.owner.query('INSERT INTO identity.workspaces(workspace_id,owner_principal_id,slug,display_name) VALUES($1,$2,$3,$4)',[scope.workspaceId,scope.principalId,randomUUID(),'Stage 07']);
  const boot=await container.services.identity.bootstrap(await container.services.identity.issueChallenge(scope));
  Object.assign(scope,await container.services.identity.authenticate(boot.token));
  const services=container.services;
  const project=(await services.projects.create(scope,randomUUID(),{name:'Stage 07 fixture',kind:'greenfield'})).data;
  const conversation=(await services.conversations.create(scope,project.id,randomUUID(),{title:'Fixture'})).data;
  const policy=(await services.policies.createRevision(scope,randomUUID(),{rules:defaultPolicyRules(),reason:'Qualification policy'})).data;
  await services.policies.activate(scope,policy.id,randomUUID(),{digest:policy.digest});
  const digest=Buffer.from(commandDigest({fixture:'stage07-v1'}),'hex');
  const goalId=randomUUID(),requirementId=randomUUID(),planId=randomUUID(),planRevisionId=randomUUID(),contractId=randomUUID(),contractRevisionId=randomUUID();
  await fixture.owner.query('INSERT INTO product.goals(id,workspace_id,project_id,conversation_id,intent) VALUES($1,$2,$3,$4,$5)',[goalId,scope.workspaceId,project.id,conversation.id,'Read-only qualification']);
  await fixture.owner.query('INSERT INTO planning.requirement_revisions(id,workspace_id,project_id,goal_id,revision,schema_version,digest,document,created_by) VALUES($1,$2,$3,$4,1,1,$5,$6,$7)',[requirementId,scope.workspaceId,project.id,goalId,digest,{},scope.principalId]);
  await fixture.owner.query('INSERT INTO planning.plans(id,workspace_id,project_id,goal_id) VALUES($1,$2,$3,$4)',[planId,scope.workspaceId,project.id,goalId]);
  await fixture.owner.query('INSERT INTO planning.plan_revisions(id,workspace_id,project_id,plan_id,revision,requirement_revision_id,digest,layers,created_by) VALUES($1,$2,$3,$4,1,$5,$6,$7,$8)',[planRevisionId,scope.workspaceId,project.id,planId,requirementId,digest,{},scope.principalId]);
  await fixture.owner.query('INSERT INTO planning.build_contracts(id,workspace_id,project_id,goal_id) VALUES($1,$2,$3,$4)',[contractId,scope.workspaceId,project.id,goalId]);
  await fixture.owner.query(`INSERT INTO planning.contract_revisions(id,workspace_id,project_id,contract_id,revision,plan_revision_id,requirement_revision_id,schema_version,canonicalizer_version,digest,document,created_by) VALUES($1,$2,$3,$4,1,$5,$6,1,'qualification-v1',$7,$8,$9)`,[contractRevisionId,scope.workspaceId,project.id,contractId,planRevisionId,requirementId,digest,{fixture:true},scope.principalId]);
  await fixture.owner.query('UPDATE planning.build_contracts SET current_revision_id=$2 WHERE id=$1',[contractId,contractRevisionId]);
  const stepIds=[randomUUID(),randomUUID()];for(let i=0;i<stepIds.length;i++)await fixture.owner.query(`INSERT INTO planning.plan_steps(id,workspace_id,project_id,plan_revision_id,step_key,objective,deliverable_schema,capabilities,budget_ceiling) VALUES($1,$2,$3,$4,$5,'Read-only fixture',$6,$7,0)`,[stepIds[i],scope.workspaceId,project.id,planRevisionId,'step'+i,{},JSON.stringify(['workspace.read'])]);
  await fixture.owner.query('INSERT INTO planning.step_dependencies(workspace_id,project_id,plan_revision_id,step_id,requires_step_id) VALUES($1,$2,$3,$4,$5)',[scope.workspaceId,project.id,planRevisionId,stepIds[1],stepIds[0]]);
  const approval=(await services.approvals.requestContract(scope,contractRevisionId,randomUUID(),{digest:digest.toString('hex')})).data;
  await services.approvals.decide(scope,approval.id,randomUUID(),{decision:'approve',digest:approval.digest,nonce:approval.nonce});
  const artifactId=randomUUID();await fixture.owner.query(`INSERT INTO product.artifacts(id,workspace_id,project_id,digest,bytes,media_type,storage_key,status,classification) VALUES($1,$2,$3,$4,0,'text/plain',$5,'available','internal')`,[artifactId,scope.workspaceId,project.id,digest,'fixture-metadata-only']);
  const snapshotId=randomUUID();await fixture.owner.query('INSERT INTO product.repository_snapshots(id,workspace_id,project_id,tree_digest,artifact_id) VALUES($1,$2,$3,$4,$5)',[snapshotId,scope.workspaceId,project.id,digest,artifactId]);
  const toolId=randomUUID();const manifest={risk:'read',egress:false,capabilities:['workspace.read'],timeoutMs:1000,retrySafe:true};await fixture.owner.query(`INSERT INTO inference.tool_definitions(id,workspace_id,name,revision,manifest,digest,qualified_at) VALUES($1,$2,'qualification.read','1',$3,$4,clock_timestamp())`,[toolId,scope.workspaceId,manifest,Buffer.from(commandDigest(manifest),'hex')]);
  await services.grants.create(scope,project.id,randomUUID(),{capability:'workspace.read',resourceScope:{},expiresAt:new Date(Date.now()+3600000).toISOString(),contractRevisionId});
  const input={projectId:project.id,contractRevisionId,repositorySnapshotId:snapshotId};
  return {fixture,container,services,config,scope,project,boot,toolId,artifactId,stepIds,input,async makeReceipt(assignment,effect){return withScopedTransaction(fixture.db.pool,{...scope,projectId:project.id},tx=>services.artifacts.store(tx,{...scope,projectId:project.id},Buffer.from(JSON.stringify({schemaVersion:1,effectId:effect.id,inputDigest:effect.inputDigest,runEpoch:assignment.runEpoch,taskEpoch:assignment.taskEpoch,outcome:'succeeded'})),'application/json'));},async newRun(){return (await services.orchestration.admitFixture(scope,randomUUID(),input)).data;},async expire(runId){await fixture.owner.query("UPDATE control.tasks SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE run_id=$1 AND state='running'",[runId]);},async close(){for(const resource of container.resources)await resource.close();await fixture.close();}};
 }catch(error){if(container)for(const resource of container.resources)await resource.close();await fixture.close();throw error;}
}
