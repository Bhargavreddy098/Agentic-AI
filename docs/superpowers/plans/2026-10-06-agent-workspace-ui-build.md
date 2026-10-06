# Agent Workspace Frontend — Step-by-Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution or superpowers:subagent-driven-development if the human authorizes task agents. Read both specs and the machine baselines before editing. Complete checkbox steps task-by-task; this file authorizes no implementation by itself.

**Goal:** Build all seven frontend sections with a usable streaming chat, inline questions/approvals, reviewed UI components, and integration with the existing protected Gateway architecture.

**Architecture:** The web app belongs to Client Surfaces and sends every command through the Gateway. One application-owned conversation reducer and one GatewayClient power the UI; backend identity, policy, privacy routing, memory and tool execution retain authority. Start with a simulated Gateway using the same wire contracts, then integrate real read APIs and the protected run flow.

**Tech Stack:** Proposed Next.js App Router, React 19, TypeScript 5.9.x strict, Tailwind CSS 4, shadcn/ui, AI Elements presentation, Zod 4.6.5 contracts, Vitest/Testing Library/Playwright. Exact compatible versions and component-source digests are frozen in U01. User-listed alternative libraries are reviewed through one component inventory.

**Spec:** `docs/superpowers/specs/2026-10-06-agent-workspace-ui-design.md`.
**System spec:** `docs/superpowers/specs/2026-10-06-asi-agent-design.md`.
**System plan:** `docs/superpowers/plans/2026-10-06-asi-agent-build.md` (existing tasks 01–30).
**UI tracking:** `docs/ui-baseline.json`, `docs/ui-task-ledger.json`.
**Status:** PROPOSED. Product code, UI libraries and application tests have not been installed or implemented in this planning request.

## Global constraints

- Exactly seven primary sections with labels/routes/order fixed in UI spec section 3.
- Clarifications, approvals and their canonical decision controls render inside Chat.
- A management-screen approval navigates to its backend-owned conversation; Activity links rather than duplicates decision controls.
- Clarification answers never grant effect permissions; question and approval contracts/actions remain separate.
- One conversation state owner, one GatewayClient, one selected primary chat presentation stack.
- All frontend operations traverse the Gateway; no provider/DB/tool/sandbox execution path in browser or Next inference route.
- Backend is authoritative for decisions, permission, effective model, trust, outcomes and usage.
- Mock/live modes are explicit and never automatically substitute for each other.
- Vendor components are qualified/pinned/wrapped; all source/license/dependency choices are recorded.
- Existing system R01–R24 and all 12 pictured component IDs remain preserved.

## Review focus

1. A reconnect/duplicate delta or late event from an old conversation must not duplicate text or overwrite another chat. Tests: U03/U05/U19/U21.
2. An approval click, expired proposal, double tab or stale version must not silently authorize or display completed execution. Tests: U09/U19/U21.
3. A yes/no question response must not dispatch an approval command. Tests: U08/U09/U21.
4. Provider keys, private memory, attachments and preview content must not leak through browser persistence/rendering or wrong workspace state. Tests: U06/U10/U11/U14/U17/U21.
5. Multiple component libraries/agents must not introduce duplicate navigation, global approval pages, competing stores, hidden provider routes or incompatible themes. Tests: U01/U04/U09/U20/U21.

## 1. The unambiguous build order

1. U01–U02: freeze stack and shared UI contracts. Reuse existing system workspace/contracts tasks 01–02; do not scaffold a second unrelated repository.
2. U03: implement a simulated Gateway with contract tests and reproducible scenarios. This is the minimal backend foundation needed to build the UI.
3. U04–U10: build shell and complete Chat interaction flow.
4. U11–U16: implement the other six sections and their links into Chat.
5. U20: validate responsive/accessibility behavior while the real backend is being prepared.
6. U17–U18: connect authenticated real Gateway and progressively available catalog/configuration APIs.
7. U19: connect real protected model/tool/question/approval flow only after existing system tasks 01–16 and recovery task 19 pass.
8. U21–U22: perform conformance/security/recovery tests and release/handoff.

You do not need to finish the full agent backend before starting U04. A demo frontend is complete at the demo gate after U16/U20; real-system completion requires U17–U19/U21/U22. These are separate completion claims.

The UI tasks do not replace existing system tasks. Web integration adds browser-safe Gateway projections and another Client Surface. CLI/Slack remain optional delivery adapters for later milestones; policy/privacy/isolation gates are unchanged.

## 2. Fixed navigation and component placement

| Order | Label | Route | Canonical components owned here |
|---|---|---|---|
| 1 | Chat | `/chat`, `/chat/:conversationId` | ConversationRail, Composer, messages, ClarificationCard, ApprovalCard, TaskProgressCard, ToolActivityCard, ArtifactCard |
| 2 | Models & Providers | `/models` | ProviderList, ProviderConnectionForm, ModelCatalog, default/preference controls |
| 3 | Skills | `/skills` | SkillLibrary, SkillDetails, trust/availability/permission display |
| 4 | Tools & Connections | `/connections` | ToolCatalog, MCP/A2A/messaging connection lists and forms |
| 5 | Memory | `/memory` | Authorized memory search, detail, sources/revisions, correction/deletion request |
| 6 | Activity & Tasks | `/activity` | Cross-chat run/task summary, usage, safe error/evidence and “Open conversation” |
| 7 | Settings | `/settings` | Profile, appearance, privacy, budgets, schedules, retention settings |

`/approvals`, `/questions`, `/agents` and `/dashboard` are not primary routes in this plan. Decision badges/links navigate to `/chat/:conversationId?interaction=:interactionId`. A tab/drawer inside a section is not a new primary navigation entry. All pages reuse the same AppShell and common state/contracts.

## 3. File map and one-owner boundaries

```text
apps/web/
  package.json, next.config.ts, tsconfig.json, components.json
  src/app/layout.tsx, globals.css
  src/app/(workspace)/layout.tsx
  src/app/(workspace)/chat/page.tsx
  src/app/(workspace)/chat/[conversationId]/page.tsx
  src/app/(workspace)/models/page.tsx
  src/app/(workspace)/skills/page.tsx
  src/app/(workspace)/connections/page.tsx
  src/app/(workspace)/memory/page.tsx
  src/app/(workspace)/activity/page.tsx
  src/app/(workspace)/settings/page.tsx
  src/features/shell/{AppShell,AppSidebar,ConversationRail}.tsx
  src/features/chat/{ChatPage,ConversationPanel,MessageRenderer,Composer}.tsx
  src/features/chat/cards/{ClarificationCard,ApprovalCard,TaskProgressCard,
                          ToolActivityCard,ArtifactCard}.tsx
  src/features/{models,skills,connections,memory,activity,settings}/
  src/lib/gateway/{client,http-client,sse,errors}.ts
  src/lib/chat/{store,reducer,selectors,intents}.ts
  src/lib/auth/{session,csrf}.ts
  src/lib/content/{markdown,artifact-policy}.ts
  src/lib/navigation.ts
  src/test/{fixtures,harness}/
packages/ui/src/{tokens.css,vendor/,adapters/,components/}
packages/contracts/src/ui/{conversation,events,interactions,commands,catalogs,index}.ts
apps/gateway-fixture/src/{main,scenarios,fixtures}.ts
apps/gateway/src/ui/{routes,auth,stream,projections,commands,uploads}.ts
tests/ui/{contracts,navigation,chat,clarification,approval,catalogs,state}/
tests/ui/{e2e,security,accessibility,visual}/
scripts/{verify-ui-boundaries,verify-ui-sources}.mjs
docs/ui-component-inventory.json
docs/ui-baseline.json
docs/ui-task-ledger.json
docs/release-evidence/frontend.md
```

No new `apps/web` provider-generation route is added. Next rewrites/ingress proxy only forward `/api/ui/v1` to the Gateway. API DTOs are authored in shared contracts, not separately invented in pages. Page owners cannot edit navigation labels, approval authority, event schema/store, vendor imports or system protected files without the shared-contract owner and reviewed change.

## 4. Public interfaces executors must use

Wire schemas/fields are specified in UI spec sections 5–7. U02 exports the following types. All mutation results are UiCommandResult; expectedVersion/expectedRevision are server revisions, not arbitrary client timestamps.

```ts
interface GatewayClient {
  getMe(): Promise<WorkspaceSession>;
  listConversations(cursor?: string): Promise<Page<ConversationSummary>>;
  createConversation(commandId: string): Promise<ConversationSummary>;
  updateConversation(id: string, input: ConversationPatch): Promise<UiCommandResult>;
  getSnapshot(id: string): Promise<ConversationSnapshot>;
  sendMessage(id: string, input: SendMessageInput): Promise<UiCommandResult>;
  subscribe(id: string, after: number, signal: AbortSignal): AsyncIterable<UiEvent>;
  cancelRun(runId: string, commandId: string): Promise<UiCommandResult>;
  answerClarification(id: string, input: ClarificationAnswer): Promise<UiCommandResult>;
  decideApproval(id: string, input: ApprovalDecisionInput): Promise<UiCommandResult>;
  beginUpload(input: UploadIntent): Promise<UploadView>;
  uploadContent(id: string, file: File, signal: AbortSignal): Promise<void>;
  completeUpload(id: string, commandId: string): Promise<UploadView>;
  getModels(): Promise<Catalog<ModelView>>;
  getProviders(): Promise<Catalog<ProviderView>>;
  getSkills(): Promise<Catalog<SkillView>>;
  getConnections(): Promise<Catalog<ConnectionView>>;
  queryMemory(input: MemorySearchInput): Promise<Page<MemoryView>>;
  getActivity(input: ActivityQuery): Promise<Page<TaskView>>;
  getSettings(): Promise<SettingsView>;
  submitCommand(command: UiMutationCommand): Promise<UiCommandResult>;
}

function reduceConversation(state: ConversationState, event: UiEvent): ConversationState;
function hydrateConversation(snapshot: ConversationSnapshot): ConversationState;
function navigateToInteraction(conversationId: string, interactionId: string): string;
```

Supporting exact shapes to define in U02:

- `Page<T>`: items, nextCursor (string|null). `Catalog<T>`: items, revision, availability (ready/unavailable/permission_denied), safe reason when unavailable.
- `WorkspaceSession`: workspaceId, displayName, subjectId, allowedActions, demoMode, csrfToken, limits (maxMessageBytes/maxAttachmentBytes/maxAttachmentCount); no provider secrets. Client does not set authoritative tenant/role.
- `SendMessageInput`: clientMessageId, commandId, text, attachmentIds, requestedModelId?, requestedSkillIds, expectedConversationRevision.
- `ConversationPatch`: commandId, expectedRevision, title? or archived?; a strict union ensures the intended change is explicit.
- `ClarificationAnswer`: commandId, expectedVersion, optionIds, text?; backend validates per-question cardinality/free-text rule.
- `ApprovalDecisionInput`: commandId, expectedVersion, decision (approve/reject); effect/input binding comes from server-owned proposal. A client cannot submit replacement action arguments.
- `UploadIntent`: commandId, fileName, mimeType, byteSize; `UploadView`: uploadId, attachmentId?, status (pending/uploading/scanning/ready/rejected), safe reason. Actual digest/status checked by backend.
- `MemorySearchInput`: query, authorized requested scope?, cursor?, limit (1–100). `ActivityQuery`: status?, conversationId?, cursor?, limit (1–100).
- `UiMutationCommand`: discriminated union of provider.connect/disconnect, model.preference.set, skill.install/enable/disable/revoke, connection.connect/disconnect, memory.correct/delete, settings.update; each includes commandId, expectedRevision, target IDs and its schema-validated payload. Permission-sensitive settings are server commands; local theme is separate.
- Provider credential submission is a write-only field restricted to provider.connect. Schema redaction excludes it from UiCommandResult/events/transcripts/snapshots. After submission the UI clears the field even if a resulting approval remains pending. Gateway stages credentials in the approved backend credential vault/privacy service and places only an opaque credential reference in ordinary command records/outboxes; rejected/expired requests clean up staged credentials. No plaintext key is persisted in an audit/episode/task payload.
- `ConversationState`: conversationId, workspaceId, revision, lastEventSequence, messages, interactions, tasks, tools, artifacts, runStatus, effectiveModel, usage. Local draft/scroll/submitting maps are separate and never serialized as server truth.

Event sequence and revisions are nonnegative safe integers. Payload type names and variants must match the UI spec. Core backend `suspended` + `suspendReason: user_input` maps to UI “Waiting for your answer”; no new core run state is invented by a component.

## 5. Commands and per-task completion cycle

U01 adds `pnpm ui:typecheck`, `pnpm ui:build`, `pnpm ui:test`, `pnpm ui:test:e2e`, `pnpm ui:test:security`, `pnpm ui:test:a11y`, `pnpm ui:verify:boundaries`, `pnpm ui:verify:sources`, `pnpm ui:verify`.

Named test command: `pnpm exec vitest run tests/ui/<file>.test.ts` (use .tsx for rendered component tests). Browser checks use `pnpm exec playwright test tests/ui/e2e/<file>.spec.ts`. ui:verify combines typecheck/build/unit/boundary/source checks; release adds e2e/security/a11y/visual checks. Missing live backend is a failed live gate, never a silent mock pass.

For each task: read deps/spec → add the named behavior tests → run and observe meaningful RED → implement only owned files/interfaces → run GREEN plus affected checks → review → update UI ledger evidence → commit after Git setup. Exact assertions below become executable tests with fixtures authored in that task; fixture values are not new public APIs.

## 6. Foundation and simulated Gateway

### U01: Freeze frontend stack, component sources and workspace scripts

Depends on: review of this proposed design/plan and primary-library choice; reuse system task 01 workspace qualification. Owns packages/ui setup, apps/web manifests, source inventory, verification scripts. Requirements: F05/F11/F15/F16/F17.

- [ ] Record the selected primary chat layer. Default proposal: AI Elements. If assistant-ui is chosen, update only the presentation adapter/inventory through a reviewed decision; preserve store/wire/card semantics.
- [ ] Create `docs/ui-component-inventory.json` entries for all eleven user sources: selected/reference/pending/alternative, actual source/license/digest, supported peers, assigned wrapper slot. AI Elements owns conversation/message/composer; shadcn owns shell/primitives; candidate cards require explicit source choice.
- [ ] Add `tests/ui/source-boundaries.test.ts`: assert direct vendor import from a feature page yields VENDOR_IMPORT_BYPASS; two chat owners yield MULTIPLE_CHAT_OWNERS; registry item without license/hash yields UNQUALIFIED_SOURCE.
- [ ] Run for RED, implement Next/React/Tailwind/shadcn setup and exact compatible pins, vendor wrappers and scripts; qualify the chosen primitive variant and CSS layer order in a smoke page.
- [ ] Run test and ui:typecheck/ui:build for GREEN; freeze source registry copies rather than relying on moving latest URLs. Never install a whole registry or execute a remote installer without inspecting its files/dependencies.
- [ ] Commit the reproducible UI foundation. No provider API route/key is created.

### U02: Define UI DTOs, commands, events and mock/live contract suite

Depends on U01 + existing system task 02. Owns `packages/contracts/src/ui/*`, GatewayClient interface, tests/ui/contracts. Requirements: F04/F06/F07/F08/F09/F10/F16.

- [ ] Add schemas for every type in section 4 and UI spec sections 5–7. Questions and approvals use distinct discriminants, IDs/statuses and commands. Catalog projections expose allowedActions/status rather than raw service/database objects.
- [ ] Add `tests/ui/contracts/schemas.test.ts`: required IDs/versions missing reject; approval payload with replacement effect args rejects; question answer cannot parse as approval; ProviderView with apiKey rejects; unknown event type/invalid sequence rejects.
- [ ] Run for RED; implement Zod schemas and inferred types, safe errors/statuses, endpoint method mapping and serialized fixtures. Core schemas remain compatible; review actual additive changes.
- [ ] Run for GREEN + ui:typecheck. Publish contract fixtures and a test harness `runGatewayContractTests(createClient)` reused unchanged for mock and real clients.
- [ ] Commit contracts before any page agent starts. Contract changes after this step require the named owner/review.

### U03: Simulated HTTP/SSE Gateway and deterministic scenarios

Depends on U02. Owns `apps/gateway-fixture/src/*`, HTTP test harness. Requirements: F07/F08/F09/F12/F13.

- [ ] Add fixtures: ordinary stream; clarification; approval→approved→running→completed; rejection; expired approval; tool error; unknown outcome; disconnected stream; replay duplicate/gap; other-chat late event; budget exhausted; unavailable catalog; management command approval.
- [ ] Add `tests/ui/contracts/mock-gateway.test.ts`: duplicate client command produces one logical message/decision; a question answer records zero approval commands; replay gives ordered deduplicable event IDs; wrong conversation/version receives safe conflict/denial.
- [ ] Run for RED; implement loopback-only mock Gateway on port 4300 with same proposed UI API, deterministic clocks/seeded IDs, authenticated-demo identities and in-memory fixture data. Demo uploads scan simulated status, never call external services.
- [ ] Run for GREEN using HTTP/SSE rather than only in-process mocks. Every fixture identifies its synthetic nature. Production credentials/real tool execution are unsupported.
- [ ] Record scenarios and invocation. Live client never auto-connects to this fixture on failure; commit.

## 7. Shared shell and complete Chat interface

### U04: Seven-section shell and secondary conversation rail

Depends on U03. Owns AppShell/AppSidebar/navigation and route composition. Requirements: F01/F02/F03/F13/F15.

- [ ] Add `tests/ui/navigation.test.tsx` assertions: labels equal the exact ordered seven-label array; there is no primary Approvals/Questions/Agents/Dashboard link; recent chat items are under a secondary Chat rail; deep-linked interaction opens its owning Chat.
- [ ] Run for RED; implement shared layout and all seven route entries, accessible sidebar collapse/drawers, workspace/header demo/connection status, permission-aware states, active route and Chat pending-decision badge.
- [ ] `navigateToInteraction('c1','i1')` must equal `/chat/c1?interaction=i1`; encode opaque route IDs safely. Badge clicks use authorized summaries, not all tenants' decisions.
- [ ] Run for GREEN; clicking sections keeps shared shell/draft ownership intact. Commit. Remaining pages show labeled unavailable/empty scaffolds until their tasks implement them.

### U05: One chat store, event reducer, snapshots and reconnection

Depends on U04. Owns src/lib/chat and src/lib/gateway SSE transport. Requirements: F05/F07/F08/F10/F12.

- [ ] Add `tests/ui/state/reducer.test.ts`: sequence 10 delta applied twice appends text once; stale resolved approval never returns to pending; a gap 10→12 requests resync; late c1 event cannot modify c2; workspace/logout change clears sensitive state.
- [ ] Run for RED; implement hydrateConversation/reduceConversation, validated stream parser, snapshot + cursor subscription, event-ID/sequence dedup, bounded replay handling, AbortSignal subscription cleanup and explicit connection/error state.
- [ ] Add `tests/ui/state/reconnect.test.ts`: reload/snapshot plus replay reconstructs exactly the same messages/cards; replay-window expiry fetches new consistent snapshot; expired auth stops connection and does not retry indefinitely.
- [ ] Run for GREEN; no competing library runtime/store exists. Local drafts and submit flags remain separate from server canonical state; commit.

### U06: Composer, message submission, attachments and cancellation

Depends on U05. Owns Composer and upload UI. Requirements: F06/F07/F08/F10/F13/F14.

- [ ] Add `tests/ui/chat/composer.test.tsx`: Enter sends once, Shift+Enter/IME composition does not send, whitespace is disabled, double-submit reuses command ID, requested model/skill IDs are preferences only. Draft editing stays available during a run; new Send is disabled until the current run finishes/suspends according to backend capabilities.
- [ ] Add attachments fixtures for uploading/scanning/ready/rejected, MIME/size/count limits returned by getMe, cancellation, and failed digest/ownership. Only ready authorized attachmentIds go into SendMessageInput.
- [ ] Run for RED; implement composer using wrapped presentation component, HTTP client, typed upload lifecycle, attachment previews, bounded validation, durable accepted state and Stop button through cancelRun.
- [ ] Run for GREEN: UI click shows cancellation requested; only server event shows cancelled. Network retry cannot create a duplicate message. Upload bytes/keys are not stored in localStorage; commit.

### U07: Conversation viewport, messages and safe streaming presentation

Depends on U06. Owns MessageRenderer/ConversationPanel/markdown/status-summary. Requirements: F02/F05/F07/F13/F14/F17.

- [ ] Add `tests/ui/chat/messages.test.tsx`: text streams without duplicate final message; source citation points to correct evidence; scroll-up remains stable during deltas; new-message control restores follow; blocked raw HTML/script cannot execute.
- [ ] Run for RED; compose AI Elements/project wrappers for Conversation/Message, safe Markdown/code, timestamps, copy controls, accessible connection/error notices and coalesced status updates.
- [ ] Implement typed part dispatch with safe unknown-content notice; raw provider payload and private chain-of-thought are never rendered. Status summaries are explicitly backend-supplied safe text.
- [ ] Run for GREEN at desktop/mobile lengths and large code block wrapping; commit. Editing/regeneration/branching controls stay unavailable unless their backend contract is separately enabled.

### U08: Inline clarification questions and answer submission

Depends on U07. Owns ClarificationCard only. Requirements: F02/F03/F04/F07/F09/F13/F14.

- [ ] Add `tests/ui/clarification/card.test.tsx`: single/multiple choices and free text obey request schema; required empty answer cannot submit; a yes answer calls answerClarification exactly once and decideApproval zero times.
- [ ] Run for RED; implement pending/submitting/answered/expired/cancelled card, stable option IDs, accessible labels, bounded free text and backend acknowledgement handling. No submitted/preselected consent is invented.
- [ ] Test deadline/version conflict and reconnect while waiting: refresh canonical question and retain valid draft choices; already answered card is read-only.
- [ ] Run for GREEN; ordinary Send is not reused as an implicit approval endpoint. Commit independently from approval logic.

### U09: Canonical inline action approvals and management-to-chat flow

Depends on U08. Owns ApprovalCard, interaction navigation helper and management result handler. Requirements: F02/F03/F04/F07/F09/F10/F15.

- [ ] Add `tests/ui/approval/card.test.tsx`: clicking Approve sends only approvalId/decision/expectedVersion/commandId; controls disable while submitting; click does not show action completed; expired/changed action cannot be approved using stale props.
- [ ] Add `tests/ui/approval/routing.test.tsx`: a Skills/Models/Memory command returning approval_required navigates to exact owning Chat; Activity opens the same card; no second approval modal/page/control is created.
- [ ] Run for RED; implement redacted action/target/change preview, Approve once/Reject, explicit expiry/denial/revocation states and authoritative acknowledgement. Proposal changes create a new version/request, not a UI-edited authorized action.
- [ ] Test double click/two tabs/replayed event/403/409/expired server clock; a failed transport fetches status before retrying the same command. Approved/rejected status persists through reload.
- [ ] Run for GREEN; decisions remain historical and execution follows with separate task/tool events. Commit after a reviewer checks that the browser has no authority bypass.

### U10: Task/tool progress, safe artifacts and conversation results

Depends on U09. Owns task/tool/artifact cards and preview policies. Requirements: F02/F07/F08/F13/F14/F17.

- [ ] Add `tests/ui/chat/results.test.tsx`: queued/running/succeeded/failed/cancelled/unknown render distinct states; approval acceptance does not become tool success; excessive output becomes an artifact link; supported task/tool IDs point to correct run.
- [ ] Add malicious Markdown/URL/HTML/artifact fixtures: raw script cannot run in app context, preview gets no app credentials, unauthorized artifact refuses download, unknown generative component is not evaluated as JSX/code.
- [ ] Run for RED; implement controlled cards, bounded expanders, evidence/citations, safe download route and isolated preview for explicitly supported types. No allow-same-origin executable preview with app cookies.
- [ ] Run for GREEN with tool error, cancellation and unknown external outcome; include keyboard/focus and long output checks. Commit the complete mock Chat flow.

## 8. Remaining six sections

### U11: Models & Providers page and chat model preference

Depends on U10. Owns src/features/models; uses shared approval navigation. Requirements: F03/F06/F07/F10/F13/F17.

- [ ] Add `tests/ui/catalogs/models.test.tsx`: backend-authorized models only; disconnected/unavailable/local/cloud displayed accurately; requested model differs visibly from backend effective model; unpermitted preference is disabled.
- [ ] Add `tests/ui/security/provider-key.test.ts`: key input is write-only/cleared, appears in no snapshot/event/URL/storage/log; mock/live credential submit is clearly separated.
- [ ] Run for RED; implement ProviderList, connection form, model catalog/search/default preferences and composer preference reuse. Prices/context limits/capabilities are shown only when supplied by backend, with unknown values labeled.
- [ ] submitCommand handles applied/rejected/conflict/approval_required; approval_required opens Chat. Selecting a cloud model cannot override local-only routing policy.
- [ ] Run for GREEN; page and composer read the same catalog/query result. Commit.

### U12: Skills management and composer skill selection

Depends on U11. Owns src/features/skills. Requirements: F03/F06/F07/F11/F13/F17.

- [ ] Add `tests/ui/catalogs/skills.test.tsx`: verified/available/revoked/disabled are distinct; unavailable/revoked skill cannot be selected; installation never executes scripts; permission expansion goes to Chat approval.
- [ ] Run for RED; implement list/search/detail/version/provenance/required-capability view and typed install/enable/disable/revoke commands.
- [ ] Composer uses authorized available skills from the same source; selection is a request for the next run and does not alter running task privileges. Revoke events update selection/read-only historic references safely.
- [ ] Run for GREEN across empty/denied/failed/conflict/install-pending cases. Commit.

### U13: Tools & Connections for MCP, A2A and messaging

Depends on U12. Owns src/features/connections. Requirements: F03/F06/F07/F13/F17.

- [ ] Add `tests/ui/catalogs/connections.test.tsx`: tool/MCP/remote A2A/messaging entries have distinct types/statuses; connect request uses GatewayClient, never browser fetch to entered server URL; pending grant opens Chat.
- [ ] Run for RED; implement tool permissions/capability view, connection forms, status/error/version/availability display and typed commands. A development UI source registry is not automatically a runtime MCP tool connection.
- [ ] Handle server-rejected URL/auth/permission checks with safe messages; never display returned connection secrets. Backend performs DNS/SSRF/egress authorization.
- [ ] Run for GREEN; no invented connected badge when component is not implemented. Commit.

### U14: Authorized Memory search, provenance and revision requests

Depends on U13. Owns src/features/memory. Requirements: F03/F06/F07/F10/F13.

- [ ] Add `tests/ui/catalogs/memory.test.tsx`: only returned authorized scopes/records render; a workspace switch clears previous results; correction uses expectedRevision; deletion approval opens Chat; source/hypothesis/contradiction labels remain visible.
- [ ] Run for RED; implement paginated search/detail/source/revision UI, safe content, correction/delete forms and typed commands. Frontend scope filters cannot expand backend authorization.
- [ ] Test conflict/revocation after opening detail: refresh/deny safely instead of optimistic unauthorized persistence. Private data never enters URL parameters or browser durable storage.
- [ ] Run for GREEN; commit. UI success demonstrates projection behavior, not PostgreSQL RLS correctness (existing system task 09 remains required).

### U15: Activity & Tasks projection and original-conversation links

Depends on U14. Owns src/features/activity. Requirements: F02/F03/F07/F08/F13.

- [ ] Add `tests/ui/catalogs/activity.test.tsx`: tasks filter/page/status correctly; usage unknown is not displayed as zero; one interaction has one canonical Chat decision; clicking pending decision opens exact original card.
- [ ] Run for RED; implement run/task/specialist list, safe tool/error summaries, provided token/cost/latency metrics, receipt references and allowed cancellation commands.
- [ ] No Approve/Reject controls are rendered on this page. Shared store/projection updates prevent duplicate or regressed task state.
- [ ] Run for GREEN with cancellation/reconnect/denied metrics. Commit.

### U16: Settings and explicit local-versus-server preferences

Depends on U15. Owns src/features/settings. Requirements: F03/F06/F07/F10/F13/F14.

- [ ] Add `tests/ui/catalogs/settings.test.tsx`: appearance changes locally; privacy/budget/retention/schedule updates use versioned Gateway command; gated change opens Chat; mode preference does not assign a capability in client state.
- [ ] Run for RED; implement profile/workspace, theme/reduced motion, notification preferences, quota/privacy/retention/schedule forms with server-provided constraints/timezone.
- [ ] Validate integer monetary units/deadlines; preserve original values on rejected/conflicting changes; show unsaved state explicitly. Unsupported administration settings remain unavailable rather than fake controls.
- [ ] Run for GREEN. **Demo gate:** all seven sections and mock Chat question/approval/task/result flows work, with persistent Demo label and no real operations. Commit/evidence.

## 9. Real Gateway and protected backend integration

### U17: Authenticated UI Gateway adapter and real transcript stream

Depends on U16; existing system 01–04 (workspace/contracts/identity/durable control), 07 (policy) and 08 (episodes). Implements the browser-facing Gateway module associated with system task 16; the full system task 16 remains pending until orchestrator task 15 and its protected slice pass. Owns apps/gateway/src/ui routes/auth/stream/uploads.
Requirements: F06/F07/F08/F10/F12/F16.

- [ ] Add `tests/ui/contracts/real-gateway.test.ts` using the unchanged U02 client suite: authentication/CSRF/Origin, authorized conversation ownership, durable message acceptance, expected revisions, SSE cursor/replay, upload ownership/limits.
- [ ] Run for RED; implement Gateway safe projections and browser-session mapping over existing control/episode APIs. No new agent loop, SQL credential in UI, or provider endpoint. Next/ingress proxy retains authenticated same-origin flow.
- [ ] Quarantine upload bytes/status/digest before ready; only backend-approved files enter run input. Production must fail closed when required scan/authorization is unavailable.
- [ ] Run for GREEN with two principals/workspaces and browser refresh/logout/cookie expiry. Live error stays live error; mock data never replaces it. Commit.

### U18: Real catalog/configuration ports and management approval integration

Depends on U17. Backend prerequisites by screen: Models system 06/07/11; Skills 07/13/18; Connections 07/13/20/22/23 as applicable; Memory 07/09; Activity 04/05/10; Settings 06/07/21/25 as applicable.
Owns apps/gateway/src/ui/projections/commands and integration adapters, not service implementation. Requirements: F03/F06/F07/F10/F12/F13/F16/F17.

- [ ] Add `tests/ui/contracts/catalog-ports.test.ts`: each implemented port returns authorized safe projection; unimplemented port returns unavailable; server command returns applied/rejected/conflict/approval_required with stable IDs; returned secret fields reject schema validation.
- [ ] Run for RED; adapt read/configuration commands to owning backend services. Provider credentials go only through approved server-side credential handling; approval previews retain redacted references. Record exact port-to-system-task availability matrix.
- [ ] Policy-gated management request creates/uses owning configuration conversation; Chat sees approval event with same effect/version. Browser approve cannot bypass current identity/policy/expiry checks.
- [ ] Run for GREEN per real port; unsupported MCP/A2A/channel/schedule features stay unavailable until their named backend tasks pass. A complete real seven-section release requires all advertised ports, not fake entries. Commit.

### U19: Real streaming run, clarification, approval, execution and recovery

Depends on U18; existing system protected slice 01–16 and recovery 19. Owns cross-system browser e2e harness plus narrow Gateway projection corrections. Requirements: F02/F04/F07/F08/F09/F12/F16/F18.

- [ ] Add `tests/ui/e2e/protected-flow.spec.ts`: submit → streamed safe response → question → answer → proposed tool action → approve → separately observed task execution → result/artifact/receipt.
- [ ] Add rejection/expiry/revoked principal/double tab/reconnect/cancel/stale epoch/failure/unknown outcome scenarios. Assertions include zero tool execution before valid approval, no “complete” status on approval click, no duplicate effect after reconnect.
- [ ] Run for RED; integrate existing backend state mappings and typed interaction requests. Actual question suspension/answer resume and effect approvals are persisted by Gateway/orchestrator/policy, not inferred from rendered prose.
- [ ] Run for GREEN with actual Linux isolation/policy/privacy and bounded budgets. Record browser-to-Gateway-to-component trace IDs and service evidence.
- [ ] System task 16 proves the protected backend slice through its authenticated contract client first; U19 adds the real browser interaction test afterward. Do not create a dependency cycle by making system task 16 wait for U19.
- [ ] **Live flow gate:** demonstrable real protected action and denial, refresh recovery, receipt verification, and accurate UI status. Commit; UI alone cannot establish this gate.

## 10. Quality, conformance and handoff

### U20: Responsive layout, accessibility and visual verification

Depends on U16 (may run before U17–U19). Owns shared tokens/adapters and visual/accessibility harness; coordinated review for page adjustments. Requirements: F01/F11/F13/F14/F15.

- [ ] Add `tests/ui/accessibility/workspace.spec.ts`: keyboard reaches sidebar/composer/card actions, drawers return focus, labels present, pending questions/approvals announce safely, reduced motion works. No critical/serious automated accessibility violations in covered routes.
- [ ] Add screenshots for 390px mobile, 768px tablet and 1440px desktop in light/dark themes, including long approval preview/code/table, empty page, failure and streaming states.
- [ ] Run for RED; implement spec widths/tokens, safe-area composer, mobile/history drawers, wrapping, contrast/focus and shared CSS normalization for selected vendor blocks.
- [ ] Run for GREEN; manually review actual rendered screenshots/focus flow. Snapshot baselines may not be blindly updated to hide regressions; commit with images/evidence.

### U21: Frontend architecture, secret, race and API-drift protection

Depends on U19/U20. Owns tests/ui/security, boundary/source scripts and protected UI baseline review. Requirements: F01–F18.

- [ ] Add `tests/ui/security/conformance.test.ts`: eighth navigation/approval route, feature-owned question-as-approval handler, direct provider import, Next generation route, competing chat store, missing wrapper/license, or modified wire schema without compatibility evidence fails.
- [ ] Browser security tests seed a fake secret/private memory and inspect local/session storage, console, URLs, transcript/event payloads and cross-workspace state; assert zero unauthorized exposure. Test Markdown/preview XSS and mutation CSRF/Origin/ownership denial.
- [ ] Recovery/race tests cover event gaps, duplicated deltas, old-chat late events, double decision, expired auth/proposal, lost send acknowledgement and stale catalog/settings revisions.
- [ ] Run for RED, implement missing protection/recovery in its owning module with review; run all UI checks for GREEN. Do not weaken tests or vendor adapter boundaries to make a failing screen pass.
- [ ] Wire checks into provider-neutral system verify/release CI; no critical live check is skipped. Commit with task-to-F-requirement evidence.

### U22: Release evidence, integration matrix and agent handoff

Depends on U21 and existing system release task 25 for a production claim. Owns docs/release-evidence/frontend.md, UI ledger/source inventory, operator handoff. Requirements: F11/F12/F15/F16/F17/F18.

- [ ] Run frozen install, ui:verify, UI e2e/security/a11y/visual plus affected backend security/protocol/recovery checks on recorded environments; capture exit codes/test counts, component/source hashes and reviewed screenshots.
- [ ] Produce section → wrapper → contract → Gateway port → backend task → test → evidence matrix. List demo-only/unavailable versus real enabled features, exact library/source selection and known limitations.
- [ ] Verify seven sections, all in-chat interactions, supported model/skill/provider statuses, no direct frontend effect path and preserved 12-node architecture baseline.
- [ ] Record recommended operating instructions: local demo, live connection, login/logout, interrupted stream recovery, pending decisions, failure/unknown outcomes and release rollback. Do not claim production release without system task 25 and all advertised live port gates.
- [ ] Update tasks only when evidence proves completion; commit/handoff with user-selected execution/integration method. External deployment is a separately authorized action.

## 11. Agent coordination rules and ready-to-use task brief

This plan does not spawn or authorize agents. If the user later authorizes multiple agents, shared files have one owner: contract/GatewayClient owner (U02), store/transport owner (U05), navigation/token owner (U01/U04), interaction owner (U08/U09). Page agents U11–U16 may work after these boundaries are complete only if assigned disjoint files. Integration/security tasks are sequential after their dependencies. Reviewer checks spec conformity separately from implementation quality.

Pass this exact task brief to an authorized worker, replacing the brackets with the selected ledger entry:

```text
Read root AGENTS.md, both design specs, the UI build plan, ui-baseline.json,
and ui-task-ledger.json. Implement task [Uxx] only.
Owned files: [exact paths from the task].
Consumed interfaces: [GatewayClient/DTOs/wrappers specified in the task].
Requirement IDs: [Fxx and relevant Rxx].
Acceptance tests and commands: [named task checks].
Preserve seven navigation sections. Questions and approvals render inside Chat.
Use the one shared store/client; never create provider routes or an approval page.
Do not change shared contracts, sidebar labels, trust/approval rules, vendor imports,
or protected tests without reporting the concrete proposed change for review.
Report changed files, RED/GREEN evidence, integration limitations and remaining work.
Update only your task's evidence/status after successful verification.
```

If a component API is uncertain, read its recorded official source/docs and validate a small fixture; do not invent props. If a backend port is absent, expose typed unavailable state; do not implement the owning service inside a page. If mock behavior differs from live contract, fix the shared contract/fixture with its owner; do not fork page-specific APIs.

## 12. Final completion checklist

- [ ] Exactly seven primary navigation entries; conversation history remains secondary.
- [ ] Chat supports safe messages/streaming, attachments, clarification, approval, task/tool progress, results, cancellation and reconnect.
- [ ] Questions and approvals use separate contracts/endpoints; management approval always opens owning Chat.
- [ ] Models, Skills, Connections, Memory, Activity and Settings use authorized versioned Gateway projections.
- [ ] One chat state/client; qualified component sources and common token system.
- [ ] Every screen has loading/empty/unavailable/denied/error/conflict/success states.
- [ ] Keys/private content stay out of browser persistence/logs; safe content/preview and actual server authorization verified.
- [ ] Responsive/accessibility/screenshots reviewed; explicit demo/live status and no automatic mock fallback.
- [ ] Actual protected model/tool/action flow and system release gates pass before a real-system completion claim.
- [ ] All U01–U22 task evidence and F01–F18 coverage are recorded; source/system architecture changes have approved decisions.

Begin with U01, then U02 and U03. The first deliverable is the shared contract + simulated Gateway, followed immediately by the Chat shell. This is the concrete frontend build sequence requested by the user; all implementation tasks remain pending in this planning turn.
