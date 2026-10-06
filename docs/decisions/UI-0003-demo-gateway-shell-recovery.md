# UI-0003 — Demo Gateway, shell and recovery

Date: 2026-10-06. Implements approved U03–U05 within the user's continuing implementation authorization. No architecture component or authority boundary changes.

The Hono fixture is loopback-only, synthetic, bounded and refused in production mode. The web proxy exists only when `NEXT_PUBLIC_ASI_UI_MODE=demo` is explicitly set; the default live client has no demo fallback. The proxy forwards the specified UI API, never creates inference routes. Real backend integration remains gated by system 03–16/19 and U17–U19.

One WorkspaceProvider owns the client and one ChatStore. Shell history/badges derive from authenticated summaries in that workspace; selected canonical events update its pending count. Questions and approvals remain canonical Chat interactions. Drafts stay in memory, bounded per conversation, and clear on identity changes or lost authorization.

Fresh U03 review found cancelled decisions could resume, delayed completion could affect a newer run, and upload transport skipped demo authentication. Failing regressions reproduced all three; fixes invalidate pending decisions, fence the active run and reuse shared transport headers/mode checks.

Fresh U05 review found late recovery rejection could clear another chat and recovery could retry without progress. Generation guards, cursor coverage and a three-attempt limit fix both; regression tests confirm the cases. HTTP reload plus replay reconstructs canonical decisions/messages.

Web-local imports use explicit `.ts` suffixes with `allowImportingTsExtensions` in the two no-emit check configurations. This resolves both NodeNext test checking and Next/Turbopack source imports. Emitting contracts/UI/fixture configurations remain unchanged.

U04 management routes are unavailable scaffolds. Composer/message/decision presentation belongs to U06–U10 and is not counted complete by this decision. Upload scanning, policy, identity and task execution in U03 are synthetic; no production security claim.
