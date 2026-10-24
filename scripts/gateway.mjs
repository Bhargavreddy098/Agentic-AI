import pg from 'pg';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {loadConfig} from '../backend/config/env.js';
import {createIdentity} from '../backend/src/modules/identity/index.js';
import {createLocalGateway} from '../backend/src/platform/gateway/local-gateway.js';

let pool,gateway;
try{
 if(process.platform!=='win32')throw new Error('Windows local gateway required');
 const config=loadConfig();const args=process.argv.slice(2);
 if(args.length!==0&&(args.length!==2||args[0]!=='--origin'))throw new Error('Use --origin with an existing allowed frontend origin');
 const origin=args[1]??config.allowedOrigins.find(value=>new URL(value).port==='3000')??config.allowedOrigins[0];
 if(!config.allowedOrigins.includes(origin))throw new Error('Frontend origin is not allowlisted');
 const target=new URL(origin);if(target.protocol!=='http:'||target.origin!==origin||!['127.0.0.1','localhost','[::1]'].includes(target.hostname))throw new Error('Gateway requires a loopback frontend');
 const ready=await fetch(origin+'/health/ready',{redirect:'error',signal:AbortSignal.timeout(5000)});
 if(!ready.ok||(await ready.json()).ready!==true)throw new Error('Start the local backend and frontend before opening the gateway');
 const page=await fetch(origin+'/studio',{redirect:'error',signal:AbortSignal.timeout(5000)});if(!page.ok)throw new Error('Local frontend is unavailable');
 pool=new pg.Pool({connectionString:config.DATABASE_URL,connectionTimeoutMillis:5000,max:2});
 const owners=(await pool.query("SELECT w.workspace_id,w.owner_principal_id FROM identity.workspaces w JOIN identity.principals p ON p.principal_id=w.owner_principal_id WHERE p.kind='local_user' AND p.status='active' ORDER BY w.created_at LIMIT 2")).rows;
 if(owners.length!==1)throw new Error('Exactly one active local owner must be provisioned');
 gateway=await createLocalGateway({identity:createIdentity({pool}),scope:{workspaceId:owners[0].workspace_id,principalId:owners[0].owner_principal_id},frontendOrigin:origin,allowedOrigins:config.allowedOrigins});
 // The URL is a short-lived credential. Never print it or forward child-process errors.
 await promisify(execFile)('powershell.exe',['-NoProfile','-ExecutionPolicy','RemoteSigned','-File',resolve('scripts/open-local-workspace.ps1'),'-Url',gateway.handoffUrl],{windowsHide:true,timeout:15000});
 process.stdout.write('Opening the local workspace through the gateway. No bootstrap values need to be pasted.\n');
 const result=await gateway.completion;
 if(!result.connected)throw new Error('Local gateway handoff expired or failed');
 process.stdout.write('Gateway connected. The workspace session is active.\n');
}catch{
 process.stderr.write('GATEWAY_UNAVAILABLE: verify local frontend/backend readiness and the protected runtime configuration, then run npm run gateway again.\n');process.exitCode=1;
}finally{await gateway?.close();await pool?.end();}
