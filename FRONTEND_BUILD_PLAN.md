# Start Here — Frontend Build Guide

The backend/system guide already exists. The dedicated frontend guide now specifies all seven sections, shared contracts, simulated Gateway, streaming Chat, inline questions/approvals, management pages, real backend integration, and validation.

1. Read [Frontend design](docs/superpowers/specs/2026-10-06-agent-workspace-ui-design.md).
2. Follow [Frontend step-by-step plan — U01–U22](docs/superpowers/plans/2026-10-06-agent-workspace-ui-build.md).
3. Track [UI task ledger](docs/ui-task-ledger.json) and [UI baseline](docs/ui-baseline.json).
4. Use the [system plan](docs/superpowers/plans/2026-10-06-asi-agent-build.md) for backend/security dependencies.

Order: workspace + shared contracts → simulated Gateway → Chat → six management sections → real Gateway/read ports → protected real run flow → release checks.

The seven primary sections are Chat, Models & Providers, Skills, Tools & Connections, Memory, Activity & Tasks, and Settings. Questions, approvals, tool progress, and results render inside Chat. Pending management approvals link to their owning conversation. Conversation history is secondary navigation inside Chat.

All implementation tasks are pending. AI Elements is the proposed primary presentation layer; the user's eleven UI-library sources are mapped in the design and qualified at U01. No packages or product code were installed for this planning request. An agent should implement only its assigned ready task after the human reviews the proposed plan and authorizes execution.
