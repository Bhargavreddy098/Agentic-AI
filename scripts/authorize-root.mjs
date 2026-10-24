// Native owner-only root registration; HTTP clients never supply filesystem paths.
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {inspectRepositoryRoot} from '../backend/src/platform/repository/index.js';
import {withScopedTransaction} from '../backend/src/platform/database/transaction.js';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:3000});
try {
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--root')throw Error('arguments');
 const path=await inspectRepositoryRoot(args[1]);
 const owners=await pool.query("SELECT workspace_id,owner_principal_id FROM identity.workspaces w JOIN identity.principals p ON p.principal_id=w.owner_principal_id WHERE p.kind='local_user' AND p.status='active' LIMIT 2");
 if(owners.rows.length!==1)throw Error('owner');
 const owner=owners.rows[0],id=randomUUID();
 await withScopedTransaction(pool,{workspaceId:owner.workspace_id,principalId:owner.owner_principal_id},tx=>tx.query("INSERT INTO identity.workspace_roots(id,workspace_id,authorized_by,canonical_path,repository_kind) VALUES($1,$2,$3,$4,'git')",[id,owner.workspace_id,owner.owner_principal_id,path]));
 console.log('Authorized workspaceRootRef: '+id);
}catch{console.error('ROOT_AUTHORIZATION_FAILED: verify exactly one local owner and a canonical standalone Git repository. No paths or credentials are logged.');process.exitCode=1;}finally{await pool.end();}
