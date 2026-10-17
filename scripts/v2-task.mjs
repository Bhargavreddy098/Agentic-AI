import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readTaskState, taskGraph, blockersFor, nextTask, buildOrder, stageFor, firstGoal } from './v2-task-state.mjs';

const state = readTaskState();
const args = process.argv.slice(2);
const command = args[0] ?? 'next';
const target = args.includes('--all') ? 'all' : firstGoal;
const write = message => process.stdout.write(message + '\n');

function printNext() {
  const result = nextTask(state, target);
  if (!result.task) { write(result.message); return; }
  const task = result.task;
  const label = { start: 'READY TO START', resume: 'RESUME CURRENT TASK', wait: 'WAITING - DO NOT IMPLEMENT' }[result.action];
  write(`${label}\n${task.id}: ${task.title}\n${stageFor(task)}`);
  if (result.blockers.length) for (const blocker of result.blockers) write(`- ${blocker.id}: ${blocker.reason}`);
  write(`\nRead this task's brief next:\nnode scripts/v2-task.mjs show ${task.id}`);
  write('\nThis command is read-only. It does not approve, start, complete or test a task.');
}

function extractTask(source, task, inherited) {
  const heading = inherited ? task.kind === 'system' ? `### Task ${task.id}:` : `### ${task.id}:` : `### ${task.id}:`;
  const start = source.indexOf(heading);
  if (start < 0) throw new Error(`Cannot find exact task heading ${heading}`);
  const rest = source.slice(start);
  const boundary = rest.slice(rest.indexOf('\n') + 1).search(/^#{1,3} /m);
  return boundary < 0 ? rest.trim() : rest.slice(0, rest.indexOf('\n') + 1 + boundary).trim();
}

function printBrief(id) {
  const graph = taskGraph(state), task = graph.get(id);
  if (!task) throw new Error(`Unknown task ${id}. Use its exact ID: M01, 05, U08, V2-T04 or V2-G01.`);
  const inherited = task.kind === 'system' || task.kind === 'ui';
  const sourcePath = inherited ? task.kind === 'system' ? 'docs/superpowers/plans/2026-10-06-asi-agent-build.md' : 'docs/superpowers/plans/2026-10-06-agent-workspace-ui-build.md' : 'docs/v2-build-guide.md';
  const source = readFileSync(resolve(state.root, sourcePath), 'utf8').split('## 15. Preserved source archive')[0];
  const blockers = blockersFor(state, id, graph);
  write(`# Current task brief: ${id}\n\n${task.title}\nLedger status: ${task.status}; review: ${task.reviewStatus}.`);
  write(`Requirements: ${(task.requirements ?? []).join(', ')}\nCurrent prerequisites: ${task.dependsOn.join(', ') || 'None'}`);
  write('\nPlatform: implement on Windows now. Linux is not a prerequisite; future VM-only Linux work is separate. Required owner and security gates still apply.');
  write('\n## Before editing\n');
  const needsRepair = /blocked|pending|partial|in_progress/.test(task.qualification?.status ?? '');
  write(task.status === 'completed' ? inherited ? needsRepair ? 'Historical completion is preserved, but current qualification requires repair. Continue the authorized Windows repair in this task brief; do not treat historical completion as acceptance.' : 'This original task is recorded completed. Check current qualification before reuse; follow its migration card where one exists.' : 'This task is recorded completed. Check its acceptance evidence and use next to find remaining work.' : blockers.length ? 'WAIT. The following conditions still block implementation:' : 'Prerequisite and review records permit starting this one task. Check its runtime/services before effects.');
  for (const blocker of blockers) write(`- ${blocker.id}: ${blocker.reason}`);
  write('\n## Task instructions\n');
  write(extractTask(source, task, inherited));
  if (inherited) {
    const delta = state.v2.inheritedSnapshot.find(item => item.id === id);
    write('\n## V2 connection\n');
    write(`Migration required by this original task: ${delta?.migrationTask ?? 'No separate completed-task migration'}.`);
    write(`Added prerequisite migrations: ${(state.v2.inheritedExecutionGates?.[id] ?? []).join(', ') || 'None directly; transitive prerequisites still apply'}.`);
    write('Related V2 proposals are traceability links, not instructions to implement all linked features in this task. Preserve original acceptance and implement a new V2 interface only through its reviewed feature card.');
  }
  write('\n## Working rules\n');
  write('- One task and one designated file owner. Preserve unrelated dirty files.\n- Keep model/privacy, policy, tool isolation, memory broker and SQLite-owner boundaries.\n- Run every named check; no required skips, fixture/live substitution or empty-suite success.\n- Record fresh evidence and unresolved limitations in the owning live ledger before completion.\n- Update the guide when task definition changes; do not reassemble it merely to change a status.\n- Run node scripts/v2-task.mjs next after recording completion.');
  write(`\nSource: ${sourcePath}\nLedger: ${inherited ? task.kind === 'system' ? 'docs/task-ledger.json' : 'docs/ui-task-ledger.json' : 'docs/v2-task-ledger.json'}`);
}

function printRoadmap() {
  const tasks = buildOrder(state, target).filter(task => task.status !== 'completed');
  write(target === 'all' ? 'Full backlog in dependency order (not authorization to build everything):' : 'Shortest prerequisite set in the current plan for the first protected V2 workflow:');
  let previous = '';
  for (const task of tasks) {
    const stage = stageFor(task);
    if (stage !== previous) { write(`\n${stage}`); previous = stage; }
    write(`${task.id}  ${task.title}  [${task.status}]`);
  }
  write(`\n${tasks.length} remaining tasks in this view. Exact dependencies and review/service gates still apply.`);
}

try {
  if (command === 'next') printNext();
  else if (command === 'show' && args[1]) printBrief(args[1]);
  else if (command === 'roadmap') printRoadmap();
  else {
    write('Usage:\nnode scripts/v2-task.mjs next\nnode scripts/v2-task.mjs show M01\nnode scripts/v2-task.mjs roadmap\nnode scripts/v2-task.mjs roadmap --all');
    process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`Task instructions unavailable: ${error.message}\n`);
  process.exitCode = 1;
}
