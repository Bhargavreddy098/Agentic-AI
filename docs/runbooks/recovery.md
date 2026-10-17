# Recovery Runbook

> **Current platform scope — 2026-10-15:** Build and deploy the Windows version only. Linux is allowed only as an optional VM guest for qualified isolation; standalone Linux hosts/releases are deferred. This supersedes earlier platform assumptions in this document. PostgreSQL/Redis and ordinary integration/security tests remain in the Windows work queue. Preserve required protections and tests; unsupported executable paths stay disabled. See ADR 0004.

> Qualification notice (2026-10-10): this is the Task19 operational reference. Consult [the consolidated guide](../v2-build-guide.md#start-here) and live task qualification before using these procedures. Example endpoints, commands, alerts and deployment snippets require matching implementation and service acceptance; this document does not certify them.


## Overview

This runbook covers the recovery procedures for the ASI agent system, including run recovery, approval management, circuit breaker handling, and fault injection testing.

## Architecture Overview

The recovery system consists of:

1. **Run Recovery** (`packages/orchestrator/src/recover.ts`) - Recovers interrupted runs from checkpoints
2. **Retry Logic** (`packages/orchestrator/src/retry.ts`) - Jittered exponential backoff with error classification
3. **Circuit Breakers** (`packages/orchestrator/src/circuit-breaker.ts`) - Per-dependency circuit breakers
4. **Approval Management** (`packages/gateway/src/approvals.ts`) - Human-in-the-loop approval workflows

## Recovery Procedures

### 1. Run Recovery

#### Automatic Recovery
The system automatically attempts to recover runs that:
- Are in `running`, `awaiting_tool`, `awaiting_approval`, or `awaiting_model` status
- Have not been updated for more than 5 minutes
- Have a valid checkpoint (not older than 24 hours)

#### Manual Recovery
If automatic recovery fails:

```bash
# List runs needing recovery
psql -d asi_test -c "SELECT run_id, status, updated_at FROM run_state WHERE status IN ('running', 'awaiting_tool', 'awaiting_approval', 'awaiting_model') AND updated_at < NOW() - INTERVAL '5 minutes';"

# Manually trigger recovery for a specific run
# (Requires API call to /runs/:runId/recover endpoint)
```

#### Recovery Failure Handling
If a run cannot be recovered:
1. Run is marked with status `reconciliation_pending`
2. Reason is recorded in `reconciliation_reason` field
3. Alert is sent to on-call operator
4. Manual intervention required

### 2. Circuit Breaker Management

#### Viewing Circuit Breaker Status
```bash
# View all circuit breakers
curl -X GET http://localhost:8080/circuit-breakers/stats

# View specific dependency
curl -X GET http://localhost:8080/circuit-breakers/stats/<dependency-id>
```

#### Manual Circuit Breaker Operations

**Force Open (Emergency Stop):**
```bash
curl -X POST http://localhost:8080/circuit-breakers/<dependency-id>/force-open
```

**Reset to Closed:**
```bash
curl -X POST http://localhost:8080/circuit-breakers/<dependency-id>/reset
```

**View Metrics:**
```bash
curl -X GET http://localhost:8080/circuit-breakers/stats
```

#### Circuit Breaker Configuration
Default thresholds:
- Failure threshold: 5 consecutive failures
- Success threshold (half-open): 2 successes
- Timeout: 30 seconds
- Half-open max requests: 3

To modify:
```bash
curl -X PUT http://localhost:8080/circuit-breakers/<dependency-id>/config \
  -H "Content-Type: application/json" \
  -d '{"failureThreshold": 10, "timeoutMs": 60000}'
```

### 3. Approval Management

#### Viewing Pending Approvals
```bash
# List all pending approvals
curl -X GET http://localhost:8080/approvals/pending

# For specific run
curl -X GET http://localhost:8080/approvals/pending?runId=<run-id>
```

#### Approving/Denying
```bash
# Approve
curl -X POST http://localhost:8080/approvals/<approval-id>/approve \
  -H "Content-Type: application/json" \
  -d '{"principal": {...}, "reason": "Approved by operator"}'

# Deny
curl -X POST http://localhost:8080/approvals/<approval-id>/deny \
  -H "Content-Type: application/json" \
  -d '{"principal": {...}, "reason": "Security policy violation"}'
```

#### Cleanup Expired Approvals
```bash
# Manual cleanup (runs automatically every hour)
curl -X POST http://localhost:8080/approvals/cleanup
```

### 4. Fault Injection Testing

The system includes a fault injection framework for testing recovery:

```bash
# Run fault injection tests
npm run test:fault-injection

# Specific fault scenarios:
npm run test:fault-injection -- --scenario=provider-429
npm run test:fault-injection -- --scenario=postgres-failure
npm run test:fault-injection -- --scenario=redis-partition
npm run test:fault-injection -- --scenario=sqlite-disk-full
npm run test:fault-injection -- --scenario=kill-before-checkpoint
npm run test:fault-injection -- --scenario=kill-after-checkpoint
npm run test:fault-injection -- --scenario=expired-approval
npm run test:fault-injection -- --scenario=provider-429-retry
```

#### Test Scenarios

| Scenario | Description | Expected Outcome |
|----------|-------------|------------------|
| `provider-429` | Provider returns 429 rate limit | Circuit breaker opens, retries with backoff |
| `postgres-failure` | PostgreSQL connection fails | Circuit breaker opens, run marked for reconciliation |
| `redis-partition` | Redis network partition | Circuit breaker opens, cached data served |
| `sqlite-disk-full` | SQLite disk full error | Run fails, marked for reconciliation |
| `kill-before-checkpoint` | Process killed before checkpoint | Run cannot recover, marked for reconciliation |
| `kill-after-checkpoint` | Process killed after checkpoint | Run recovers from checkpoint |
| `expired-approval` | Approval expires before decision | Run marked failed, notification sent |
| `provider-429-retry` | Provider 429 with retry | Jittered backoff, eventual success |

### 5. Recovery Commands

#### Operator Commands

| Command | Description |
|---------|-------------|
| `recover-runs` | Trigger automatic recovery of interrupted runs |
| `recover-run <run-id>` | Manually recover specific run |
| `reconcile-run <run-id>` | Manually reconcile run |
| `circuit-breaker status <dep-id>` | View circuit breaker status |
| `circuit-breaker reset <dep-id>` | Reset circuit breaker to closed |
| `circuit-breaker force-open <dep-id>` | Force circuit breaker open |
| `approval list` | List pending approvals |
| `approval approve <id> --reason "..."` | Approve a pending approval |
| `approval deny <id> --reason "..."` | Deny a pending approval |
| `recovery replay <run-id>` | Replay run from checkpoint |
| `recovery reconcile <run-id>` | Manually reconcile run |

#### Example Usage

```bash
# Recover all interrupted runs
npx tsx packages/orchestrator/src/recover.ts --limit 50

# Recover specific run
npx tsx packages/orchestrator/src/recover.ts --run-id run-abc123

# Check circuit breaker status
npx tsx packages/orchestrator/src/circuit-breaker.ts --status

# List pending approvals
npx tsx packages/gateway/src/approvals.ts --list-pending
```

## Monitoring and Alerts

### Key Metrics to Monitor

| Metric | Warning Threshold | Critical Threshold |
|--------|------------------|-------------------|
| Run recovery rate | < 90% | < 70% |
| Circuit breaker open rate | > 10% | > 30% |
| Pending approvals age | > 1 hour | > 4 hours |
| Recovery time | > 5 min | > 15 min |
| Reconciliation queue | > 10 | > 50 |

### Alerting Rules

```yaml
# Prometheus alerts (example)
- alert: HighRecoveryFailureRate
  expr: rate(recovery_failures_total[5m]) / rate(recovery_attempts_total[5m]) > 0.3
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "High recovery failure rate"

- alert: CircuitBreakerOpen
  expr: circuit_breaker_state{state="open"} == 1
  for: 2m
  labels:
    severity: warning
  annotations:
    summary: "Circuit breaker {{ $labels.dependency }} is open"

- alert: PendingApprovalsAging
  expr: time() - approvals_requested_at_timestamp > 3600
  for: 1h
  labels:
    severity: warning
  annotations:
    summary: "Pending approval older than 1 hour"
```

## Recovery Scenarios Reference

### Scenario 1: Provider Returns 429 (Rate Limited)

1. **Detection**: Tool call returns 429 status
2. **Classification**: `RATE_LIMITED` error → `retry` decision
3. **Backoff**: Exponential backoff with jitter (1s, 2s, 4s, 8s, 16s, max 30s)
4. **Circuit Breaker**: Failure count increments, may trip after 5 failures
5. **Retry**: Up to 3 attempts with exponential backoff
6. **Recovery**: On success, circuit breaker resets; on continued failure, circuit opens

### Scenario 2: PostgreSQL Failure

1. **Detection**: Database connection/query fails
2. **Classification**: `DEPENDENCY_UNAVAILABLE` → `retry`
3. **Circuit Breaker**: Trips after 5 failures
4. **Run State**: Run marked `awaiting_recovery`
5. **Recovery**: After DB recovers, run resumes from checkpoint
6. **Reconciliation**: If no checkpoint, run goes to `reconciliation_pending`

### Scenario 3: Redis Partition

1. **Detection**: Redis connection timeout
2. **Classification**: `DEPENDENCY_UNAVAILABLE` → `retry`
3. **Circuit Breaker**: Opens after 5 failures
4. **Graceful Degradation**: Serve stale cache data if available
5. **Recovery**: Auto-recovers when Redis available

### Scenario 4: SQLite Disk Full

1. **Detection**: SQLite returns `SQLITE_FULL`
2. **Classification**: `RESOURCE_EXHAUSTED` → `fail`
3. **Run State**: Marked `failed`
4. **Alert**: Critical alert to operator
5. **Resolution**: Manual cleanup required, then run replay

### Scenario 5: Process Killed Before Checkpoint

1. **Detection**: Run stuck in `running` status > 5 minutes
2. **Checkpoint Check**: No valid checkpoint found
3. **Action**: Mark `reconciliation_pending` with reason "No checkpoint available"
4. **Operator Action**: Manual review required

### Scenario 6: Process Killed After Checkpoint

1. **Detection**: Run stuck in `running` status > 5 minutes
2. **Checkpoint Check**: Valid checkpoint found (< 24 hours old)
3. **Recovery**: Reconstruct state from checkpoint
4. **Resume**: Continue execution from checkpoint
5. **Verification**: Compare output hash with expected

### Scenario 7: Expired Approval

1. **Detection**: Approval `expires_at` < `NOW()` and status = `pending`
2. **Action**: Auto-update status to `expired`
5. **Run Impact**: Parent run marked `failed` with reason "Approval expired"
6. **Notification**: Alert sent to requestor

### Scenario 8: Provider 429 with Retry

1. **Detection**: Tool call returns 429
2. **Classification**: `RATE_LIMITED` → `retry`
3. **Backoff**: 1s, 2s, 4s, 8s, 16s, 30s (max)
6. **Circuit Breaker**: Tracks failures per provider
7. **Recovery**: On success, breaker resets; continues execution

## Escalation Procedures

### Level 1: Automated Recovery
- Automatic retry with backoff
- Circuit breaker management
- Checkpoint-based run recovery

### Level 2: Operator Intervention
- Manual approval/denial
- Circuit breaker reset
- Manual run recovery
- Approval expiry handling

### Level 3: Engineering Escalation
- Database corruption
- Persistent circuit breaker trips
- Data inconsistency detected
- Security incident

## Contact Information

- **Primary On-Call**: #asi-oncall Slack channel
- **Escalation**: #asi-escalation Slack channel
- **Documentation**: Confluence space "ASI Operations"
- **Runbooks**: This document + individual component runbooks

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-09 | System | Initial version |