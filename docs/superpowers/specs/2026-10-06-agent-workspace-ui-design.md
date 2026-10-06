# Agent Workspace Frontend — Proposed Design and Agent Boundary Rules

Date: 2026-10-06. Status: PROPOSED; documentation only.

Build guide: `../plans/2026-10-06-agent-workspace-ui-build.md`.
System architecture: `2026-10-06-asi-agent-design.md`.
UI baseline: `../../ui-baseline.json`. Task ledger: `../../ui-task-ledger.json`.

## 1. Purpose and relationship to the existing plan

The original 30-task plan covers the agent system and its backend/security build. It does not supply a complete screen-by-screen web frontend sequence. This spec and the companion guide supply that missing sequence, including sidebar, chat, interactive questions/approvals, all seven sections, shared contracts, a mock Gateway, and real-backend integration gates.

The latest user request prioritizes a web frontend and names eleven UI component sources. The web app is another Client Surface (`channels`) connected to the same Unified Gateway. None of the 12 architecture components is removed or bypassed. CLI/Slack remain adapters that can be delivered later; the web app does not become the orchestrator or policy service.

Build order: minimal reproducible workspace + shared contracts → simulated Gateway → frontend → authenticated real Gateway/read APIs → protected real run flow → full validation. A simulated UI may be built before the real agent backend is complete. Real external actions remain disabled until their existing system gates pass.

Working library assumption: AI Elements is the primary chat presentation layer; shadcn/ui is the shared shell/control foundation; application-owned typed state and one GatewayClient own interactions. Other user-listed libraries are a component-source catalog with reviewed, explicit roles. A question about primary-library preference was sent to the user; absence of an answer is not approval. The guide remains a proposed default and can be revised without implementing product code.

## 2. Library selection and compatibility decisions

| Source | Verified information / inspection status | Proposed role |
|---|---|---|
| [21st.dev AI blocks](https://21st.dev/community/libraries/s/ai) | Catalog of multiple AI component collections | Discover selected suggestions/loaders/empty-state blocks; review each item's source, license, dependencies |
| [AI Elements](https://elements.ai-sdk.dev/) | shadcn-based AI components; Conversation, Message, Prompt Input, Confirmation, Tool, Model Selector and other components are documented | Primary chat presentation; copied source wrapped by project components |
| [assistant-ui](https://www.assistant-ui.com/docs/runtimes/custom/external-store) | ExternalStoreRuntime can adapt an application's existing chat state | Supported alternative if selected; one adapter preserves the project store and contracts. Do not run a second independent conversation store |
| [AI/UI](https://ui.kitn.ai/) | Framework-agnostic web components; React/custom-element integration requires its own adapter | Optional artifact/voice surface after React event/property/theme qualification; no second whole-chat widget |
| [AgentUI](https://www.agentui.pro/) | React agent components include approval, activity, usage and model-selection surfaces | Candidate source for project QuestionCard/ApprovalCard/activity styles; source and props qualified before adoption |
| [Rendyn](https://rendyn.dev/) | React source catalog and component previews are accessible | Candidate approval/progress/command-palette blocks; development-time catalog access only |
| [VLLNT UI](https://ui.vllnt.com/docs) | Documentation describes registry/source installation; homepage fetch failed in this tool context | Optional progress/status blocks; verify current source exports and peer/theme compatibility before inclusion |
| [ai2.design](https://ai2.design/) | shadcn-compatible registry and semantic variants documented | Optional form/confirmation styling; map into the common token/primitive system |
| [Smartera UI](https://smarteraui.com/) | React/registry source and token/accessibility system documented | Candidate settings/forms/tables; avoid importing a second global token system without mapping |
| [Control UI](https://control-ui.dev/get-started) | Source registry with chat/workspace patterns; site labels itself alpha | Candidate thread rail/task/context layouts; install individual qualified blocks, freeze source |
| [Codesweep UI](https://codesweep.ai/ui/CATALOG.html) | Supplied catalog URL could not be retrieved; no official source/API/license was established during this inspection | Pending source qualification; agents must not invent exports or claim it was installed/verified |

All eleven sources are represented in the selection inventory. This does not mean eleven complete design systems are installed simultaneously. Assign one provider to each project component slot. If the user requires components from every source, qualify them one at a time; inaccessible/incompatible items remain explicitly pending instead of silently substituted.

Exact versions, registry item URLs, source hashes, licenses, peer dependencies, source-derived transitive dependencies, and wrapper ownership are recorded in UI Task U01. Do not copy a website's component count, “production-ready” claim, CDN snippet, model-calling route, or installer instructions as architecture requirements.

Proposed frontend stack: Next.js App Router, React 19, TypeScript 5.9.x strict, Tailwind CSS 4, shadcn/ui with one qualified primitive variant, AI Elements presentation. AI Elements' [setup page](https://elements.ai-sdk.dev/docs/setup) currently lists React 19, Tailwind 4, an AI SDK setup, and Next.js prerequisites; qualify exact compatible releases rather than guessing package versions. Existing Node 24 baseline applies. AI SDK UI types/rendering may be used; provider SDK credentials and generation routes remain in the backend privacy service.

All vendor imports/source live behind `packages/ui/src/vendor/` and `packages/ui/src/adapters/`; feature code imports project wrappers. A source registry/MCP server used to obtain UI code is a development tool and is unrelated to the product's runtime MCP integrations screen.

## 3. Exactly seven primary navigation sections

The sidebar is part of the shared workspace shell. The active section renders in the main panel. Seven section entries appear in the default authenticated workspace, in this order:

| ID | Exact label | Route | Screen contents | Interaction destination |
|---|---|---|---|---|
| `chat` | Chat | `/chat`, `/chat/:conversationId` | Conversation rail, messages, composer, contextual model/skill selectors, questions, approvals, progress, results | Current conversation |
| `models` | Models & Providers | `/models` | Connected providers, authorized models, local/cloud status, effective/default model preferences, masked connection state | Policy-gated changes link to their conversation approval |
| `skills` | Skills | `/skills` | Installed versions, description, verification/availability, required permissions, enable/install/revoke requests | Selection in composer; installation/permission approval in Chat |
| `connections` | Tools & Connections | `/connections` | Tools, MCP servers, A2A remote agents, messaging connections, status, granted permissions | Connection/effect approval in Chat |
| `memory` | Memory | `/memory` | Authorized saved facts, sources, scopes, revision history, search, correction/deletion request | Policy-gated mutation approval in Chat |
| `activity` | Activity & Tasks | `/activity` | Runs, specialist/task progress, safe tool summaries, errors, tokens/cost, receipt references | “Open conversation” navigates to owning question/approval/result |
| `settings` | Settings | `/settings` | Appearance, profile/workspace, privacy preferences, spending limits, notifications, schedules, retention | Local appearance preferences apply locally; gated server changes use Chat |

There is no eighth Approvals, Questions, Agents, Reasoning, or Dashboard navigation entry. Conversation history is a secondary rail inside Chat, not another primary section. A sidebar badge on Chat may count authorized pending decisions; clicking it opens the relevant conversation. Activity is a cross-conversation read projection; the canonical decision controls remain in Chat.

Models & Providers manages catalog/configuration; the chat selector chooses a preference for the next run. Skills manages installation/trust; the composer selects available skills for the next run. Tools are operations; agents are role-bound workers shown through tasks/activity. A selected model/skill is a request to the backend and does not grant new permissions.

## 4. Chat workspace structure and component ownership

```text
AppShell
├─ AppSidebar (seven sections; Chat decision badge)
├─ WorkspaceHeader (workspace, connection, demo/live label)
└─ Main section
   └─ ChatPage
      ├─ ConversationRail (new/search/recent/rename/archive)
      └─ ConversationPanel
         ├─ ConversationHeader (title, effective model, active run, Stop)
         ├─ ConversationViewport
         │  ├─ UserMessage / AssistantMessage
         │  ├─ ClarificationCard
         │  ├─ ApprovalCard
         │  ├─ TaskProgressCard / ToolActivityCard
         │  ├─ ArtifactCard / CitationList / SafeStatusSummary
         │  └─ ErrorOrConnectionNotice
         └─ Composer (text, attachments, permitted model/skills, Send)
```

Artifacts may open a bounded preview drawer attached to the conversation. No duplicated global approval modal is introduced. Inline decisions remain visible in history after resolution; completed cards become read-only.

One reducer owns ordered conversation state. One GatewayClient owns transport. Presentation components emit typed intents; they never mutate server-authoritative state or execute tools. Do not combine useChat, assistant-ui internal persistence, and a custom reducer as independent owners of the same conversation.

Show concise status summaries supplied by the backend, such as “Searching approved sources.” Never invent private chain-of-thought, display system prompts, or label fake reasoning as a real model trace. Tool cards show user-relevant targets and outcomes; stack traces and credentials stay out of product views.

## 5. Questions and approvals are separate typed interactions

| Property | ClarificationCard | ApprovalCard |
|---|---|---|
| Purpose | Obtain missing task information | Authorize one specific proposed action |
| Required ID | interactionId, questionId, conversationId, runId, version | interactionId, approvalId, effectId, conversationId, runId, version |
| Contents | Question, allowed options, free-text rule, required fields | Action/target, redacted argument/change preview, relevant scope, expiry, safe explanation |
| Controls | Choose/respond/Submit; explicit skip only if backend permits | Approve once / Reject; input edit requests create a new proposal |
| Command | `answerClarification(...)` | `decideApproval(...)` |
| Authority | Never grants a capability | Backend checks user, policy, exact action/artifact, epoch, expiry and single use |
| Canonical server states | pending, answered, expired, cancelled | pending, approved, rejected, expired, cancelled |
| Local transient states | submitting, transport error | submitting, transport error |

A library may visually call both patterns “Approval Card”; the project wrappers still enforce these separate schemas and endpoints. A yes/no clarification is not tool authorization. An approval click means the decision was accepted only after backend acknowledgement; execution progress is a later event. Do not display “Action completed” on click.

For configuration requests originating in Models/Skills/Connections/Memory/Settings, Gateway returns a conversationId/interactionId. Navigate to that existing conversation or a backend-created “Configuration changes” conversation and render the same ApprovalCard. Never silently approve from a management screen. No raw credential values appear in previews, messages, URLs, events, browser storage, telemetry, or replay fixtures.

Questions suspend the existing backend run with `suspendReason: user_input`; UI may label this “Waiting for your answer.” Backend `waiting_approval` maps to “Waiting for approval.” No frontend-only run enum is added to the core architecture contract.

## 6. Proposed UI contracts and event ownership

Define schemas in `packages/contracts/src/ui/`. UI DTOs are safe projections, not direct database rows. Preserve the existing core RunContext, PolicyDecision, ApprovalRecord and DeliveryRecord; add projection/interaction contracts without silently renaming the core types.

Required types:

- `ConversationSummary`: conversationId, title, lastUpdatedAt, pendingDecisionCount, activeRun status, revision, workspaceId.
- `ConversationSnapshot`: conversationId, revision, lastEventSequence, messages/parts/interactions/tasks, effective model, permitted composer capabilities. Snapshot/cursor are captured consistently.
- `UiMessage`: messageId, role (user/assistant/system-notice), createdAt, ordered typed parts. Parts: text, citation, attachment, status-summary, task-reference, tool-reference, artifact-reference, clarification-reference, approval-reference.
- `ClarificationRequest`: interactionId/questionId/conversationId/runId, version, status, prompt, options with stable IDs, allowFreeText, allowMultiple, required, expiresAt if applicable. Answers contain option IDs and optional bounded text.
- `UiApprovalRequest`: interactionId/approvalId/effectId/conversationId/runId, version, status, redacted action/target/preview, expiresAt, requiredActorRole, server-bound action reference. No approval token or authority in Markdown.
- `TaskView`, `ToolView`, `ArtifactView`: IDs, conversation/run references, server status, bounded summary, permitted actions, safe evidence/download references, version.
- `ProviderView`, `ModelView`, `SkillView`, `ConnectionView`, `MemoryView`, `SettingsView`, `UsageView`: authorized data only, stable IDs, revision/status/availability and `allowedActions`; secrets never returned.
- `UiCommandResult`: commandId, status (applied/approval_required/rejected/conflict), current revision, optional conversationId/interactionId, normalized safe error.
- `UiEvent`: schemaVersion 1, eventId, conversationId, sequence, eventType, payload, occurredAt. Payload is a discriminated union, validated before reducing.

Supported conversation event types:

`message.created`, `message.delta`, `message.completed`, `run.status`, `clarification.requested`, `clarification.resolved`, `approval.requested`, `approval.resolved`, `task.updated`, `tool.updated`, `artifact.ready`, `model.effective`, `usage.updated`, `conversation.updated`, `notice`, `error`.

Snapshots, events and commands all have stable version/correlation IDs. Delta payload contains messageId, partId, deltaIndex and text; eventId/sequence dedup prevents repeated text. Older events do not reopen resolved cards or regress completed tasks. Gaps trigger replay/snapshot recovery, not speculative application of unordered chunks. Server time governs expiration; client timers are visual hints.

Frontend owns draft text, unsent attachment references, scroll position, open panels, form validation and transient submit state. Backend owns identities, conversations, durable messages, run/effect/task outcomes, approval validity, actual model routing, trust/permissions, spend and memory scope.

## 7. Proposed Gateway UI API

Routes below are a contract to implement, not existing endpoints. Browser uses same-origin `/api/ui/v1`; ingress/reverse proxy forwards to Hono Gateway. Next.js renders the app and does not host provider inference or an alternate agent loop. In demo mode the same contract targets an isolated mock Gateway with a persistent Demo label.

| Method and path | Purpose | Required semantics |
|---|---|---|
| GET `/me` | Authenticated workspace identity/capabilities | Backend derives identity; no caller-supplied authoritative tenant |
| GET/POST `/conversations` | List/create | Paginated authorized summaries; POST idempotency key |
| PATCH `/conversations/:id` | Rename/archive | Expected revision and ownership; retains durable history |
| GET `/conversations/:id/snapshot` | State + cursor | Consistent revision/lastEventSequence |
| POST `/conversations/:id/messages` | Submit message/preferences/attachment refs | Client message ID + idempotency key; durable accepted response |
| GET `/conversations/:id/events?after=:sequence` | SSE stream/replay | Authenticated, ordered, deduplicable; replay-window expiry requires snapshot |
| POST `/runs/:id/cancel` | Request cancellation | Idempotent; cancellation is confirmed by server state |
| POST `/clarifications/:id/answers` | Answer question | Expected interaction version, client command ID, option/text validation |
| POST `/approvals/:id/decisions` | Approve/reject exact action | Expected version, client command ID; authenticates approver and server-side action binding |
| POST `/uploads`, PUT `/uploads/:id/content`, POST `/uploads/:id/complete` | Quarantined attachment lifecycle | Authorized size/MIME/digest/status; return attachment references; unsupported inputs stay unavailable |
| GET `/models`, `/providers`, `/skills`, `/connections`, `/memory`, `/activity`, `/settings` | Authorized section projections | Pagination/status/allowedActions; unavailable feature gives typed unavailable state |
| POST `/commands` | Provider/skill/connection/memory/settings changes | Typed discriminated command; expected revision/idempotency; gated result points to Chat |
| GET `/artifacts/:id/content` | Authorized artifact view/download | Scoped permission, safe content disposition/type; preview restrictions apply |

Use authenticated same-origin session cookies with HttpOnly/Secure/SameSite policy and CSRF protection for mutations; validate Origin. A reconnect must not place bearer/provider tokens in the URL. Expired authentication stops the stream and requests sign-in. Mock credentials never authenticate to production. Browser does not call provider, PostgreSQL, Redis, MCP server, A2A agent, or sandbox directly.

Mock Gateway and real Gateway run the identical contract test suite. Live mode does not fall back to fixtures when unavailable. Catalog/features may report unavailable until the corresponding backend component is implemented; that is distinct from an empty list or a disconnected provider.

## 8. Screen behavior and usability requirements

- Chat: drafts survive section navigation within the authenticated browser session; server transcripts reload on refresh; do not persist provider keys or sensitive transcripts in localStorage. Tenant/logout change clears in-memory sensitive state.
- Composer: Enter sends, Shift+Enter adds newline, IME composition does not send; whitespace-only send is disabled; sending uses one stable command ID across safe retries; attachment readiness gates send.
- Scroll: follow streamed output while at bottom; preserve user's reading position after scroll-up; “New messages” button restores following; navigation to an approval scrolls to its exact card.
- Streaming: reconnect from validated cursor; gaps snapshot-resync; changing conversation aborts old subscription; late events cannot leak into another conversation; loading/server error/connection error are distinct.
- Approval: no default/preselected submitted consent; pending/submitting/resolved states visible; exact proposal version; duplicate click/double tab returns one decision; changed/expired proposal refreshes safely.
- Models: display preferred vs actual effective model; list local/cloud and unavailable/blocked status; estimates only when backend provides them. Provider key input is password-style, ephemeral, sent only to authorized credential handler, cleared after submission; returned data is masked metadata.
- Skills: display availability and verified/revoked status distinctly; selected skills do not run on selection; permission expansion follows Chat approval. No remote SKILL.md/script executes in browser.
- Connections: distinguish development UI registries from runtime MCP tools; show authenticated connection health/permissions; backend applies SSRF/egress checks.
- Memory: only authorized scopes are visible; sources/revisions/contradictions represented; corrections/deletions request a revision and may require Chat approval.
- Activity: show actual task states and permitted cancellation; approved/pending decision link points to original Chat; estimated unknown usage is labeled unknown rather than zero.
- Settings: local theme preference separate from server-governed privacy/quota/retention/schedule changes. Privilege/mode selector requests authority; it cannot set authority in the client.
- All seven sections: loading, empty, unavailable, permission denied, validation error, transport failure, stale revision and success states. Production has no fake “connected” or completed badges.

Desktop: expanded sidebar 240px, collapsed 64px; Chat history rail 240px; transcript max-width 880px. Tablet 768–1199px: history in a drawer, shared navigation collapsible. Mobile below 768px: navigation/history drawers, composer safe-area, bounded card previews; no viewport-wide horizontal scroll. These are proposed design tokens, not library defaults.

Accessibility: keyboard-operable controls, labeled inputs, visible focus, contrast checked in both themes, focus return from drawers, reduced-motion preference, semantic status announcements coalesced rather than token-by-token. Messages are rendered with safe Markdown/code rules; raw HTML/scripts are disabled. Artifact HTML is isolated and does not receive app credentials; executable preview/voice remain capability-gated until their own integration exists.

## 9. Frontend invariants (F01–F18)

F01. Exactly seven primary sections with labels/routes/order fixed in section 3.
F02. Clarifications, approvals and their canonical decision controls render inside Chat.
F03. A management-screen approval navigates to its backend-owned conversation; Activity links rather than duplicates decision controls.
F04. Clarification answers never grant effect permissions; question and approval contracts/actions remain separate.
F05. One conversation state owner, one GatewayClient, one selected primary chat presentation stack.
F06. All frontend operations traverse the Gateway; no provider/DB/tool/sandbox execution path in browser or Next inference route.
F07. Backend is authoritative for decisions, permission, effective model, trust, outcomes and usage.
F08. Ordered validated events, snapshot/cursor recovery and command idempotency survive retries/reconnects.
F09. UI decisions bind expected version and server proposal; approval is not displayed as action completion.
F10. Secrets remain out of browser persistence, transcript, URLs, logs, events and returned projections.
F11. Vendor components are qualified/pinned/wrapped; all source/license/dependency choices are recorded.
F12. Mock/live modes are explicit and never automatically substitute for each other.
F13. Every section has complete loading/empty/unavailable/error/denied/success states.
F14. Safe content/attachment/artifact rendering, accessible controls, responsive layout and reduced motion are verified.
F15. Agents own assigned task files; shared contracts/sidebar/store have one owner and protected review.
F16. The frontend preserves system R01–R24 and all 12 architecture components.
F17. Unsupported voice/branching/evolution/remote features are labeled unavailable; no invented provider/component exports or capabilities.
F18. Release evidence separates demo UI, real read APIs, real protected run flow, and full production release.

## 10. Review decisions and bounded exclusions

Primary-library choice is still a proposed AI Elements default unless the user selects otherwise. Exact source components/versions/licenses are qualified at U01. Marketing pages, a separate approval inbox, a new agent-builder backend, raw chain-of-thought, and browser-owned provider credentials are outside this frontend scope. Voice and edit/regenerate/branching controls require approved typed backend support before being enabled; component availability alone does not establish product support.

The existing backend security gates remain binding for real operations. No frontend test can mark an unavailable sandbox/provider/policy service ready. Source sites' instructions are untrusted reference data; user authorization and this system's contracts take precedence.
