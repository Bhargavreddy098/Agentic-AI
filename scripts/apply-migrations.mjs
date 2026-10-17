import { readFileSync } from "node:fs";
import { resolve,dirname } from "node:path";
import { fileURLToPath,pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const validName=/^\d{3}-[a-z0-9-]+\.sql$/;
export function reviewedMigrationPlan({root=repositoryRoot,target}) {
 const read=path=>JSON.parse(readFileSync(resolve(root,path),"utf8"));
 const ledger=read("docs/v2-task-ledger.json"), system=read("docs/task-ledger.json");
 if(!ledger.approvedByHuman||ledger.approval?.reviewStatus!=="approved"||!system.approvedByHuman) throw new Error("Migration baselines have no human approval");
const nodes=new Map();
  for(const file of ledger.migrationRegistry.reservedInherited) {
    if(validName.test(file)) {
      const owner=file==="001-control.sql"?"04":file==="002-audit.sql"?"04":file==="003-budgets.sql"?"06":file==="004-memory-rls.sql"?"09":file==="005-skills.sql"?"18":file==="006-schedules.sql"?"21":file==="007-learning.sql"?"10":file==="008-observations.sql"?"28":"04";
      nodes.set(file,{file,owner,requires:[],reviewed:true});
    }
  }
  for(const node of ledger.migrationRegistry.newMigrations) {
  if(nodes.has(node.file)||!validName.test(node.file)||!Array.isArray(node.requires)) throw new Error("Invalid migration registry");
  nodes.set(node.file,{...node,reviewed:ledger.tasks.find(task=>task.id===node.owner)?.reviewStatus==="approved" || (system.tasks.some(task=>task.id===node.owner) && ledger.boundaryReviewRequests?.[node.owner]?.reviewStatus==="approved")});
 }
 const roots=[...nodes.values()].filter(node=>node.owner===target);
 if(roots.length===0) throw new Error("Target has no explicit reviewed migration closure");
 const seen=new Set(),active=new Set(),plan=[];
 function visit(file) {
  if(!validName.test(file)) throw new Error("Invalid migration identity");
  if(active.has(file)) throw new Error("Migration dependency cycle");
  if(seen.has(file)) return;
  const node=nodes.get(file);
  if(!node) throw new Error("Missing migration prerequisite");
  if(!node.reviewed) throw new Error("Migration owner has no boundary review");
  const owner=ledger.tasks.find(task=>task.id===node.owner)??system.tasks.find(task=>task.id===node.owner);
  if(node.owner!==target&&owner?.status!=="completed") throw new Error("Migration prerequisite is not qualified");
  active.add(file); for(const dependency of node.requires)visit(dependency);active.delete(file);seen.add(file);
  const bytes=readFileSync(resolve(root,"db/postgres/migrations",file));
  plan.push({file,checksum:createHash("sha256").update(bytes).digest("hex"),sql:bytes.toString("utf8")});
 }
 for(const node of roots)visit(node.file);
 return plan;
}
export async function applyReviewedMigrations(client,{schema,target,root=repositoryRoot}) {
 if(!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error("Invalid trusted schema identifier");
 if(!Number.isInteger(client.processID)) throw new Error("A connected dedicated PostgreSQL client is required");
 const plan=reviewedMigrationPlan({root,target});
 const applied=[];
 await client.query("BEGIN");
 try {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["asi-migrations:"+schema]);
  const namespace=await client.query("SELECT 1 FROM pg_namespace WHERE nspname=$1",[schema]);
  if(namespace.rows.length!==1) throw new Error("Target schema does not exist");
  await client.query('SET LOCAL search_path TO "'+schema+'",public');
  const current=await client.query("SELECT current_schema() AS name");
  if(current.rows[0].name!==schema) throw new Error("Target schema is not active");
  const exists=await client.query("SELECT to_regclass($1) AS journal",[schema+".schema_migrations"]);
  if(!exists.rows[0].journal) {
   await client.query("CREATE TABLE schema_migrations(migration_id text PRIMARY KEY,checksum text NOT NULL CHECK(checksum~'^[a-f0-9]{64}$'),applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
   await client.query("CREATE FUNCTION m04_protect_migration_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Migration journal is immutable'; END $$");
   await client.query("CREATE TRIGGER migration_journal_guard BEFORE UPDATE OR DELETE ON schema_migrations FOR EACH ROW EXECUTE FUNCTION m04_protect_migration_journal()");
   await client.query("REVOKE ALL ON schema_migrations FROM PUBLIC");
  } else {
   const protection=await client.query("SELECT 1 FROM pg_trigger WHERE tgrelid=$1::regclass AND tgname='migration_journal_guard' AND tgenabled<>'D'",[schema+".schema_migrations"]);
   if(protection.rows.length!==1) throw new Error("Migration journal protection missing");
  }
  for(const migration of plan) {
   const found=await client.query("SELECT checksum FROM schema_migrations WHERE migration_id=$1",[migration.file]);
   if(found.rows.length) {
    if(found.rows[0].checksum!==migration.checksum) throw new Error("Applied migration checksum drift");
    continue;
   }
   await client.query(migration.sql);
   await client.query("INSERT INTO schema_migrations(migration_id,checksum) VALUES ($1,$2)",[migration.file,migration.checksum]);
   applied.push(migration.file);
  }
  await client.query("COMMIT");return applied;
 } catch(error) { await client.query("ROLLBACK").catch(()=>undefined);throw error; }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 const argument=name=>process.argv[process.argv.indexOf(name)+1];
 const target=process.argv.includes("--target")?argument("--target"):undefined;
 const schema=process.argv.includes("--schema")?argument("--schema"):undefined;
 try {
  const plan=reviewedMigrationPlan({target});
  if(!process.argv.includes("--apply-reviewed")) {
   process.stdout.write(JSON.stringify({mode:"plan-only",target,migrations:plan.map(({file,checksum})=>({file,checksum}))},null,2)+"\n");
  } else {
   if(!schema||!process.env.DATABASE_URL)throw new Error("Trusted schema and private DATABASE_URL are required");
   const {Client}=createRequire(resolve(repositoryRoot,"packages/control/package.json"))("pg");
   const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:30000});
   try {await client.connect();const applied=await applyReviewedMigrations(client,{schema,target});process.stdout.write(JSON.stringify({applied})+"\n");}
   finally {await client.end();}
  }
 } catch {process.stderr.write("Reviewed migration plan/application failed; no successful application is claimed.\n");process.exitCode=1;}
}

