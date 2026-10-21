import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {reviewedMigrationPlan as canonical} from '../database/migrate.js';
import {reviewedMigrationPlan as compatibility} from '../../scripts/apply-migrations.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('all relocated migrations retain their captured bytes',()=>{
 const hashes=JSON.parse(readFileSync(new URL('../database/migration-checksums.json',import.meta.url),'utf8'));
 for(const [old,digest] of Object.entries(hashes)){
  const relocated=old.replace('db/postgres/migrations','backend/database/migrations/postgres').replace('db/sqlite/migrations','backend/database/migrations/sqlite');
  assert.equal(createHash('sha256').update(readFileSync(resolve(root,relocated))).digest('hex'),digest,relocated);
 }
});
test('old and new migration entry points resolve the same reviewed closure',()=>{
 assert.deepEqual(compatibility({root,target:'M04'}),canonical({root,target:'M04'}));
 assert.deepEqual(canonical({root,target:'M04'}).map(item=>item.file),['001-control.sql','009-identity-grants.sql','010-control-qualification.sql']);
});
test('relocated workspace packages retain their unique package identities',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../RELOCATION.json',import.meta.url),'utf8')),names=new Set();
 for(const move of manifest.moves){
  assert.ok(existsSync(resolve(root,move.to)),move.to);
  if(!move.packageName)continue;
  assert.equal(JSON.parse(readFileSync(resolve(root,move.to,'package.json'),'utf8')).name,move.packageName);
  assert.equal(names.has(move.packageName),false);names.add(move.packageName);
  assert.equal(existsSync(resolve(root,move.from,'package.json')),false);
 }
 assert.equal(names.size,27);
});
