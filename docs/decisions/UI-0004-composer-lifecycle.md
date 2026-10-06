# UI-0004 — Store-owned submission and upload lifecycle

Implements approved U06. One ChatStore owns uncertain submissions by conversation and cancellation commands by run, across navigation and remount. Identity loss clears both bounded caches. Acknowledgements must match their command ID; an uncertain response preserves that ID for retry. Applied acknowledgements clear only the original conversation's unchanged draft. No browser persistence is introduced.

Two additive UI contract corrections are necessary for the planned lifecycle: optional `activeRunId` in a conversation snapshot enables correct Stop after reload; authenticated `GET /uploads/:id` returns UploadView for bounded status polling. Both use the same GatewayClient and authority boundaries. Compatibility cost: old snapshots remain valid but cannot enable Stop without a known run ID; real Gateway qualification must implement this status endpoint before attachment capability is enabled. No new service/component is created.

Uploads validate session limits, expose uploading/scanning/ready/rejected, and submit only ready IDs. Delayed scans poll up to twelve times, 250 ms apart; pending exhaustion remains quarantined with a remove/retry notice. Abort cleans requests/timers; cross-upload response IDs are rejected. MIME/digest/ownership enforcement remains backend responsibility. The demo discards bytes and uses synthetic scanning.

Fresh review identified local retry identity loss, scanning without continuation, and cancellation identity loss/mismatch. Store ownership, read-only status polling, run-scoped retry IDs and acknowledgement checks resolve them. A stale post-unmount draft write reproduced RED and now passes. Component and real-browser cases verify keyboard composition, limits, upload states and restored-snapshot Stop.

Root test dependencies reuse the already qualified exact React pins. Vitest's JSX transform is explicitly automatic so component tests compile Next sources without changing the production JSX compiler configuration.
