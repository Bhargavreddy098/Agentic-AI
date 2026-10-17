import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const defaultRoot = resolve(import.meta.dirname, '..');
export const firstGoal = 'V2-G01';

export function readTaskState(root = defaultRoot) {
  const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  return {
    root,
    v2: read('docs/v2-task-ledger.json'),
    system: read('docs/task-ledger.json'),
    ui: read('docs/ui-task-ledger.json'),
  };
}

export function taskGraph(state) {
  const tasks = new Map();
  for (const [ledger, kind] of [[state.system, 'system'], [state.ui, 'ui']]) {
    for (const task of ledger.tasks) tasks.set(task.id, {
      ...task,
      kind,
      reviewStatus: ledger.approvedByHuman ? 'approved' : 'pending',
      dependsOn: [...(task.dependsOn ?? []), ...(task.backendDependsOn ?? []), ...(state.v2.inheritedExecutionGates?.[task.id] ?? [])],
    });
  }
  for (const task of state.v2.tasks) tasks.set(task.id, {
    ...task,
    dependsOn: [...(task.dependsOn ?? []), ...(task.originalDependencies ?? []), ...(state.v2.activatedConditionalDependencies?.[task.id] ?? [])],
  });
  // The baseline's recorded human decision uses the conservative real-UI order.
  for (const id of ['U17', 'U18', 'U19']) {
    const task = tasks.get(id);
    if (task) task.dependsOn.push(...Array.from({ length: 16 }, (_, index) => String(index + 1).padStart(2, '0')), '19');
  }
  for (const task of tasks.values()) task.dependsOn = [...new Set(task.dependsOn)];
  return tasks;
}

export function guideApproved(state) {
  return state.v2.approvedByHuman === true && state.v2.status === 'approved' && state.v2.approval?.reviewStatus === 'approved' && state.v2.approval.decisions?.length > 0;
}

export function blockersFor(state, taskId, graph = taskGraph(state)) {
  const task = graph.get(taskId);
  if (!task) throw new Error(`Unknown task ${taskId}`);
  const blockers = [];
  if (!guideApproved(state)) blockers.push({ kind: 'review', id: 'V2 guide', reason: 'The new V2 guide has no recorded human approval.' });
  if (task.reviewStatus !== 'approved') blockers.push({ kind: 'review', id: taskId, reason: 'This task boundary has no recorded approval.' });
  for (const id of task.dependsOn) {
    const prerequisite = graph.get(id);
    if (!prerequisite) throw new Error(`Unknown prerequisite ${taskId} -> ${id}`);
    if (prerequisite.status !== 'completed') blockers.push({ kind: 'dependency', id, reason: `${prerequisite.title}: ${prerequisite.status}` });
    else if (prerequisite.reviewStatus !== 'approved' || !prerequisite.evidence?.length) blockers.push({ kind: 'evidence', id, reason: 'Completed prerequisite lacks an approved boundary or recorded acceptance evidence.' });
  }
  if (task.status === 'blocked') blockers.push({ kind: 'recorded', id: taskId, reason: 'The ledger still marks this task blocked; resolve and record the blocker.' });
  if (task.status === 'scope_deferred') blockers.push({ kind: 'scope', id: taskId, reason: 'This task is deferred by scope; a recorded scope decision is required.' });
  return blockers;
}

const preferred = [
  ...Array.from({ length: 11 }, (_, index) => `M${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 12 }, (_, index) => String(index + 5).padStart(2, '0')),
  '19', '21',
  ...Array.from({ length: 12 }, (_, index) => `U${String(index + 8).padStart(2, '0')}`),
  'V2-T04', 'V2-T01', 'V2-T02', 'V2-T03', 'V2-T25', 'V2-T27', firstGoal,
];
const rank = id => preferred.indexOf(id) < 0 ? preferred.length : preferred.indexOf(id);
const compare = (a, b) => rank(a) - rank(b) || a.localeCompare(b);

export function buildOrder(state, target = firstGoal) {
  const graph = taskGraph(state);
  const selected = new Set(), visiting = new Set();
  const visit = id => {
    if (visiting.has(id)) throw new Error(`Dependency cycle at ${id}`);
    if (selected.has(id)) return;
    const task = graph.get(id);
    if (!task) throw new Error(`Unknown task ${id}`);
    visiting.add(id);
    for (const dependency of task.dependsOn) visit(dependency);
    visiting.delete(id);
    selected.add(id);
  };
  if (target === 'all') for (const id of graph.keys()) visit(id);
  else visit(target);
  const ordered = [], emitted = new Set();
  while (emitted.size < selected.size) {
    const candidates = [...selected].filter(id => !emitted.has(id) && graph.get(id).dependsOn.every(dependency => emitted.has(dependency))).sort((a, b) => Number(graph.get(b).status === 'completed') - Number(graph.get(a).status === 'completed') || compare(a, b));
    if (!candidates.length) throw new Error('No task satisfies dependency order');
    const id = candidates[0];
    emitted.add(id);
    ordered.push(graph.get(id));
  }
  return ordered;
}

export function nextTask(state, target = firstGoal) {
  const graph = taskGraph(state);
  const running = [...graph.values()].filter(task => task.status === 'in_progress');
  if (running.length > 1) return { action: 'resolve-conflict', task: null, message: `Multiple tasks in progress: ${running.map(task => task.id).join(', ')}. Resolve ownership before another task starts.` };
  if (running.length === 1) {
    const task = running[0], blockers = blockersFor(state, task.id, graph);
    return { action: blockers.length ? 'wait' : 'resume', task, blockers };
  }
  const remaining = buildOrder(state, target).filter(task => task.status !== 'completed');
  if (!remaining.length) return { action: 'complete', task: null, message: `All recorded tasks for ${target} are completed. Check their evidence before a release claim.` };
  const task = remaining.find(candidate => candidate.status === 'pending' && blockersFor(state, candidate.id, graph).length === 0);
  if (task) return { action: 'start', task, blockers: [] };
  const planned = remaining.find(candidate => candidate.dependsOn.every(id => graph.get(id).status === 'completed')) ?? remaining[0];
  return { action: 'wait', task: planned, blockers: blockersFor(state, planned.id, graph) };
}

export function stageFor(task) {
  if (task.kind === 'migration') return '1. Repair and qualify existing work';
  if (task.kind === 'system' || task.kind === 'ui') return '2. Build the protected backend and Chat';
  if (task.kind === 'integration_gate') return '4. Prove the complete V2 workflow';
  if (task.phase === 'first-workflow') return '3. Add goals, planning, evidence and artifacts';
  return '5. Add further features after their prerequisites';
}
