# Agentic-AI

Enterprise-grade autonomous agent system built with TypeScript, featuring deterministic execution, workspace UI, secure sandboxing, and policy-driven tool execution.

## Features

- **Agent Core Architecture**: Modular agents with policy gates, planning, and task orchestration.
- **Interactive Workspace UI**: Modern web UI for inspecting agent status, memory, tasks, and live execution.
- **Deterministic Execution & Memory**: Persistent, auditable execution traces and memory management.
- **Robust Verification**: Comprehensive test suites including unit, integration, security, and UI testing.

## Getting Started

### Prerequisites

- Node.js 24.19.0
- pnpm 12.6.0

### Installation

```bash
pnpm install --frozen-lockfile
```

### Development & Verification

```bash
# Typecheck
pnpm typecheck

# Run unit tests
pnpm test:unit

# Start UI development server
pnpm ui:dev
```

## Windows demo startup

Run `pnpm dev` (or `pnpm ui:dev`) from the repository root. It builds the contracts, shared UI and fixture, then starts the synthetic Gateway on 127.0.0.1:4300 and Next.js on 127.0.0.1:3000. The launcher waits for both services and stops its own child processes together. Occupied ports fail without stopping unrelated services. `pnpm start` builds a fresh demo production UI before serving it.

This launcher uses synthetic data and enables no real provider or tool effects. It refuses live UI mode; use the separately qualified live Gateway setup for live development. `pnpm build` continues to build every workspace, including backend services.

For a hosted preview, explicitly set `ASI_DEV_HOST` for the UI listener and list exact HTTPS browser origins in `ASI_DEMO_PREVIEW_ORIGINS` (comma separated). The fixture stays on loopback. Cross-site cookies require both `ASI_DEMO_TRUST_PROXY=true` and `ASI_DEMO_CROSS_SITE_COOKIES=true` behind the trusted HTTPS proxy. No cloud-domain wildcard is trusted. See names and defaults in `.env.example`.

## Build status

Start with `docs/v2-build-guide.md` and its task ledgers. Merging local and GitHub work preserves completed-task evidence; pending backend and V2 work still requires its own implementation and qualification. The interactive demo is not evidence that those tasks are complete.
