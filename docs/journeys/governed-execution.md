---
title: "Governed execution sequence"
status: "PROPOSED DESIGN"
verification: "NOT RUN"
updated: "2026-11-05"
---

# Governed execution sequence

```mermaid
sequenceDiagram
 actor User
 participant UI
 participant Gateway
 participant Runtime
 participant Policy
 participant DB
 participant Tool
 participant Verifier
 User->>UI: Submit goal
 UI->>Gateway: Authenticated scoped request
 Gateway->>Runtime: Approved contract revision
 Runtime->>Policy: Evaluate exact effect
 Policy-->>UI: Approval request when required
 User->>Gateway: Decide
 Gateway->>Policy: Trusted decision
 Policy-->>Runtime: Permit or deny
 Runtime->>DB: Record stable operation identity
 Runtime->>Tool: Qualified bounded action
 Tool-->>Runtime: Actual receipt or uncertainty
 Runtime->>DB: Persist result
 Runtime->>Verifier: Artifact and fixed criteria
 Verifier-->>Runtime: Pass, fail or unknown with evidence
 Runtime-->>UI: Durable state events
```

On restart reconcile operation identity and receipt before retry. On cancellation stop new dispatch and preserve completed effects. On scope change request a fresh approval. On disconnect replay observation rather than reissuing mutation.

Acceptance covers a real successful change, rejected approval, absent verifier receipt, crash before/after effect, stale fence and consumer restoration. All remain NOT RUN until executed on a qualified isolated environment.
