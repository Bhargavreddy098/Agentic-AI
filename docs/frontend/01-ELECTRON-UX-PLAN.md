# ASI Electron desktop UX plan

**Update 2026-10-24:** Stage 07 is now locally qualified and the Activity pane uses real run projections, reviewed controls and durable SSE. See [Stage 07 qualification](../backend/25-LOCAL-EXECUTION-QUALIFICATION.md). Statements below about an unavailable Stage 07 describe the earlier Stage 01–06 frontend baseline. Public execution start and gateway replacement remain unavailable.


Date: 2026-10-24
Status: proposed UX plan; not an implementation or architecture approval.
Scope: reframe the existing Stage 01–06 experience around user work, and describe the future desktop experience without claiming later-stage capability.

## 1. Finding

ASI currently turns its API surface into its main navigation. The current studio exposes 20 destinations, including policies, grants, routing, database, session, and capabilities. This makes implementation concepts compete with projects and conversations. A visual reskin alone cannot resolve that information architecture.

The target experience should answer: What am I working on? What is happening? What needs my decision? Where is the result?

Approvals are trusted interactive controls attached to work. They are not ordinary assistant prose. Policies, authorization, budgets, and completion checks remain backend authorities even when their presentation becomes quieter.

## 2. Research and limits

The user supplied https://www.hermesbible.com/ . It identifies itself as an unofficial community index. Official desktop documentation and source design rules were used to distinguish desktop behavior from terminal and admin interfaces.

References inspected on 2026-10-24:
- https://www.hermesbible.com/
- https://hermes-agent.nousresearch.com/desktop
- https://hermes-agent.nousresearch.com/docs/user-guide/desktop
- https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/README.md
- https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/DESIGN.md

Hermes documentation describes a conversation-centered desktop surface with project navigation, contextual previews, file attachments, and expandable activity. Its design rules preserve foreground context, place decisions alongside conversation, and keep settings as short side tasks. Its README separates Electron native responsibilities, React interaction state, and the agent backend. These are useful patterns, not an instruction to adopt its runtime or transport.

The public desktop product preview was visually inspected in the browser. The desktop binary was not installed or exercised. Findings about its interaction behavior are documentation-derived, not claims from testing the installed app. ASI's live disconnected workspace was also inspected. No provider call, approval decision, or production mutation was performed.

Hermes has more than two surfaces: desktop, CLI/TUI, and web dashboard are distinct. This plan selects only the desktop pattern; no terminal-emulated chat.

## 3. Proposed information architecture

Main sidebar:
1. New conversation — opens the project-aware conversation creation flow.
2. Search — searches currently loaded conversation/project titles initially; no invented global search service.
3. Projects — expandable project rows containing their conversations, with explicit loading and pagination.
4. Recent conversations — real loaded history; do not claim a cross-project recent ordering unless the backend supplies one.
5. Needs attention — opens existing pending approval records. Only show counts derived from a complete result or server-supported count; no count guessed from one page.

Bottom sidebar:
- Settings
- Connection indicator; click opens diagnostics/recovery.

Within a project:
- Conversations
- Files & outputs (current artifacts and uploads)
- Project settings (details, snapshots, archive, permissions, budget)

A global file library is not implied by the existing project-scoped artifact API. Always show which project supplies results.

Do not show empty later-stage navigation such as Agents, Memory, Schedules, Browser automation, or Deployments. Introduce these only with their actual stage dependencies and acceptance evidence.

## 4. Desktop layout

Three working zones:
- Left: 240–280px resizable/collapsible project and conversation navigation.
- Center: flexible conversation, transcript, and composer. Target reading width 720–840px, not full-window lines.
- Right: optional 360–520px context pane for selected artifacts, file details, approval details, and later verification evidence.

Top bar: project breadcrumb, conversation name, connection state only when actionable, and the context-pane toggle. Keep operating-system window controls unobstructed.

Composer: multiline input, Attach, and Send. Show selected project explicitly. A model control can expose registry/routing information but cannot promise per-message routing until the message/inference contract supports it. No microphone, terminal, or autonomous execution button in the current scope.

Avoid automatic pane opening when a result arrives. Show an Open preview action. Returning from settings or a preview preserves the conversation and unsent draft. Hiding a pane differs from closing it; future active previews must not be silently restarted by layout changes.

At narrow widths, use a navigation drawer and a full-width context view with Back. At 1024px, allow one primary working pane. Never squeeze transcript, sidebar, and inspector into three unreadable columns.

## 5. Where existing backend concerns belong

| Current destination | Proposed home | Current contract boundary |
| --- | --- | --- |
| Projects | Main sidebar/project switcher | Existing list/create/read/update/archive |
| Conversations | Project tree and center pane | Existing persisted messages; no claim of governed generation |
| Artifacts | Project Files & outputs + preview pane | Project-scoped pagination, authorized content download/export |
| Uploads | Composer attachment flow + file panel | Real create/PUT/complete; quarantine remains visible |
| Operations | Contextual processing status; advanced diagnostics | Existing operation lookup, not a live run engine |
| Approvals | Inline decision surface + Needs attention | Existing revision-bound records; no invented contract generator |
| Policies | Settings > Safety & permissions | Existing current/revision/activation controls |
| Grants | Project settings > Permissions | Existing scoped grant/revoke controls |
| Budgets | Project settings > Spending limits | Exact currency units and record version |
| Usage | Settings > Usage | Only dimensions returned by the API |
| Settings | Settings overlay | Approved typed policy DTOs; cannot override active policy |
| Providers | Settings > Models & connections | Existing provider management/discovery restrictions |
| Models | Picker/catalog inside Models & connections | Read actual registry capabilities |
| Routing | Advanced section within Models & connections | Explicit preview; does not execute inference |
| Health / Database | Connection menu > Diagnostics | Canonical liveness/readiness; no invented SQL administration |
| Session | Account/connection controls | Existing bootstrap/current/revoke |
| Workspaces | Workspace picker/settings | Only current supported list behavior |
| Capabilities | Diagnostics / unavailable-feature explanations | Backend capability response is authoritative |
| API console | Settings > Advanced > Developer tools | Retain for debugging, remove from everyday navigation |

All existing supported routes retain a reachable UI home. Navigation grouping is not deletion of APIs or weakening of their requirements.

## 6. Primary journeys

### A. Open the app

Future Electron: open window -> check trusted local service -> establish owner session -> recover selected project/conversation -> show the actual workspace.

Distinguish starting, disconnected, authentication required, database unavailable, and ready. Offer only relevant recovery actions. Never present a working composer before its prerequisites are available. A renderer load is not backend readiness.

Today: retain the existing launcher challenge flow. A later native identity adapter may remove manual token pasting after its security contract is designed and verified. Do not auto-read secrets from renderer JavaScript.

### B. Start work in a project

Select/create project -> create/open conversation -> type message -> review attachments -> send -> show the stored message and real response state.

Stage 04 message persistence does not establish an AI response. Stage 06 provider support does not by itself establish a governed conversation execution route. Until approved orchestration/inference composition exists, clearly describe message storage and available capabilities rather than fabricating a streaming assistant turn.

### C. Review a decision

Future work generates a trusted approval request -> conversation shows a decision card -> owner expands target, scope, risk, cost, revision, and expiry -> Approve or Reject -> awaiting server confirmation -> confirmed/expired/conflict/error state.

Use the exact backend approval ID, nonce, digest, and revision. Do not render assistant-generated approval buttons as authority. Current approved contract does not automatically include an Edit request action; that may prepare a local draft but cannot mutate the approval or bypass immutable revisions.

Needs attention provides a recovery path when the owner is viewing another conversation. A background request updates its badge, not the foreground route or focus. Decisions remain available by keyboard and in a detail view.

### D. Review an output

Artifact link -> show actual metadata and release/quarantine state -> authorized content preview if safe/supported -> Download or Export.

A desktop Save dialog must produce a native-authorized opaque destination reference before invoking the existing export route. A browser path is never accepted. Do not execute arbitrary HTML or scripts from an artifact in the trusted renderer. Unavailable preview types still offer metadata and an authorized download where permitted.

### E. Failure and recovery

Keep unsent text when a request fails. Show a safe error and request ID. Retry only within the existing stable idempotency operation. Unknown write outcomes require rereading/reconciliation, not blind duplicate submission. Expired sessions offer reconnection without pretending the write succeeded. Version conflicts reload the current record for review.

## 7. Trusted activity and response components

Component families:
- DesktopShell, WorkspaceSidebar, ProjectTree, ConversationList, WorkspaceHeader
- ConversationView, MessageComposer, AttachmentTray, MessageBlock
- ActivityDisclosure, OperationStatus, DecisionCard, DecisionDetail
- ArtifactLink, ArtifactPreview, FileList, ExportDialog
- SettingsOverlay, SettingsNavigation, ProviderEditor, PermissionEditor, SpendingLimitEditor
- ConnectionStatus, ConnectionRecovery, DiagnosticsPanel
- Shared Button, Input, Textarea, Select, Dialog, Menu, Tooltip, Toast, EmptyState, ErrorState, LoadingState

Use current qualified primitives and one icon vocabulary (Lucide is already installed). Do not replace the frontend framework or add a second component system solely for visual similarity. Code and opaque IDs use monospace; prose and controls use a readable UI face.

Present activity separately from assistant narration. Current operation status must reflect current operation DTO values. Future run/task labels must map to the approved state machines, including cancelling and uncertain outcomes. A green assistant statement is never verification evidence.

## 8. Electron boundary proposal

This is a future implementation design, not permission to install or package a new runtime now.

- Renderer: existing React product views and approved API client. No direct Node, PostgreSQL, arbitrary filesystem, or host shell access.
- Preload: narrow, typed, allowlisted native operations with input validation and sender checks.
- Main process: window lifecycle and approved native dialogs/launcher integration. It does not replace the ASI orchestrator or policy authority.
- Backend: retain Express, PostgreSQL, canonical API, scoped permissions, CSRF/origin protections, and durable truth.

No transport replacement with Hermes JSON-RPC/WebSockets is proposed. Stage 07 SSE remains ASI's selected future progress contract. Native protocol/origin/session handling needs a reviewed design and security tests before enabling it. External links must not navigate the trusted renderer to untrusted content.

Minimize, close window, quit application, and cancel work must have separate defined behavior. Until durable recovery exists, do not promise that work continues or safely resumes. Native packaging/updating and release claims remain subject to the roadmap qualification gates.

## 9. Implementation sequence

1. Map current routes to the proposed homes; retain route coverage tests. No backend changes required for this mapping.
2. Build the project/conversation workspace, real message history, file panel, and contextual forms with existing APIs. Preserve review, CAS, CSRF, and idempotency.
3. Move configuration into Settings and developer diagnostics into Advanced. Add keyboard navigation, focus return, accessible names, and responsive layouts.
4. Complete Stage 07 separately in dependency order. Then connect real progress, recovery, and SSE with explicit states. Do not claim this from a UI prototype.
5. Add later planning, contract, execution, and verification UX only after their backend gates. No public execution start before Stages 09–12 pass.
6. Implement the Electron shell as a separately assigned bounded slice, using reviewed identity/native boundaries. Qualify packaging/update/install/recovery at the release stage.

A prototype may illustrate future interactions only if clearly labeled and separate from real functionality. Do not replace the current real API paths with mock success.

## 10. Acceptance criteria

- A new owner can locate a project, open a conversation, and find its files without understanding policies, routing, SQL, or API commands.
- All currently supported routes retain a functional home; the manifest coverage remains 50/50 without making every route a sidebar item.
- Project switches clear scoped results and selections; no cross-project message, artifact, approval, or budget leakage.
- Existing approvals expose their exact action/revision and authoritative status; stale/expired/replayed decisions fail visibly.
- Settings closes back to the same conversation, scroll position, and draft. Background updates never steal focus.
- Loading, empty, offline, unauthorized, conflict, accepted, failed, and uncertain outcomes remain distinguishable.
- Composer submission does not imply model execution, and accepted operations do not imply verified completion.
- Keyboard users can navigate the sidebar, composer, dialogs, decisions, and context pane; Escape returns focus appropriately. Reduced motion and readable light/dark contrast are verified.
- Native dialogs return trusted references; arbitrary browser-supplied host paths are refused.
- Recheck the real PostgreSQL integration and existing contract/security tests for affected behaviors. A visual prototype or screenshot cannot qualify a roadmap stage.

## 11. Decisions

Recommended: approve this information architecture as the direction for the next frontend implementation, keeping ASI's backend/security architecture intact.

Not selected: a backend-resource admin sidebar as the everyday home; a TUI embedded in Electron; a fork of Hermes runtime; global agent/skills/remote-cloud features copied ahead of ASI's roadmap; removal of approval enforcement.

Unresolved for later native implementation: Electron packaging entry, trusted local origin, session bootstrap handoff, bounded native IPC contracts, secure preview process, app quit/recovery semantics, signing/updating. These are explicit design work, not details to silently invent while restyling the frontend.
