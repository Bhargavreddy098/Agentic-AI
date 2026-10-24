// Trusted native owner command. A browser can use only the returned opaque UUID.
import pg from 'pg';
import { resolve, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { withScopedTransaction } from '../backend/src/platform/database/transaction.js';
import { exportLocal } from '../backend/src/platform/repository/export.js';
const args=process.argv.slice(2);
const projectId=args[args.indexOf('--project-id')+1], destination=args[args.indexOf('--destination')+1];
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:3000});
try {
 if(args.length!==4||!args.includes('--project-id')||!args.includes('--destination')||!/^[a-f0-9-]{36}$/i.test(projectId)||!destination)throw Error('arguments');
 const path=resolve(destination), name=basename(path);
 if(!/^[a-z]:[\\/]/i.test(destination)||name.includes(':')||/[. ]$/.test(name)||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name))throw Error('destination');
 await exportLocal(path,Buffer.alloc(0),true);
 const owners=await pool.query("SELECT workspace_id,owner_principal_id FROM identity.workspaces w JOIN identity.principals p ON p.principal_id=w.owner_principal_id WHERE p.kind='local_user' AND p.status='active' LIMIT 2");
 if(owners.rows.length!==1)throw Error('owner');
 const owner=owners.rows[0],id=randomUUID();
 await withScopedTransaction(pool,{workspaceId:owner.workspace_id,principalId:owner.owner_principal_id},async tx=>{
  const project=await tx.query("SELECT project_id FROM product.projects WHERE project_id=$1 AND status='active'",[projectId]);if(!project.rows.length)throw Error('project');
  await tx.query('INSERT INTO identity.export_destinations(id,workspace_id,project_id,authorized_by,canonical_path) VALUES($1,$2,$3,$4,$5)',[id,owner.workspace_id,projectId,owner.owner_principal_id,path]);
 });
 console.log('Authorized destinationRef: '+id);
} catch { console.error('EXPORT_AUTHORIZATION_FAILED: verify project, local owner, canonical destination parent and non-existing filename. No path or credentials are logged.');process.exitCode=1; }
finally{await pool.end();}
