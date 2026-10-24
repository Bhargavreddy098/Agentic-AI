# Desktop workspace implementation evidence — 2026-10-24

**Update 2026-10-24:** Stage 07 is now locally qualified and the Activity pane uses real run projections, reviewed controls and durable SSE. See [Stage 07 qualification](../backend/25-LOCAL-EXECUTION-QUALIFICATION.md). Statements below about an unavailable Stage 07 describe the earlier Stage 01–06 frontend baseline. Public execution start and gateway replacement remain unavailable.


Implemented frontend scope: the approved conversation/project information architecture over the canonical Stage 01–06 API. No backend source, migrations, provider behavior, or product architecture was changed in this task. Existing unrelated checkout changes were preserved.

The main sidebar now contains New conversation, search over loaded project/conversation titles, project conversations, Needs attention, Settings, and connection access. Project and conversation lists are real, scoped, abortable, and cursor-paginated. Project changes reset selection; late conversation-create responses cannot open under a different active project. Session changes invalidate displayed list ownership and clear memory-only drafts. Drafts are UI state, not a replacement for durable PostgreSQL messages.

The center renders actual message pages, ordered using integer-safe sequence strings, and saves conversations/messages after explicit review. Requests reuse the existing cookie/CSRF client and stable logical idempotency operations. Empty/failed/disconnected states are explicit. The composer offers an actual project artifact picker, limited to available artifacts and 10 selections; backend scope/release validation remains authoritative. Attachments can be uploaded through the retained real upload workflow in Files > Upload.

Files, upload tools, decisions, and operation lookup use a contextual right pane. Existing exact revision/digest approval forms remain authoritative. They are not interpreted from AI prose. Policies, budgets, providers, models, routing, session controls, and developer tools move into the settings dialog. All 20 management destinations remain reachable; a browser check opened each one and inspected its matching content heading. The native HTML modal supports Escape and focus restoration; settings does not unmount the underlying conversation. Legacy section hashes open their corresponding settings home; project query references are retained.

Stage 07 status: NOT IMPLEMENTED in backend. Activity explicitly explains the unavailable durable tasks, recovery, checkpoints, and streaming. It offers the existing operation lookup without inventing runs or SSE routes. No live run controls, fake progress, assistant generation, or verified-completion claims are enabled. The frontend cannot qualify Stage 07 independently.

Electron status: desktop-style React frontend only. No Electron package, preload bridge, native bootstrap, installer, or update mechanism was introduced in this task. Those boundaries remain separately designed work in the UX plan.

Checks:
- npm test: 85 passed; includes 64-bit transcript ordering, composer bounds/artifact references, and refusing unimplemented Stage 07 routes before network.
- npm run typecheck: passed; final production build also checks types.
- npm run lint: passed with existing retained warnings; a new unused import was subsequently removed.
- npm run build -- --webpack: passed for the first implementation; final refinement build checked separately before handoff.
- node --env-file-if-exists=.env.admin --test frontend/my-app/tests/live-workbench.integration.mjs: passed against disposable real PostgreSQL and the actual composed API. Extended coverage creates a desktop conversation, saves composer text, reads it back, and rejects /runs locally. The sandbox initially blocked loopback with EACCES; the same test passed outside that network restriction. No paid calls or mutations of user project data.
- Browser: all 20 settings/advanced homes, Settings close/focus return, action/context navigation, and the unavailable Stage 07 activity state inspected.
- Responsive screenshots: 1440, 768, 390px, inspected. First pass: zero failures; contrast and small-text warnings prompted targeted readability changes. Large empty transcript space is intentional in an owner-disconnected workspace; no invented records fill it.

Limits: the authenticated browser bootstrap was not consumed. Authenticated writes were verified through the same client/desktop helper boundary against disposable PostgreSQL, not an authenticated manual browser session. Native artifact export still requires a separately registered trusted destination reference. Metadata/content/download/export tools remain available; this task does not add an executable HTML preview or unsafe renderer file access.

Final handoff checks: production build passed after refinements; targeted ESLint passed with no warnings/errors on all changed TypeScript/test files; git diff --check passed. PRODUCT_IDEA.md SHA-256 remains 4776824A4AB012E6C6F84C4737906DE1F3FAF21EDBC80314E60CD0C16AD47566. Preview is served on local port 3000. No commit, push, new dependency, or backend modification was performed by this task.

Visual review: inspected saved desktop, tablet, and mobile images. The main hierarchy centers conversations and keeps administrative tools in settings. The empty transcript is intentional before owner connection. Final inspection's two near-threshold sidebar labels received a darker color; remaining small labels are metadata/status text. No placeholder tasks, counts, or transcript messages are rendered. Authenticated browser-specific interaction remains unverified as noted above.

