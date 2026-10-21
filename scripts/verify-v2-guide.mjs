import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { taskGraph, blockersFor, guideApproved, nextTask } from './v2-task-state.mjs';

function verify(repoRoot) {
  const read = path => readFileSync(resolve(repoRoot, path), 'utf8');
  const json = path => JSON.parse(read(path));
  const hash = value => createHash('sha256').update(value).digest('hex');
  const guide = read('docs/v2-build-guide.md');
  const active = guide.split('## 15. Preserved source archive')[0];
  const ledger = json('docs/v2-task-ledger.json');
  const manifest = json('docs/v2-source-manifest.json');
  const system = json('docs/task-ledger.json');
  const ui = json('docs/ui-task-ledger.json');
  const baseline = json('docs/architecture-baseline.json');
  const uiBaseline = json('docs/ui-baseline.json');
  const violations = [];
  const check = (condition, code, detail) => { if (!condition) violations.push({ code, detail }); };
  const expected = (prefix, count) => Array.from({ length: count }, (_, index) => prefix + String(index + 1).padStart(2, '0'));
  const sameSet = (actual, wanted) => actual.length === wanted.length && actual.every(value => wanted.includes(value)) && new Set(actual).size === wanted.length;

  check(sameSet(system.tasks.map(task => task.id), expected('', 30)), 'ORIGINAL_SYSTEM_TASKS', 'Keep all 30 original system tasks');
  check(sameSet(ui.tasks.map(task => task.id), expected('U', 22)), 'ORIGINAL_UI_TASKS', 'Keep all 22 original UI tasks');
  check(sameSet(ledger.tasks.filter(task => task.kind === 'migration').map(task => task.id), expected('M', 11)), 'MIGRATION_TASKS', 'Keep all 11 completed-task migration cards');
  check(sameSet(ledger.tasks.filter(task => task.kind === 'extension').map(task => task.id), expected('V2-T', 40)), 'EXTENSION_TASKS', 'Keep all 40 V2 extension cards');
  check(sameSet(ledger.tasks.filter(task => task.kind === 'integration_gate').map(task => task.id), ['V2-G01']), 'PROTECTED_V2_GATE', 'Named complete live workflow acceptance');
  check(sameSet(ledger.tasks.flatMap(task => task.proposalIds), expected('V2-F', 40)), 'PROPOSAL_COVERAGE', 'Each V2 proposal must have exactly one extension owner');
  for (const requirement of [...expected('R', 24), ...expected('F', 18)]) check(active.includes(requirement), 'REQUIREMENT_COVERAGE', requirement);
  const components = baseline.components.map(component => component.id);
  check(components.length === 12, 'COMPONENT_COUNT', 'Architecture retains 12 component IDs');
  for (const component of components) check(active.includes(`| ${component} |`), 'COMPONENT_COVERAGE', component);
  check(uiBaseline.sections.length === 7, 'UI_SECTION_COUNT', 'Exactly seven baseline sections');
  for (const section of uiBaseline.sections) check(active.includes(section.label), 'UI_SECTION_COVERAGE', section.label);

  const allOriginal = [...system.tasks, ...ui.tasks];
  const originals = new Map(allOriginal.map(task => [task.id, task]));
  check(ledger.inheritedSnapshot.length === 52, 'SNAPSHOT_COUNT', 'All 52 tasks are preserved');
  for (const saved of ledger.inheritedSnapshot) {
    const live = originals.get(saved.id);
    check(Boolean(live), 'SNAPSHOT_UNKNOWN', saved.id);
    if (!live) continue;
    check(saved.status !== 'completed' || live.status === 'completed', 'HISTORICAL_STATUS_DRIFT', saved.id);
    check(saved.evidenceSha256 === hash(JSON.stringify((live.evidence ?? []).slice(0, saved.evidenceCount))), 'HISTORICAL_EVIDENCE_DRIFT', saved.id);
    check(active.includes(`| ${saved.id} · ${saved.title} |`), 'INHERITED_CARD_COVERAGE', saved.id);
  }
  const completed = ledger.inheritedSnapshot.filter(task => task.status === 'completed').map(task => task.id);
  check(sameSet(ledger.tasks.filter(task => task.kind === 'migration').map(task => task.originalTask), completed), 'COMPLETED_MIGRATION_COVERAGE', 'Every completed original task has a migration card');

  const state = { root: repoRoot, v2: ledger, system, ui };
  const nodes = taskGraph(state);
  const newTaskIds = new Set(ledger.tasks.map(task => task.id));
  const edges = new Map();
  const requirements = new Set([...expected('R', 24), ...expected('F', 18)]);
  for (const [id, task] of nodes) {
    const deps = task.dependsOn;
    edges.set(id, deps);
    for (const dependency of deps) check(nodes.has(dependency), 'UNKNOWN_DEPENDENCY', `${id} -> ${dependency}`);
    if (!newTaskIds.has(id)) continue;
    check(components.includes(task.owner), 'UNKNOWN_OWNER', id);
    check(task.requirements.length > 0 && task.requirements.every(value => requirements.has(value)), 'TASK_REQUIREMENTS', id);
    check(task.files.length > 0 && task.files.every(path => !path.includes('*') && !path.includes('{') && !path.startsWith('/') && !path.includes('..')), 'EXACT_FILE_OWNERSHIP', id);
    check(Boolean(task.interfaces && task.acceptance && task.delta && task.checks.length), 'TASK_CONTRACT', id);
    const cardStart = active.indexOf(`### ${id}: ${task.title}`);
    check(cardStart >= 0, 'MISSING_TASK_CARD', id);
    const cardEnd = active.indexOf('\n### ', cardStart + 1);
    const card = active.slice(cardStart, cardEnd < 0 ? active.length : cardEnd);
    check(card.includes(task.interfaces) && card.includes(task.acceptance), 'TASK_CARD_CONTRACT', id);
    for (const file of task.files) check(card.includes(file), 'TASK_CARD_FILE', `${id}: ${file}`);
    for (const command of task.checks) check(card.includes(command), 'MISSING_TASK_CHECK', `${id}: ${command}`);
    for (const dependency of task.conditionalOriginalDependencies ?? []) check(nodes.has(dependency.id), 'UNKNOWN_CONDITIONAL_DEPENDENCY', `${id} -> ${dependency.id}`);
    check(['pending', 'in_progress', 'completed', 'blocked', 'scope_deferred'].includes(task.status), 'TASK_STATUS', id);
    check(task.status !== 'completed' || (task.reviewStatus === 'approved' && task.evidence.length > 0), 'UNSUPPORTED_COMPLETION', id);
  }
  const visiting = new Set(), visited = new Set();
  function visit(id, path = []) {
    if (visiting.has(id)) { check(false, 'DEPENDENCY_CYCLE', [...path, id].join(' -> ')); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of edges.get(id) ?? []) if (nodes.has(dep)) visit(dep, [...path, id]);
    visiting.delete(id); visited.add(id);
  }
  for (const id of nodes.keys()) visit(id);
  for (const [id, deps] of Object.entries(ledger.activatedConditionalDependencies ?? {})) {
    const task = nodes.get(id);
    for (const dependency of deps) check(task?.conditionalOriginalDependencies?.some(item => item.id === dependency), 'INVALID_CONDITIONAL_ACTIVATION', `${id} -> ${dependency}`);
  }

  const currentMarkdown = execFileSync('rg', ['--files', '-g', '*.md'], { cwd: repoRoot, encoding: 'utf8' }).trim().split(/\r?\n/).map(path => path.replaceAll('\\', '/')).filter(path => path !== 'docs/v2-build-guide.md');
  const archivedMarkdown = manifest.sourceFiles.filter(source => source.path.endsWith('.md')).map(source => source.path);
  check(archivedMarkdown.every(path => currentMarkdown.includes(path)), 'SOURCE_INVENTORY', 'All preserved original Markdown sources remain available');
  const unarchivedMarkdown = currentMarkdown.filter(path => !archivedMarkdown.includes(path));
  for (const source of manifest.sourceFiles) {
    check(existsSync(resolve(repoRoot, source.path)), 'MISSING_SOURCE', source.path);
    const start = guide.indexOf(source.startMarker);
    const finish = guide.indexOf(source.endMarker, start + source.startMarker.length);
    check(start >= 0 && finish > start, 'SOURCE_MARKERS', source.path);
    if (start < 0 || finish <= start) continue;
    const afterMarker = guide.indexOf('\n', start) + 1;
    const contentStart = guide.indexOf('\n', afterMarker) + 1;
    const ending = '\n' + '`'.repeat(source.fenceLength) + '\n';
    const contentEnd = guide.lastIndexOf(ending, finish);
    const snapshot = guide.slice(contentStart, contentEnd);
    check(hash(snapshot) === source.sha256 && Buffer.byteLength(snapshot) === source.byteLength, 'SOURCE_PRESERVATION', source.path);
  }

  let insideFence = null;
  const linkText = guide.split(/\r?\n/).filter(line => {
    const found = line.match(/^(`{3,}|~{3,})/);
    if (found) { if (!insideFence) insideFence = found[1]; else if (found[1][0] === insideFence[0] && found[1].length >= insideFence.length) insideFence = null; return false; }
    return !insideFence;
  }).join('\n');
  check(insideFence === null, 'UNCLOSED_FENCE', 'Markdown fence balance');
  const headingSlug = text => text.toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, '').trim().replaceAll(' ', '-');
  const anchors = new Set([...linkText.matchAll(/^#{1,6} (.+)$/gm)].map(match => headingSlug(match[1])));
  for (const match of linkText.matchAll(/<a id="([^"]+)"/g)) anchors.add(match[1]);
  for (const match of linkText.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    if (target.startsWith('#')) check(anchors.has(target.slice(1)), 'BROKEN_ANCHOR', target);
    else check(existsSync(resolve(repoRoot, 'docs', target.split('#')[0])), 'BROKEN_LOCAL_LINK', target);
  }
  check(system.v2Planning?.guide === ledger.guide && ui.v2Planning?.guide === ledger.guide, 'NAVIGATION_REVIEW_STATE', 'Original ledgers link the combined V2 planning');
  check(ledger.approvedByHuman === false ? ledger.status === 'proposed' : ledger.status === 'approved' && ledger.approval.reviewStatus === 'approved' && ledger.approval.decisions.length > 0, 'APPROVAL_HONESTY', 'Approved V2 requires recorded review decisions; preparation must not invent human approval');
  for (const [port, deps] of Object.entries(ledger.catalogPortGates ?? {})) for (const dependency of deps) check(nodes.has(dependency), 'UNKNOWN_PORT_DEPENDENCY', `${port} -> ${dependency}`);
  const migrationNames = [...(ledger.migrationRegistry?.reservedInherited ?? []), ...(ledger.migrationRegistry?.newMigrations ?? []).map(item => item.file)];
  check(new Set(migrationNames.map(name => name.split('-')[0])).size === migrationNames.length, 'MIGRATION_ID_COLLISION', 'Globally unique reserved migration IDs');
  for (const migration of ledger.migrationRegistry?.newMigrations ?? []) {
    const task = nodes.get(migration.owner);
    check(Boolean(task) && task.files.some(file => file.replace(/^db\/postgres\/migrations\//, 'backend/database/migrations/postgres/') === `backend/database/migrations/postgres/${migration.file}`), 'MIGRATION_FILE_OWNER', migration.file);
    for (const dependency of migration.requires) check(migrationNames.includes(dependency), 'UNKNOWN_MIGRATION_DEPENDENCY', `${migration.file} -> ${dependency}`);
  }
  const approved = guideApproved(state);
  const readyTasks = violations.length ? [] : [...nodes.values()].filter(task => task.status === 'pending' && blockersFor(state, task.id, nodes).length === 0).map(task => task.id);
  const recommendation = violations.length ? null : nextTask(state);
  return { scope: 'documentation-and-planning-only', sources: manifest.sourceFiles.length, inheritedTasks: 52, migrationTasks: 11, extensionTasks: 40, integrationGates: 1, components: components.length, dependencyNodes: nodes.size, unarchivedMarkdown, reviewRequired: !approved, readyTasks, nextTask: recommendation?.task?.id ?? null, nextAction: recommendation?.action ?? null, violations };
}

function main() {
  const repoRoot = resolve(process.argv[2] ?? resolve(import.meta.dirname, '..'));
  const result = verify(repoRoot);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.violations.length ? 1 : 0;
}

main();

export { verify };
