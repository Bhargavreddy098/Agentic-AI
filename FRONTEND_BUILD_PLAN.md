# Frontend entry point

> **Current platform scope — 2026-10-15:** Build and deploy the Windows version only. Linux is allowed only as an optional VM guest for qualified isolation; standalone Linux hosts/releases are deferred. This supersedes earlier platform assumptions in this document. PostgreSQL/Redis and ordinary integration/security tests remain in the Windows work queue. Preserve required protections and tests; unsupported executable paths stay disabled. See ADR 0004.

Start with [the consolidated V2 build guide](docs/v2-build-guide.md#start-here). It is the combined backend/frontend roadmap and agent handoff. The current human order is backend first, then frontend, then remaining V2 work.

When assigned frontend work, run these read-only commands from the workspace root:

```powershell
node scripts/v2-task.mjs next
node scripts/v2-task.mjs show U08
```

Replace U08 with the assigned exact task ID. Check [the UI ledger](docs/ui-task-ledger.json), [V2 qualification ledger](docs/v2-task-ledger.json) and [approved UI baseline](docs/ui-baseline.json) before editing. U01–U07 are recorded completed; U08–U22 are pending as of 2026-10-10. Completed labels still require the applicable M05–M11 reuse qualification; the navigator does not certify runtime acceptance. The original UI plan remains a task-brief source, not a second execution roadmap.

Keep exactly seven sections: Chat, Models & Providers, Skills, Tools & Connections, Memory, Activity & Tasks, Settings. Questions, approvals and their canonical decision controls belong inside Chat. Management requests and Activity links open the owning conversation. Use one conversation store, one GatewayClient and qualified vendor wrappers; mock/live modes are explicit. AI Elements is the approved presentation choice; qualify its consumed subset through the owning migration card.

Implement one assigned, reviewed, qualified task at a time. Record fresh acceptance evidence in the owning ledger. See root AGENTS.md for all architecture and approval rules.
