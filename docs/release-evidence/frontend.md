# Frontend Release Evidence and Operator Handoff (U22)

- **Date:** 2026-10-17
- **Target Platform:** Windows development and deployment (per [ADR 0004](../decisions/0004-windows-only-current-release.md))
- **Release State:** Qualified Frontend Workspace Baseline (Tasks U01–U22)
- **Specification:** [docs/superpowers/specs/2026-10-06-agent-workspace-ui-design.md](../superpowers/specs/2026-10-06-agent-workspace-ui-design.md)
- **Implementation Plan:** [docs/superpowers/plans/2026-10-06-agent-workspace-ui-build.md](../superpowers/plans/2026-10-06-agent-workspace-ui-build.md)
- **UI Baseline Document:** [docs/ui-baseline.json](../ui-baseline.json)
- **Task Ledger:** [docs/ui-task-ledger.json](../ui-task-ledger.json)
- **Component Inventory:** [docs/ui-component-inventory.json](../ui-component-inventory.json)
- **Wire Compatibility Digest:** [docs/release-evidence/ui-wire-compatibility.json](./ui-wire-compatibility.json)

---

## 1. Frozen Verification and Execution Summary

All test suites and verification scripts have been executed on the live Windows host environment (`Node v24.19.0`, `pnpm 12.6.0`, `Next.js 16.3.8 Turbopack`, `Playwright 1.58.2`).

| Verification Gate | Command | Exit Code | Results Summary |
|---|---|:---:|---|
| **Frozen Dependency Integrity** | `pnpm install --frozen-lockfile` | `0` | Lockfile up-to-date; resolution skipped; zero unauthorized packages installed. |
| **Workspace TypeScript Typecheck** | `pnpm ui:typecheck` | `0` | Clean typecheck across `@asi/ui` and `@asi/web`. Zero errors. |
| **Optimized Turbopack Build** | `pnpm ui:build` | `0` | Next.js compiled successfully in ~1.2s; 10 routes generated (`/`, `/_not-found`, `/activity`, `/chat`, `/chat/[conversationId]`, `/connections`, `/memory`, `/models`, `/settings`, `/skills`). |
| **Frontend Unit & Component Tests** | `pnpm ui:test` | `0` | **31 test files passed, 210/210 tests passed**. Covers contracts, state reducer, composer, navigation, chat, approval, clarification, and catalog views. |
| **UI Security & Conformance Suite** | `pnpm ui:test:security` | `0` | **4 test files passed, 22/22 tests passed**. Covers route conformance, single-store ownership, zero provider SDK leaks, secret exposure prevention, write-only credentials, and double-decision/stale-epoch race protection. |
| **UI Boundary Verification** | `node scripts/verify-ui-boundaries.mjs .` | `0` | Zero boundary violations. |
| **UI Source Verification** | `node scripts/verify-ui-sources.mjs .` | `0` | Zero source/license violations against `docs/ui-component-inventory.json`. |
| **Full UI Verification Pipeline** | `pnpm ui:verify` | `0` | Executes typecheck, build, test, test:security, verify:boundaries, and verify:sources sequentially with zero errors. |
| **Playwright End-to-End Suite** | `pnpm ui:test:e2e` | `0` | **26/26 tests passed (56.8s)** across foundation, navigation, composer, cards, protected-flow, and V2 features. |
| **Playwright Accessibility Suite** | `pnpm ui:test:a11y` | `0` | **16/16 tests passed (24.2s)**. Automated Axe scanning on all 7 routes + dark theme; keyboard focus rings; mobile drawer focus trap; live announcements; reduced motion; responsive 390/768/1440px. |
| **Playwright Visual Matrix Suite** | `pnpm ui:test:visual` | `0` | **6/6 tests passed (27.8s)** across full matrix: mobile (390px), tablet (768px), and desktop (1440px) in light and dark themes. |
| **12-Node System Architecture** | `node scripts/verify-architecture.mjs .` | `0` | 421 files scanned; zero architecture boundary violations. Baseline preserved. |
| **Traceability Gate** | `node scripts/verify-traceability.mjs .` | `0` | Zero broken task/requirement linkages. |
| **Protected Files Gate** | `node scripts/verify-protected-files.mjs .` | `0` | 25 protected governance patterns enforced. |

---

## 2. Section → Wrapper → Contract → Gateway Port → Backend Task Matrix

This matrix establishes the unbroken traceability chain from user-facing screens to backend services and verification tests.

```text
Section (Route)
  └── UI Feature Wrappers
        └── Shared Contract (packages/contracts/src/ui)
              └── Gateway API Port (Unified Gateway)
                    └── Owning Backend Task
                          └── Automated Tests & Evidence
```

| Section & Route | Feature Wrappers | Shared Contract Interfaces | Gateway HTTP/SSE Port | Owning Backend Task | Automated Verification Tests | Verified Evidence |
|---|---|---|---|---|---|---|
| **Chat**<br>`/chat`<br>`/chat/:conversationId` | `ChatPage`<br>`ConversationRail`<br>`ConversationPanel`<br>`MessageRenderer`<br>`Composer`<br>`ClarificationCard`<br>`ApprovalCard`<br>`TaskProgressCard`<br>`ToolActivityCard`<br>`ArtifactCard`<br>`GoalCard`<br>`VerificationCard` | `packages/contracts/src/ui/conversation.ts`<br>`packages/contracts/src/ui/events.ts`<br>`packages/contracts/src/ui/interactions.ts`<br>`packages/contracts/src/ui/commands.ts` | `POST /api/ui/v1/conversations`<br>`GET /api/ui/v1/conversations`<br>`GET /api/ui/v1/conversations/:id/events` (SSE)<br>`POST /api/ui/v1/conversations/:id/messages`<br>`POST /api/ui/v1/conversations/:id/clarifications/:cid/answer`<br>`POST /api/ui/v1/conversations/:id/approvals/:aid/decision`<br>`POST /api/ui/v1/runs/:id/cancel` | Task 04 (Gateway Ingress/Stream)<br>Task 16 (In-chat Approvals)<br>Task U19 (Live Protected Flow) | `tests/ui/chat/*.test.tsx`<br>`tests/ui/approval/*.test.tsx`<br>`tests/ui/clarification/*.test.tsx`<br>`tests/ui/e2e/protected-flow.spec.ts`<br>`tests/ui/e2e/protected-flow.live.spec.ts`<br>`tests/ui/e2e/conversation-cards.spec.ts` | SSE streaming with typed envelopes; interactive clarification questions; inline approvals; double-click coalescing; live signed execution receipts; safe markdown rendering with zero HTML/script injection. |
| **Models & Providers**<br>`/models` | `ModelsPage`<br>`ModelCatalog`<br>`ProviderList`<br>`ConnectionForm` | `packages/contracts/src/ui/catalogs.ts`<br>(`ModelView`, `ProviderView`, `ProviderConnectionInput`) | `GET /api/ui/v1/models`<br>`GET /api/ui/v1/providers`<br>`POST /api/ui/v1/providers` | Task 05 (Model Router)<br>Task 11 (Provider Integrations) | `tests/ui/catalogs/models.test.tsx`<br>`tests/ui/contracts/catalog-ports.test.ts`<br>`tests/ui/security/provider-key.test.tsx` | Model discovery with locality tags (local vs cloud); default/preference controls; write-only API key submission; credentials cleared on failure and never exposed in DOM, URL, or browser storage. |
| **Skills**<br>`/skills` | `SkillsPage`<br>`SkillCatalog`<br>`SkillDetails` | `packages/contracts/src/ui/catalogs.ts`<br>(`SkillView`, `SkillToggleInput`) | `GET /api/ui/v1/skills`<br>`POST /api/ui/v1/skills/:id/toggle` | Task 18 (Skill Registry & Manifest) | `tests/ui/catalogs/skills.test.tsx`<br>`tests/ui/contracts/catalog-ports.test.ts` | Displays installed skill versions, required permission manifests, trust levels, and availability statuses. Enable/disable toggle commands dispatched through versioned Gateway API. |
| **Tools & Connections**<br>`/connections` | `ConnectionsPage`<br>`ConnectionCatalog`<br>`ConnectionForm` | `packages/contracts/src/ui/catalogs.ts`<br>(`ConnectionView`, `ToolCatalogView`) | `GET /api/ui/v1/connections`<br>`POST /api/ui/v1/connections`<br>`POST /api/ui/v1/connections/:id/test` | Task 08 (Tool Registry & Protocol Adapters) | `tests/ui/catalogs/connections.test.tsx`<br>`tests/ui/contracts/catalog-ports.test.ts` | MCP and A2A external connection management; health status probing; tool catalog inspection. Gated mutations require in-chat approval. |
| **Memory**<br>`/memory` | `MemoryPage`<br>`MemoryPanel`<br>`MemoryDetail`<br>`MemoryCorrectionForm` | `packages/contracts/src/ui/catalogs.ts`<br>(`MemoryView`, `MemorySearchInput`, `MemoryCorrectionInput`) | `GET /api/ui/v1/memory`<br>`POST /api/ui/v1/memory/search`<br>`POST /api/ui/v1/memory/:id/correct` | Task 09 (Scoped Memory & Revisions) | `tests/ui/catalogs/memory.test.tsx`<br>`tests/ui/contracts/catalog-ports.test.ts`<br>`tests/ui/security/exposure.test.tsx` | Scoped memory search (Global, Tenant, Role, Private); revision history; authorized correction requests; private memories rendered as inert text with zero client persistence. |
| **Activity & Tasks**<br>`/activity` | `ActivityPage`<br>`ActivityTasks`<br>`ActivityUsage` | `packages/contracts/src/ui/catalogs.ts`<br>(`TaskView`, `ActivityQuery`, `UsageSummary`) | `GET /api/ui/v1/activity`<br>`GET /api/ui/v1/activity/usage` | Task 15 (Activity Projections & Budgets) | `tests/ui/catalogs/activity.test.tsx`<br>`tests/ui/contracts/catalog-ports.test.ts` | Cross-conversation task and run monitoring; token spend and budget tracking; execution receipt references; "Open conversation" deep-linking to owning chat interaction. |
| **Settings**<br>`/settings` | `SettingsPage`<br>`SettingsPanel` | `packages/contracts/src/ui/catalogs.ts`<br>(`SettingsView`, `SettingsPatch`) | `GET /api/ui/v1/settings`<br>`PATCH /api/ui/v1/settings` | Task 03 (Workspace Settings & Identity) | `tests/ui/catalogs/settings.test.tsx`<br>`tests/ui/contracts/catalog-ports.test.ts` | Appearance controls (system/light/dark) applied immediately before hydration; reduced-motion preferences; server-side privacy and budget threshold updates submitted with current revision tokens. |

---

## 3. Real Enabled vs. Demo Features and Accepted Scope

### A. Real Enabled Capabilities
1. **Unified Shell and Navigation (F01):** Exactly seven ordered primary navigation routes (`/chat`, `/models`, `/skills`, `/connections`, `/memory`, `/activity`, `/settings`). Forbidden routes (`/approvals`, `/questions`, `/agents`, `/dashboard`) are rejected.
2. **Real-time SSE Event Streaming (F02):** Robust event processing via `packages/contracts/src/ui/events.ts`. Single `ChatStore` owner; handles disconnects, backoff reconnection, and replay without message loss.
3. **In-Chat Inline Decisions (F04):** Clarification questions and approval proposals render directly within the conversation stream. Approval decisions use canonical `GatewayClient.decideApproval` exclusively; clarification responses cannot execute approvals.
4. **Write-Only Credential Safety (F03, F10):** Provider API keys and secret values are write-only. They are never mirrored into local/session storage, never stored in the DOM, never sent in URL parameters, and purged from form state immediately on rejection.
5. **Security & Race Protection (F18):** Double-click approval actions are coalesced into a single command; expired proposals are locked read-only; stale-epoch deltas are discarded.

### B. Demo / Fixture Mode Capabilities
- **Simulated Gateway (`apps/gateway-fixture`):** Supplies predictable, repeatable fixture scenarios for isolated UI development and CI runs without requiring a live database or external API keys:
  - `standard-conversation`: Message deltas and completion.
  - `code-and-table`: Complex markdown rendering with syntax highlighting and formatted tables.
  - `clarification-and-approval`: Step-by-step interactive decision cards.
  - `failure-notice`: Error banner and non-blocking degradation.
  - `rate-limited`: Backoff and retry indication.

### C. Accepted Limited Scope (Recorded from Task U19)
- **Status:** Complete under recorded human decision.
- **Deliverable:** Live Gateway protected flow (`tests/ui/e2e/protected-flow.live.spec.ts`) verified end-to-end against real `apps/gateway/src/ui-server.ts`. Real policy-kernel authorization evaluates input and issues HMAC-signed execution receipts.
- **Explicitly Retained Limitations:**
  - The executed effect in the live test is an authorized in-process governed read with an in-process HMAC receipt.
  - Full microVM sandbox isolation (Tasks 12/27), asynchronous audit ledger integration (`@asi/audit`), budget state settlement (`@asi/budgets`), PostgreSQL durable outbox, external privacy router daemon, and Mastra orchestrator distributed execution remain explicitly unqualified at this frontend release milestone.
  - Upstream backend tasks 12, 13, and 19 remain recorded as `blocked` in `docs/v2-task-ledger.json`.

---

## 4. Component Source Inventory and License Compliance

In conformance with `docs/ui-component-inventory.json` and requirements F11/F15:
- **Primary Presentation:** [AI Elements](https://elements.ai-sdk.dev/) (`conversation.tsx`, `message.tsx`) adapted under the Apache-2.0 license with cryptographic source hashes recorded and verified in `tests/ui/security/conformance.test.ts`.
- **Vendor Wrappers:** Feature components in `apps/web/src/features/` import exclusively through project adapters in `packages/ui/` or `apps/web/src/features/chat/cards/`. Direct imports of vendor libraries from application routes are prohibited.
- **Zero Direct Provider SDKs:** Frontend code contains zero imports from `openai`, `@anthropic-ai/sdk`, or other provider SDKs. All AI generation requests traverse the Gateway via `apps/web/src/lib/gateway/http-client.ts`.
- **Wire Contract Integrity:** The wire protocol envelope is anchored to `schemaVersion: 1` in `packages/contracts/src/ui/index.ts`. Source digest `91eff1737cf0ae6b4b541cb2cc175d387a9b31e88cbdae911fa0556426ebb02e` matches `docs/release-evidence/ui-wire-compatibility.json`.

---

## 5. Operator Runbook and Operating Instructions

### A. Local Demo Environment (Simulated Mode)
To run the frontend workspace with the deterministic Gateway fixture:
```powershell
# 1. Install dependencies (frozen)
pnpm install --frozen-lockfile

# 2. Build contracts and packages
pnpm ui:build

# 3. Start the demo server on port 3000
pnpm ui:dev
```
Open `http://localhost:3000/chat` in an evergreen browser. The demo workspace automatically loads the fixture scenarios with mock conversations, interactive questions, and sample approvals.

### B. Live Gateway Connection Mode
To connect the frontend to the live ASI Unified Gateway:
```powershell
# 1. Build the Gateway UI server
pnpm --filter @asi/gateway build

# 2. Start the Gateway UI server on port 4400
$env:ASI_UI_GATEWAY_PORT = "4400"
$env:ASI_UI_ALLOWED_ORIGINS = "http://127.0.0.1:3100"
node apps/gateway/dist/ui-server.js

# 3. In a separate terminal, launch the web application pointing to the live Gateway
$env:ASI_UI_GATEWAY_ORIGIN = "http://127.0.0.1:4400"
$env:NEXT_PUBLIC_ASI_UI_MODE = ""
pnpm --filter @asi/web exec next dev --hostname 127.0.0.1 --port 3100
```

### C. Authentication & Session Management
- Sessions are scoped by workspace principal and tenant ID (`WorkspaceSession`).
- Switching workspace identity triggers `ChatStore.reset()`, clearing all conversation drafts, cached memory, and transient interaction states from client memory.
- Browser storage (`localStorage` / `sessionStorage`) contains zero access tokens or credentials. Authentication is verified via HTTP headers/cookies on `/api/ui/v1/me`.

### D. Interrupted Stream Recovery
- When an SSE connection drops:
  1. The client automatically enters a reconnecting state without clearing rendered messages.
  2. Reconnection requests append `?after=<lastSequenceNumber>` to resume streaming without duplicate deltas.
  3. If the server indicates the stream replay buffer has expired, the client requests a clean `getSnapshot(conversationId)` and reconciles canonical message state.

### E. Pending Decisions Handling
- **Clarifications:** Presented via `ClarificationCard`. Resolving the card invokes `answerClarification`.
- **Approvals:** Presented via `ApprovalCard` with risk assessment, parameters, and expiry countdown.
- **Double-click Prevention:** Submit buttons are immediately disabled upon dispatch. A second click while a command is inflight is coalesced into the original promise.
- **Expired Proposals:** When an approval proposal's timestamp expires, the card transitions to a read-only state, disabling all decision buttons.

### F. Failure and Unknown Outcomes
- Network or policy failures render a localized `error` notice card in the conversation stream.
- If a tool execution produces an indeterminate outcome, the UI displays an `unknown_outcome` badge and prevents optimistic resolution.
- Errors do not block other conversation actions or corrupt the global store.

### G. Release Rollback
If a defect is identified post-release:
```powershell
# 1. Revert to the prior verified release commit
git checkout <previous-release-tag>

# 2. Clean build caches
Remove-Item -Recurse -Force apps/web/.next, apps/web/.next-live

# 3. Reinstall and re-verify
pnpm install --frozen-lockfile
pnpm ui:verify
```

---

## 6. Architecture Baseline Preservation

As verified by `scripts/verify-architecture.mjs`, all 12 canonical system components defined in `docs/architecture-baseline.json` remain preserved:
1. `channels` (Web frontend Client Surface)
2. `gateway` (Unified Gateway)
3. `orchestrator` (Deterministic orchestrator shell)
4. `policy` (Policy kernel)
5. `privacy` (Privacy router)
6. `memory` (Scoped memory owner)
7. `episodic` (Episodic SQLite owner)
8. `models` (Model router)
9. `tools` (Tool engine)
10. `sandbox` (Execution sandbox)
11. `specialists` (Specialist workers)
12. `telemetry` (OpenTelemetry/audit)

No component has been bypassed, deleted, or conflated. The web frontend interfaces strictly with the Gateway via `/api/ui/v1`.


## 7. Local/GitHub integration verification — 2026-10-17

Integrated local parent `3d8bc76` and GitHub parent `11622fc` in the existing Windows checkout. Preserved the local redesign, local U21/U22 evidence, backend owners and all pending-task statuses. Restored the exact dependency lock, strict engine policy and complete recursive workspace build; retained GitHub import aliases, metadata and foundation entry link.

The synthetic demo launcher builds contracts/UI/fixture without relinking node_modules, waits for both listeners, rejects occupied ports and terminates its own child process trees. The fixture stays on loopback. Hosted previews require exact HTTPS origins; cross-site cookies require explicit proxy/cookie configuration. Live mode cannot silently use this fixture. Message creation/send retries keep command identity, rejected drafts remain visible, newer edits reach the canonical ChatStore, and accepted-message navigation failures retry opening without another send.

Fresh integration evidence:

- Frozen offline installation with scripts disabled passed; full workspace TypeScript/build and lint passed.
- Pre-review full unit baseline: 57 files / 691 tests passed using a newly created disposable local PostgreSQL database with migrations 001 and 005, then removed. Final committed baseline passed `pnpm verify` using the same disposable setup: 57 files / 693 tests, 430 architecture source files, 33 dependency manifests, traceability and all 25 protected-file patterns. Temporary qualification database removed afterward.
- Final UI unit/component/security-conformance suite: 34 files / 230 tests passed after the newline regression and recovery fix.
- Startup lifecycle regressions: 7/7 passed, including occupied ports, startup failure, timeout and signal cleanup on Windows.
- Final browser matrix: 48/48 passed in one run (26 end-to-end, 16 accessibility, 6 visual cases). Initial cold development compilation exceeded four 5-second URL assertions; those passed warm, and the subsequent full run passed all 48. Visual snapshots were regenerated after waiting for authenticated demo readiness.
- Live Gateway browser suite: 9/9 passed. This is the bounded in-process protected UI flow, not qualification of the complete persistent backend or executable sandbox.
- Independent code review found one accepted-send recovery defect; its regression passed after repair and re-review found no remaining important issue.
- UI boundary/source checks and consolidated guide verification passed. Compatibility digests normalize CRLF to LF so Git/Windows newline conversion is not mistaken for a wire-schema change; a regression still rejects altered schema text. Preserved guide snapshots and their manifest use LF consistently.

Existing long-deadline UI fixtures emit Node TimeoutOverflowWarning. A UI conformance subprocess check also exceeded Vitest's default 5-second limit while browser/build work ran concurrently; the isolated eight conformance tests passed after that load ended. No assertions were removed or timeouts enlarged.

These results do not complete pending backend/V2 tasks, qualify the Windows executable sandbox, or replace task-specific database/security acceptance. Historical release receipts above remain historical; this section records the integrated revision's scope. Runtime used Node 24.19.0, pnpm 12.6.0, Next.js 16.3.8 and Playwright 1.63.0.
