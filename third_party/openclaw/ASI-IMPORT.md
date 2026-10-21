# OpenClaw frontend source import

Imported from https://github.com/openclaw/openclaw.git on 2026-10-21.

- Commit: `844b03541a8bdbc01f1bbac3c218d1b579123a12`
- Upstream package version: `2026.10.5`
- License: MIT; original `LICENSE` and `THIRD_PARTY_NOTICES.md` retained.
- `ui/`: complete upstream Control UI source, assets, configuration and tests.
- `packages/`: referenced upstream workspace packages, including the browser Gateway client and protocol.
- `src/` and `scripts/`: statically referenced upstream support files. These are reference source, not registered ASI backend services.
- `ASI-IMPORT-MANIFEST.json`: upstream identity and SHA-256/size for every copied file, plus unresolved static references.

All imported upstream files retain their downloaded bytes. The ASI import notes,
manifest and verification script are additions. No upstream installation scripts,
provider calls or tool handlers were executed. The existing ASI frontend/backend,
startup commands and dependency lockfile were not replaced.

This directory is intentionally outside the ASI pnpm workspace. Root lint and
architecture/dependency checks exclude this specific reference snapshot; code
subsequently integrated into `apps/` or `packages/` must pass normal ASI checks.
No third-party package is promoted into the ASI dependency inventory by this copy.

## What this pull does and does not provide

OpenClaw's current UI uses Solid 2 with Vite. ASI uses React/Next.js. The imported
UI expects the OpenClaw WebSocket Gateway protocol, connection handshake and RPC
methods. ASI's current frontend uses its own HTTP/SSE Gateway contracts. They are
not interchangeable clients. OpenClaw's UI guidance also couples UI/Gateway
versions, so matching a socket URL alone is not an integration strategy.

The source is now available locally for reuse. It has not been built, installed,
served or connected to ASI. This is not a standalone OpenClaw checkout: the manifest
lists unresolved references, including backend/test/plugin/build dependencies.
Static import discovery does not establish complete dynamic/asset dependencies.
Do not run the copied root installation/start commands as ASI setup instructions.

## Where to begin the later integration

1. Select the upstream screens to keep and map their data/actions to ASI contracts.
2. Decide between adapting the Solid client transport and providing a bounded
   compatibility API. Specify requests, events, cancellation and replay explicitly.
3. Keep ASI's no-RBAC local scope: OpenClaw connection authentication, device
   identity and action approval are separate concerns from user roles.
4. Keep policy/privacy/budget/isolation enforcement in the ASI backend. Do not
   copy an upstream execution path as an alternate authority.
5. Prepare an isolated runnable frontend package with its exact shared dependency
   closure and build configuration; then test a real conversation end to end.
6. Apply the requested parchment/light presentation through an intentional design
   adaptation. No upstream styles were changed during this source pull.

## Verify the source copy

From the ASI repository root:

```powershell
node third_party/openclaw/verify-import.cjs
```

This verifies imported file identities only. It does not certify compilation,
runtime behavior, dependency safety or backend compatibility.
