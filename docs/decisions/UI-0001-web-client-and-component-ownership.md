# UI-0001 — Web client priority and frontend component ownership

Status: PROPOSED design choice; frontend planning requested by the user. Date: 2026-10-06.

Context: the original research/system plan used CLI as its first surface. The user requested a frontend guide with sidebar sections, model/provider/skill management and questions/approvals inside Chat, using the supplied UI-library catalog.

Decision proposal: add apps/web within the existing `channels` component; prioritize a web Chat surface. Preserve all 12 architecture components, the Gateway entry point and backend security gates. The web UI has seven primary sections; canonical question/approval controls render only in Chat. One store/client and reviewed wrappers prevent agents from adding competing runtimes or approval pages.

Proposed stack: AI Elements presentation with React/Next/Tailwind/shadcn and application-owned state. All eleven user sources are in a qualification inventory; the primary choice remains subject to the user's reply/review. No dependencies are installed by this document.

Build impact: shared contracts + development-only simulated Gateway enable early frontend implementation. U17 provides basic browser Gateway projections after underlying identity/control/episode/policy work; system task 16 is completed only after the real protected run flow. U18 tracks exact backend-port readiness; U19 proves real execution. CLI/Slack can use the same Gateway later.

Security impact: no browser/Next model generation, direct tool/DB access, provider secret persistence, or UI-owned approval authority. Development mocks cannot fall back into live mode. Management approval requests navigate to backend-owned conversations with the same typed interaction rendering.

Migration/rollback: no deployed application exists. Reverting the frontend extension removes web files/guide references while preserving the original system task IDs and graph. Changing primary UI library affects wrappers/source inventory, not the conversation/approval wire contracts or backend authority.

Human review: pending for the proposed stack/design/execution method. The request authorizes this planning artifact, not product implementation or deployment.
