# Durable orchestration, effects, and recovery

## Selected execution model

Use PostgreSQL-backed runs, task DAGs, leases, checkpoints, effect journal, and transactional outbox for a deliberately bounded local workflow. The API accepts commands and returns promptly; a trusted dispatcher advances ready tasks. Model calls are activities whose inputs/outputs are persisted. An LLM does not hold the continuation in its prompt.

Why this exists: processes crash, the machine sleeps, provider calls fail, and user approvals may take hours. In-memory queues or a single async function cannot safely own that lifecycle. Alternatives and the conditions for adopting Temporal are documented in [decisions](12-DECISIONS-AND-RESEARCH.md).

## State machines

| Run state | Allowed next states | Guard |
| --- | --- | --- |
| `queued` | executing, blocked, cancelling | Exact contract approval, session/grants valid and prerequisites qualified |
| `executing` | awaiting_effect_approval, paused, verifying, blocked, cancelling, failed | State-specific transactional checks |
| `awaiting_effect_approval` | executing, blocked, cancelling | Approval binds prepared action digest and target |
| `paused` | executing, blocked, cancelling | Safe checkpoint, still-current grants/budget, valid pinned revision |
| `verifying` | repairing, verified, blocked, cancelling, failed | Verifier controls result; required unknown cannot pass |
| `repairing` | executing, verifying, blocked, failed, cancelling | Repair budget available; scope unchanged |
| `blocked` | executing, verifying, cancelling, failed | Recorded blocker actually resolved under the same pinned contract; epoch advanced when ownership changes |
| `cancelling` | cancelled, blocked | Worker termination and side-effect reconciliation complete |
| `verified` | terminal | Artifact verified; deployment is a separate operation or separately required criterion |
| `failed` / `cancelled` | terminal | New run required for a fresh attempt; preserve history |

Planning before a Build Contract uses a durable `control.operations` row with a goal, budget, privacy policy, and read-only permissions. Goal states include planning and awaiting approval; execution runs do not. `control.runs` always pins an approved contract. When a material change requires a new contract, block/cancel the affected old run and create a successor run after new approval. Never repoint the old run to a different contract. Reuse prior artifacts only as explicitly checked inputs to the successor.

Task states: queued → running → succeeded/failed/blocked/cancelling; cancelling → cancelled/unknown. Retry transitions failed → queued only under an allowed class and remaining attempt budget. Unknown tasks/effects require reconciliation. Dependencies become ready only when their required predecessors succeed; optional branches must be marked optional in the approved plan.

## Leasing and fencing

Initial tunable limits: lease 60 seconds, heartbeat every 15 seconds, recovery scan every 15 seconds, task output deadline from contract, maximum three delivery attempts for retry-safe activities. Use database time for lease decisions to avoid host clock disagreement. Dispatcher claims tasks with row locks and increments `lease_epoch`; run ownership has its own epoch. Include both in every assignment, heartbeat, receipt, and state write.

An expired lease is not proof the old worker stopped. Revoke its capability, advance the epoch, and make its future writes fail. Before reassigning an effect, reconcile its outcome. Fencing a database writer alone cannot stop a delayed network request, so the broker must also check grant expiry/epoch at dispatch and use provider idempotency where supported.

Never hold a SQL transaction open while waiting for a model, user approval, browser action, or subprocess. Keep transactions short; external work follows a committed intent. Bound ready queue scanning and use fair scheduling across projects so one large run cannot starve all others.

## Effect protocol

Effect identity is a permanent operation key derived from run + logical task + logical effect index + contract revision, not a new random key for every transport retry. Input digest includes tool revision, target, canonical arguments, workspace snapshot and relevant grant scope. Same key with changed input is a conflict requiring a new planned effect.

1. Validate full input schema and target scope.
2. Evaluate autonomy, permission, privacy, cost and required human approval.
3. Reserve conservative cost ceilings atomically across scopes.
4. Persist prepared effect, binding approval and reservation.
5. Dispatch through trusted broker with a short-lived scoped token.
6. Persist dispatch receipt/external operation ID as soon as available.
7. Validate returned receipt and artifact bytes; mark success/failure/unknown.
8. Settle cost, append outbox/event, and advance task only after committed outcome.

Exactly-once execution of arbitrary external effects is not promised. The platform provides durable identity, at-least-once task delivery, idempotent application where supported, and explicit uncertainty where it is not. A crashed browser click or cloud purchase may be impossible to infer safely; stop and reconcile.

## Crash matrix

| Crash point | Durable evidence | Recovery |
| --- | --- | --- |
| Before transaction commits | No accepted task/effect | Client retries same command key |
| After task commit, before worker receives it | Queued/leased task, no dispatched effect | Expire/fence lease and retry safe assignment |
| After prepared effect, before known dispatch | Prepared intent; delivery may be uncertain | Consult broker dispatch journal; if insufficient evidence, reconcile |
| After external success, before local receipt | Dispatched/unknown effect | Query external operation by stable key/ID; do not blind replay |
| After receipt commit, before task acknowledgment | Completed effect and outbox | Replay acknowledgment/advance once; do not execute again |
| During artifact ingest | Staged object, expected digest | Resume or discard stage; no available artifact until verified |
| During verification | Job and artifact pinned | Re-run idempotent checks under fresh verifier lease |
| During cancellation | Cancel request durable; possibly active effect | Stop new dispatch, terminate worker, reconcile in-flight effect |
| During schedule occurrence creation | Transaction contains occurrence and task together | Unique schedule/time prevents duplicate |

## Pause, cancel, shutdown, and restart

Pause stops new effect dispatch and records a checkpoint once running safe work quiesces. It does not pretend to undo an already submitted external effect. Cancel persists intent, invalidates new capabilities, signals workers, terminates the owned process tree/guest after a grace period, then reconciles receipts. `cancelled` means no new work and known final effects; unknown external operations keep a visible blocked/cancelling status.

Shutdown marks readiness false, stops claims, drains HTTP within a configurable 30-second target, persists checkpoints, stops owned workers, and closes database connections. Never kill unrelated processes to free a port. If forced termination occurs, the startup scanner finds expired leases and unknown effects. Machine sleep is treated as a heartbeat gap; waking must revalidate leases before continuing.

Checkpoint contents: run/contract/plan/policy revisions, current task frontier, completed effect IDs, workspace tree digest, unresolved approvals, context bundle refs, remaining budget/reservations, retry counters, failure fingerprints and schema version. Store artifact references, not secrets or provider hidden reasoning. Checkpoint replay never reissues already committed effects.

## Failure policy and bounded self-repair

| Failure class | Response | Default limit / escalation |
| --- | --- | --- |
| Invalid model output | Validate; one formatting repair if safe | Then planning failure |
| Provider 429/temporary 5xx before effect | Retry with jitter and Retry-After within deadline | Max three attempts; alternate eligible provider only |
| Stream interrupted | Preserve partial output as incomplete, account usage | Fresh model attempt only within budget; never append blindly to typed result |
| Provider auth revoked | Disable connection, request owner action | No retry loop |
| Policy or sandbox denial | Stop affected task | No fallback to host execution |
| Test failure | Classify, snapshot, propose hypothesis, bounded patch, retest | Max three distinct repair hypotheses per criterion, configurable contract ceiling |
| Repeated identical failure | Compare normalized failure + patch fingerprint | Stop after duplicate ineffective repair |
| Regression introduced | Revert only isolated owned changes to last known snapshot | Preserve evidence and user changes; require new hypothesis |
| Unknown external effect | Reconcile by stable external operation | Remain blocked without trustworthy evidence |
| Database unavailable | Stop accepting durable mutations/dispatch | Backoff reconnect; never continue from Map fallback |
| Disk full / corrupt artifact | Stop writes and quarantine invalid objects | Operator repair; do not mark complete |
| Budget exhausted | Block before new work | Owner may increase ceiling explicitly |
| Contract invalidated | Pause affected execution | New revision/approval |

Repair never weakens required tests, deletes failing criteria, or changes success thresholds. A criterion change is a material contract revision. Store hypothesis, touched files, diff digest, test evidence, cost, and outcome. Maintain a clean base snapshot and patch lineage so concurrent user changes are detected rather than overwritten.

## Schedules and event-driven work

Natural-language schedule interpretation yields a proposed recurrence plus timezone, next five occurrences, overlap/misfire policy and budget. Owner sees the resolved times before activation. Default overlap is `skip`; `queue_one` coalesces to one pending occurrence; parallel requires an explicit concurrency ceiling. Default missed runs are `latest` with one catch-up, not unbounded replay after a long shutdown.

Persist IANA timezone and recurrence expression. Define DST policy explicitly: nonexistent local time advances to next valid time; repeated local time executes once using the earlier offset unless configured otherwise. Record the resolved UTC occurrence. Test both transitions even if the initial user timezone does not observe DST.

Scheduler claims due schedule row, computes occurrence, inserts unique `(schedule_id,scheduled_for)` plus goal/task/outbox, and advances next fire time in one transaction. An expired grant or budget blocks occurrence execution without deleting its history. A paused schedule stops future claims; existing runs need separate cancellation.

Webhook path: authenticate signature over raw bytes → enforce timestamp/replay window/body size → insert inbox delivery key → evaluate typed event filter → create goal under trigger grants → plan/approve/execute/verify → local notification/artifact. Duplicate delivery returns accepted without duplicate work. Retries cannot expand the trigger's permission envelope. Outgoing email/chat is a separate external effect requiring authorization.

## When to replace the local workflow core

Reassess Temporal when workflows need many remote workers, complex long-lived timers/signals, cross-region recovery, or repeated custom recovery defects. Compare crash tests and operational costs in a prototype. Migrate through the orchestration port; retain contract/approval/effect/budget ownership and evidence. Do not run two authoritative workflow engines for the same run.
