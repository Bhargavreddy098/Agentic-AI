export { reviewedMigrationPlan, applyReviewedMigrations } from '../backend/database/migrate.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const r=spawnSync(process.execPath,[resolve(import.meta.dirname,'../backend/database/migrate.js'),...process.argv.slice(2)],{stdio:'inherit'});process.exitCode=r.status??1;}
