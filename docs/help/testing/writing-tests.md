---
title: "Writing behavior tests"
status: "PROPOSED DESIGN"
verification: "NOT RUN"
updated: "2026-11-05"
---

# Writing behavior tests

Name the invariant and its canonical owner. Drive the public entry through that owner and the real relevant boundary. Assert both desired state and absence of forbidden effects. Helper-only tests cannot prove a disconnected production path.

Use simultaneous callers for leases/admission, process termination around mutation/receipt boundaries for recovery, Windows junction/cross-drive variants for containment, and stale/replayed grants for approvals. Verify cancel propagates to upstream and frees resources. For verifiers, remove a required receipt and require UNKNOWN, then substitute an artifact digest and require rejection.

After repair run the original consumer journey again. Never remove assertions or replace actual dispatch with simulated success to obtain a pass. Preserve failed evidence. A feature is accepted only for the source/profile actually tested.
