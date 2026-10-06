# Implementation audit and next build sequence

The approved system plan has 30 tasks and the UI plan has 22. At this checkpoint **8 of 52 are completed**: system 01–02 and UI U01–U06. Source presence is not completion; both ledgers hold the evidence.

The initial audit found only system 01 recorded complete, unfinished contracts and no UI implementation. Existing contract work was retained. Important defects corrected include invalid calendar dates, lossy JSON serialization, inconsistent tenancy, broken public exports, and protected-file parsing. Fresh reviews also found cancelled decisions could resume, old timers could complete another run, uploads bypassed the client transport, and stale/unbounded recovery could corrupt Chat state. Regression tests now cover these defects.

Strength: appropriate for a tested foundation and explicit synthetic UI development. It is not production-ready: policy, durable execution, identity, RLS, provider privacy, real approvals, isolation, persistence and live interoperability remain pending backend tasks. Synthetic upload scanning and synthetic task completion must never be presented as real security or real execution.

The frontend uses qualified pinned AI Elements Conversation/Message and shadcn Button/Textarea through project adapters. The eleven requested catalogs are accounted for in the component inventory; alternate catalogs are not installed as competing chat runtimes. Navigation has exactly Chat, Models & Providers, Skills, Tools & Connections, Memory, Activity & Tasks, Settings. Questions, approvals, task/tool cards and their canonical action controls belong inside Chat.

Continue sequentially:

1. Completed U06: controlled composer, limits, upload quarantine, store-owned idempotent retries and server-confirmed cancellation. Continue at U07.
2. U07: safe messages/streaming, follow-scroll, citations, status and error notices.
3. U08–U09: separate clarification and approval cards; management results navigate to the owning Chat. Review authority boundaries before completion.
4. U10: tool/task outcomes and bounded safe artifacts.
5. U11–U16: implement the six management sections against the same GatewayClient, with truthful availability and permissions.
6. U20: consistent responsive/a11y presentation and demo gate.
7. System 03–16/19: implement and qualify trusted backend boundaries before U17–U19 live wiring. Pending deployment decisions and Linux isolation qualification remain recorded in the baseline ADR.
8. U21–U22 and remaining system tasks: adverse cases, release checks and handoff. Preserve dependency ordering in the complete plans; this list summarizes, rather than replaces, them.

Checkpoint verification: 170 unit tests, four production-browser composer/navigation/history tests, strict root/UI type checks, lint, production UI/fixture builds and architecture/dependency/traceability/UI source/boundary verifiers pass. Protected-file drift is expected while reviewed files are uncommitted; the explicit ADR-backed commit restores that gate. See UI-0003 for review findings and import-resolution decisions.

