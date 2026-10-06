#!/usr/bin/env node
/**
 * Requirement-to-task traceability enforcement (Task 01; requirement R20).
 *
 * Cross-checks the machine-readable baselines against the task ledgers and
 * reports:
 *
 *   TRACEABILITY_TASK_SET          system ledger tasks are not exactly 01..30
 *   TRACEABILITY_UI_TASK_SET       UI ledger tasks are not exactly U01..U22
 *   TRACEABILITY_UNKNOWN_TASK      a dependency or mapping names an unknown task
 *   TRACEABILITY_UNKNOWN_REQUIREMENT  a task names a requirement absent from the baseline
 *   TRACEABILITY_CYCLE             the task dependency graph contains a cycle
 *   TRACEABILITY_STAGE_MISMATCH    a task stage does not match the approved plan stages
 *   TRACEABILITY_STATUS            a task has an unknown status or a completed
 *                                  task has no evidence
 *   TRACEABILITY_REQUIREMENT_COVERAGE  a baseline requirement has no implementing task
 *   TRACEABILITY_FLOW_MISMATCH     UI sections, gates, or event contracts drifted
 *   TRACEABILITY_MISSING_FILE      a ledger or baseline references a missing doc
 *
 * Usage: node scripts/verify-traceability.mjs <repo-root>
 * Prints a JSON report to stdout; exits 1 when violations are found.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");

const SYSTEM_TASK_IDS = Array.from(
  { length: 30 },
  (_, index) => String(index + 1).padStart(2, "0"),
);
const UI_TASK_IDS = Array.from(
  { length: 22 },
  (_, index) => `U${String(index + 1).padStart(2, "0")}`,
);
const EXPECTED_STAGES = {
  A: ["01", "02", "03", "04", "05", "06", "07"],
  B: ["08", "09", "10", "11", "12", "13", "14", "15", "16"],
  C: ["17", "18", "19", "20", "21"],
  D: ["22", "23", "24", "25"],
  E: ["26", "27", "28"],
  F: ["29", "30"],
};
const ALLOWED_STATUSES = new Set([
  "pending",
  "in_progress",
  "completed",
  "blocked",
]);
const EXPECTED_UI_SECTIONS = [
  { id: "chat", label: "Chat", route: "/chat" },
  { id: "models", label: "Models & Providers", route: "/models" },
  { id: "skills", label: "Skills", route: "/skills" },
  { id: "connections", label: "Tools & Connections", route: "/connections" },
  { id: "memory", label: "Memory", route: "/memory" },
  { id: "activity", label: "Activity & Tasks", route: "/activity" },
  { id: "settings", label: "Settings", route: "/settings" },
];
const EXPECTED_FORBIDDEN_ROUTES = [
  "/approvals",
  "/questions",
  "/agents",
  "/dashboard",
];
const CANONICAL_INTERACTION_EVENTS = new Set([
  "clarification.requested",
  "clarification.resolved",
  "approval.requested",
  "approval.resolved",
]);

function loadJson(repoRoot, relativePath) {
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    return { missing: relativePath };
  }
  return { data: JSON.parse(readFileSync(absolutePath, "utf8")) };
}

function findCycle(taskIds, dependsOnOf) {
  const indegree = new Map(taskIds.map((id) => [id, 0]));
  const dependents = new Map(taskIds.map((id) => [id, []]));
  for (const taskId of taskIds) {
    for (const dependency of dependsOnOf.get(taskId) ?? []) {
      if (indegree.has(dependency)) {
        dependents.get(dependency).push(taskId);
        indegree.set(taskId, (indegree.get(taskId) ?? 0) + 1);
      }
    }
  }
  const queue = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id);
  const visited = [];
  while (queue.length > 0) {
    const current = queue.shift();
    visited.push(current);
    for (const dependent of dependents.get(current) ?? []) {
      const next = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, next);
      if (next === 0) {
        queue.push(dependent);
      }
    }
  }
  return visited.length === taskIds.length
    ? []
    : taskIds.filter((id) => !visited.includes(id));
}

function verifySystemLedger(repoRoot, baseline, ledger, violations) {
  const tasks = ledger.tasks ?? [];
  const taskIds = tasks.map((task) => task.id);
  if (JSON.stringify(taskIds) !== JSON.stringify(SYSTEM_TASK_IDS)) {
    violations.push({
      code: "TRACEABILITY_TASK_SET",
      file: "docs/task-ledger.json",
      detail: `system ledger must contain tasks 01..30 in order; found ${taskIds.join(",")}`,
    });
    return;
  }
  const requirementIds = new Set(
    (baseline.requirements ?? []).map((requirement) => requirement.id),
  );
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  for (const task of tasks) {
    if (typeof task.title !== "string" || task.title.length === 0) {
      violations.push({
        code: "TRACEABILITY_STATUS",
        file: "docs/task-ledger.json",
        detail: `task ${task.id} must have a non-empty title`,
      });
    }
    const expectedStage = Object.entries(EXPECTED_STAGES).find(([, ids]) =>
      ids.includes(task.id),
    )?.[0];
    if (task.stage !== expectedStage) {
      violations.push({
        code: "TRACEABILITY_STAGE_MISMATCH",
        file: "docs/task-ledger.json",
        detail: `task ${task.id} must be in stage ${expectedStage} (approved plan section 4); found ${task.stage}`,
      });
    }
    if (!ALLOWED_STATUSES.has(task.status)) {
      violations.push({
        code: "TRACEABILITY_STATUS",
        file: "docs/task-ledger.json",
        detail: `task ${task.id} has unknown status ${task.status}`,
      });
    }
    if (task.status === "completed" && (!Array.isArray(task.evidence) || task.evidence.length === 0)) {
      violations.push({
        code: "TRACEABILITY_STATUS",
        file: "docs/task-ledger.json",
        detail: `task ${task.id} is completed but records no acceptance evidence`,
      });
    }
    if (task.id === "28" && task.optional !== true) {
      violations.push({
        code: "TRACEABILITY_STATUS",
        file: "docs/task-ledger.json",
        detail: "task 28 must be recorded as optional (skipping it preserves the pictured architecture)",
      });
    }
    if (task.id !== "28" && task.optional === true) {
      violations.push({
        code: "TRACEABILITY_STATUS",
        file: "docs/task-ledger.json",
        detail: `task ${task.id} must not be marked optional`,
      });
    }
    if (!Array.isArray(task.requirements) || task.requirements.length === 0) {
      violations.push({
        code: "TRACEABILITY_UNKNOWN_REQUIREMENT",
        file: "docs/task-ledger.json",
        detail: `task ${task.id} must declare at least one requirement ID`,
      });
    }
    for (const requirementId of task.requirements ?? []) {
      if (!requirementIds.has(requirementId)) {
        violations.push({
          code: "TRACEABILITY_UNKNOWN_REQUIREMENT",
          file: "docs/task-ledger.json",
          detail: `task ${task.id} references unknown requirement ${requirementId}`,
        });
      }
    }
    for (const dependency of task.dependsOn ?? []) {
      if (!taskById.has(dependency)) {
        violations.push({
          code: "TRACEABILITY_UNKNOWN_TASK",
          file: "docs/task-ledger.json",
          detail: `task ${task.id} depends on unknown task ${dependency}`,
        });
      }
    }
  }

  const cycle = findCycle(
    taskIds,
    new Map(tasks.map((task) => [task.id, task.dependsOn ?? []])),
  );
  if (cycle.length > 0) {
    violations.push({
      code: "TRACEABILITY_CYCLE",
      file: "docs/task-ledger.json",
      detail: `system task dependency graph contains a cycle through ${cycle.join(", ")}`,
    });
  }

  for (const requirement of baseline.requirements ?? []) {
    if (
      !Array.isArray(requirement.taskIds) ||
      requirement.taskIds.length === 0
    ) {
      violations.push({
        code: "TRACEABILITY_REQUIREMENT_COVERAGE",
        file: "docs/architecture-baseline.json",
        detail: `requirement ${requirement.id} maps to no task`,
      });
      continue;
    }
    for (const taskId of requirement.taskIds) {
      if (!taskById.has(taskId)) {
        violations.push({
          code: "TRACEABILITY_UNKNOWN_TASK",
          file: "docs/architecture-baseline.json",
          detail: `requirement ${requirement.id} references unknown task ${taskId}`,
        });
      }
    }
    if (requirement.finalConformanceTask !== "30") {
      violations.push({
        code: "TRACEABILITY_REQUIREMENT_COVERAGE",
        file: "docs/architecture-baseline.json",
        detail: `requirement ${requirement.id} must name final conformance task 30`,
      });
    }
  }

  for (const component of baseline.components ?? []) {
    for (const taskId of component.tasks ?? []) {
      if (!taskById.has(taskId)) {
        violations.push({
          code: "TRACEABILITY_UNKNOWN_TASK",
          file: "docs/architecture-baseline.json",
          detail: `component ${component.id} references unknown task ${taskId}`,
        });
      }
    }
  }

  for (const doc of [
    ledger.spec,
    ledger.plan,
    baseline.spec,
    baseline.plan,
  ]) {
    if (doc && !existsSync(resolve(repoRoot, doc))) {
      violations.push({
        code: "TRACEABILITY_MISSING_FILE",
        file: doc,
        detail: `referenced document ${doc} does not exist`,
      });
    }
  }
}

function verifyUiLedger(repoRoot, uiBaseline, uiLedger, violations) {
  const tasks = uiLedger.tasks ?? [];
  const taskIds = tasks.map((task) => task.id);
  if (JSON.stringify(taskIds) !== JSON.stringify(UI_TASK_IDS)) {
    violations.push({
      code: "TRACEABILITY_UI_TASK_SET",
      file: "docs/ui-task-ledger.json",
      detail: `UI ledger must contain tasks U01..U22 in order; found ${taskIds.join(",")}`,
    });
    return;
  }
  const uiRequirementIds = new Set(
    (uiBaseline.requirements ?? []).map((requirement) => requirement.id),
  );
  const uiTaskById = new Map(tasks.map((task) => [task.id, task]));
  const systemTaskIds = new Set(SYSTEM_TASK_IDS);

  for (const task of tasks) {
    if (!Array.isArray(task.requirements) || task.requirements.length === 0) {
      violations.push({
        code: "TRACEABILITY_UNKNOWN_REQUIREMENT",
        file: "docs/ui-task-ledger.json",
        detail: `UI task ${task.id} must declare at least one requirement ID`,
      });
    }
    for (const requirementId of task.requirements ?? []) {
      if (!uiRequirementIds.has(requirementId)) {
        violations.push({
          code: "TRACEABILITY_UNKNOWN_REQUIREMENT",
          file: "docs/ui-task-ledger.json",
          detail: `UI task ${task.id} references unknown requirement ${requirementId}`,
        });
      }
    }
    for (const dependency of task.dependsOn ?? []) {
      if (!uiTaskById.has(dependency)) {
        violations.push({
          code: "TRACEABILITY_UNKNOWN_TASK",
          file: "docs/ui-task-ledger.json",
          detail: `UI task ${task.id} depends on unknown UI task ${dependency}`,
        });
      }
    }
    for (const dependency of task.backendDependsOn ?? []) {
      if (!systemTaskIds.has(dependency)) {
        violations.push({
          code: "TRACEABILITY_UNKNOWN_TASK",
          file: "docs/ui-task-ledger.json",
          detail: `UI task ${task.id} depends on unknown system task ${dependency}`,
        });
      }
    }
  }

  const cycle = findCycle(
    taskIds,
    new Map(tasks.map((task) => [task.id, task.dependsOn ?? []])),
  );
  if (cycle.length > 0) {
    violations.push({
      code: "TRACEABILITY_CYCLE",
      file: "docs/ui-task-ledger.json",
      detail: `UI task dependency graph contains a cycle through ${cycle.join(", ")}`,
    });
  }

  for (const requirement of uiBaseline.requirements ?? []) {
    if (
      !Array.isArray(requirement.taskIds) ||
      requirement.taskIds.length === 0
    ) {
      violations.push({
        code: "TRACEABILITY_REQUIREMENT_COVERAGE",
        file: "docs/ui-baseline.json",
        detail: `UI requirement ${requirement.id} maps to no task`,
      });
      continue;
    }
    for (const taskId of requirement.taskIds) {
      if (!uiTaskById.has(taskId)) {
        violations.push({
          code: "TRACEABILITY_UNKNOWN_TASK",
          file: "docs/ui-baseline.json",
          detail: `UI requirement ${requirement.id} references unknown task ${taskId}`,
        });
      }
    }
    if (requirement.conformanceTask !== "U21") {
      violations.push({
        code: "TRACEABILITY_REQUIREMENT_COVERAGE",
        file: "docs/ui-baseline.json",
        detail: `UI requirement ${requirement.id} must name conformance task U21`,
      });
    }
  }

  const sections = uiBaseline.sections ?? [];
  const expectedKeys = EXPECTED_UI_SECTIONS.map(
    (section) => `${section.id}|${section.label}|${section.route}`,
  );
  const actualKeys = sections.map(
    (section) => `${section.id}|${section.label}|${section.route}`,
  );
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    violations.push({
      code: "TRACEABILITY_FLOW_MISMATCH",
      file: "docs/ui-baseline.json",
      detail: "the seven primary sections must keep their approved IDs, labels, routes, and order",
    });
  }
  for (const section of sections) {
    for (const taskId of section.tasks ?? []) {
      if (!uiTaskById.has(taskId)) {
        violations.push({
          code: "TRACEABILITY_UNKNOWN_TASK",
          file: "docs/ui-baseline.json",
          detail: `section ${section.id} references unknown task ${taskId}`,
        });
      }
    }
  }

  const forbiddenRoutes = uiBaseline.forbiddenPrimaryRoutes ?? [];
  if (
    JSON.stringify([...forbiddenRoutes].sort()) !==
    JSON.stringify([...EXPECTED_FORBIDDEN_ROUTES].sort())
  ) {
    violations.push({
      code: "TRACEABILITY_FLOW_MISMATCH",
      file: "docs/ui-baseline.json",
      detail: "no eighth primary route may be introduced; forbidden routes must remain the approved set",
    });
  }

  const events = uiBaseline.events ?? [];
  for (const event of CANONICAL_INTERACTION_EVENTS) {
    if (!events.includes(event)) {
      violations.push({
        code: "TRACEABILITY_FLOW_MISMATCH",
        file: "docs/ui-baseline.json",
        detail: `canonical interaction event ${event} is missing; clarification and approval contracts must remain separate (F04)`,
      });
    }
  }

  const gates = uiBaseline.milestoneGates ?? {};
  const gateMembers = [
    ...(gates.demo ?? []),
    ...(gates.protectedLiveFlow ?? []),
    ...(gates.release ?? []),
  ];
  const gateSet = new Set(gateMembers);
  if (gateMembers.length !== gateSet.size) {
    violations.push({
      code: "TRACEABILITY_FLOW_MISMATCH",
      file: "docs/ui-baseline.json",
      detail: "milestone gates overlap; each UI task belongs to exactly one gate",
    });
  }
  const missingFromGates = UI_TASK_IDS.filter((id) => !gateSet.has(id));
  if (missingFromGates.length > 0) {
    violations.push({
      code: "TRACEABILITY_FLOW_MISMATCH",
      file: "docs/ui-baseline.json",
      detail: `milestone gates must cover all UI tasks; missing ${missingFromGates.join(", ")}`,
    });
  }

  for (const doc of [
    uiLedger.spec,
    uiLedger.plan,
    uiBaseline.spec,
    uiBaseline.plan,
  ]) {
    if (doc && !existsSync(resolve(repoRoot, doc))) {
      violations.push({
        code: "TRACEABILITY_MISSING_FILE",
        file: doc,
        detail: `referenced document ${doc} does not exist`,
      });
    }
  }
}

function main() {
  const repoRoot = resolve(process.argv[2] ?? repositoryRoot);
  const baseline = loadJson(repoRoot, "docs/architecture-baseline.json");
  const ledger = loadJson(repoRoot, "docs/task-ledger.json");
  const uiBaseline = loadJson(repoRoot, "docs/ui-baseline.json");
  const uiLedger = loadJson(repoRoot, "docs/ui-task-ledger.json");

  for (const [name, loaded] of [
    ["docs/architecture-baseline.json", baseline],
    ["docs/task-ledger.json", ledger],
    ["docs/ui-baseline.json", uiBaseline],
    ["docs/ui-task-ledger.json", uiLedger],
  ]) {
    if (loaded.missing) {
      console.error(
        JSON.stringify({
          ok: false,
          violations: [
            {
              code: "TRACEABILITY_MISSING_FILE",
              file: name,
              detail: `required document ${name} does not exist`,
            },
          ],
        }),
      );
      process.exit(1);
    }
  }

  const violations = [];
  verifySystemLedger(repoRoot, baseline.data, ledger.data, violations);
  verifyUiLedger(repoRoot, uiBaseline.data, uiLedger.data, violations);

  console.log(
    JSON.stringify(
      {
        ok: violations.length === 0,
        violations,
        target: "docs/",
      },
      null,
      2,
    ),
  );
  process.exit(violations.length === 0 ? 0 : 1);
}

main();
