import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readTaskState, taskGraph, blockersFor, nextTask, buildOrder } from './v2-task-state.mjs';

function fixture() {
  const state = structuredClone(readTaskState());
  state.v2.approvedByHuman = true;
  state.v2.status = 'approved';
  state.v2.approval.reviewStatus = 'approved';
  state.v2.approval.decisions = ['Synthetic approval for this in-memory test only'];
  for (const ledger of [state.system, state.ui, state.v2]) {
    ledger.approvedByHuman = true;
    for (const task of ledger.tasks) { task.status = 'completed'; task.reviewStatus = 'approved'; task.evidence = ['Synthetic acceptance for this in-memory test only']; }
  }
  return state;
}
const task = (state, id) => [...state.system.tasks, ...state.ui.tasks, ...state.v2.tasks].find(item => item.id === id);

test('an unreviewed guide never tells an agent to implement', () => {
  const state = fixture();
  state.v2.approvedByHuman = false;
  state.v2.status = 'proposed';
  state.v2.approval.reviewStatus = 'pending';
  task(state, 'M01').status = 'pending';
  const result = nextTask(state);
  assert.equal(result.action, 'wait');
  assert.equal(result.task.id, 'M01');
  assert.ok(result.blockers.some(blocker => blocker.id === 'V2 guide'));
});

test('a reviewed guide does not approve an unreviewed task boundary', () => {
  const state = fixture();
  Object.assign(task(state, 'M01'), { status: 'pending', reviewStatus: 'pending' });
  assert.equal(nextTask(state).action, 'wait');
  assert.ok(blockersFor(state, 'M01').some(blocker => blocker.id === 'M01'));
});

test('approval flags without a recorded human decision do not authorize work', () => {
  const state = fixture();
  state.v2.approval.decisions = [];
  task(state, 'M01').status = 'pending';
  assert.equal(nextTask(state).action, 'wait');
});

test('a completed prerequisite without acceptance evidence still blocks its consumer', () => {
  const state = fixture();
  task(state, 'M04').evidence = [];
  task(state, '05').status = 'pending';
  assert.ok(blockersFor(state, '05').some(blocker => blocker.id === 'M04' && blocker.kind === 'evidence'));
  assert.equal(nextTask(state).action, 'wait');
});

test('a qualified original 04 cannot bypass pending M04 for task 05', () => {
  const state = fixture();
  task(state, 'M04').status = 'pending';
  task(state, '05').status = 'pending';
  assert.ok(blockersFor(state, '05').some(blocker => blocker.id === 'M04'));
  assert.equal(nextTask(state).task.id, 'M04');
});

test('original U07 completion cannot bypass pending canonical Chat migration', () => {
  const state = fixture();
  task(state, 'M11').status = 'pending';
  task(state, 'U08').status = 'pending';
  assert.ok(blockersFor(state, 'U08').some(blocker => blocker.id === 'M11'));
});

test('early U17 cannot bypass the conservative recorded real-UI order', () => {
  const state = fixture();
  task(state, '16').status = 'pending';
  task(state, 'U17').status = 'pending';
  assert.ok(blockersFor(state, 'U17').some(blocker => blocker.id === '16'));
});

test('resume the one running task rather than start a second one', () => {
  const state = fixture();
  task(state, 'V2-T40').status = 'in_progress';
  task(state, 'M01').status = 'pending';
  const result = nextTask(state);
  assert.equal(result.action, 'resume');
  assert.equal(result.task.id, 'V2-T40');
});

test('multiple in-progress tasks produce a conflict, not another allocation', () => {
  const state = fixture();
  task(state, 'M01').status = 'in_progress';
  task(state, 'M05').status = 'in_progress';
  assert.equal(nextTask(state).action, 'resolve-conflict');
});

test('one ready task is selected without changing any ledger or approval', () => {
  const state = fixture();
  task(state, 'M01').status = 'pending';
  const before = JSON.stringify(state);
  assert.equal(nextTask(state).action, 'start');
  assert.equal(nextTask(state).task.id, 'M01');
  buildOrder(state);
  blockersFor(state, 'M01');
  assert.equal(JSON.stringify(state), before);
});

test('the first-workflow order includes its prerequisites and excludes future swarms', () => {
  const state = readTaskState();
  const graph = taskGraph(state);
  const order = buildOrder(state);
  const positions = new Map(order.map((item, index) => [item.id, index]));
  assert.equal(order.at(-1).id, 'V2-G01');
  assert.equal(positions.has('V2-T40'), false);
  for (const item of order) for (const dependency of graph.get(item.id).dependsOn) assert.ok(positions.get(dependency) < positions.get(item.id), `${dependency} before ${item.id}`);
  assert.ok(positions.get('M11') < positions.get('U08'));
});

test('task briefs resolve every namespace without leaking the next card or archive', () => {
  const state = readTaskState();
  for (const id of ['M01', '05', 'U08', 'V2-T04', 'V2-G01']) {
    const result = spawnSync(process.execPath, [resolve(state.root, 'scripts/v2-task.mjs'), 'show', id], { encoding: 'utf8', cwd: state.root });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(`# Current task brief: ${id}\n`));
    assert.equal((result.stdout.match(/^### (?:Task )?(?:\d{2}|U\d{2}|M\d{2}|V2-[TG]\d{2}):/gm) ?? []).length, 1);
    assert.equal(result.stdout.includes('## 15. Preserved source archive'), false);
    assert.ok(result.stdout.includes('Current prerequisites:'));
  }
  const invalid = spawnSync(process.execPath, [resolve(state.root, 'scripts/v2-task.mjs'), 'show', 'missing'], { encoding: 'utf8', cwd: state.root });
  assert.equal(invalid.status, 1);
  assert.ok(invalid.stderr.includes('Unknown task missing'));
});
