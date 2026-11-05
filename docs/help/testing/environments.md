---
title: "Isolated test environments"
status: "PROPOSED DESIGN"
verification: "NOT RUN"
updated: "2026-11-05"
---

# Isolated test environments

Use disposable project roots, SQLite paths and Electron user-data directories. Reserve local ports explicitly. Database tests must establish path isolation before imports. Clean only verified owned fixture paths; never prune Docker globally, reset a working store or close unrelated user processes.

Guest tests require approved image/profile qualification. Model tests require exact provider/model/cost approval. External deployment tests require an approved isolated target and rollback. Do not infer any of these permissions from the roadmap.

Evidence names the actual adapter and whether it was a controlled double. Keep keys, tokens, private document contents and raw sensitive screenshots out of artifacts. Source hashes and sanitized receipts are preferred for reproducibility.
