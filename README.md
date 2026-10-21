# Agentic-AI

ASI is a local-first Windows agent workspace for working with model providers, tasks, memory and inspectable results. The current codebase contains an Express backend, TypeScript domain modules and a Next.js demo UI. Independent microservices are the next proposed architecture, not an implemented deployment.

## Product scope and status

- The target workflow is conversation → bounded plan → authorized task → artifact → verification, with honest progress and restart/recovery behavior.
- The frontend has seven sections: Chat, Models & Providers, Skills, Tools & Connections, Memory, Activity & Tasks, Settings.
- No user RBAC is part of the product target. Agent capabilities, action approvals, privacy rules and scoped data access remain required.
- The default UI launcher uses synthetic data. Production authentication, durable UI composition, real provider execution, pgvector qualification and executable isolation still have unresolved prerequisites. A working demo does not establish a complete agent system.

## Documentation

Start with the [documentation index](docs/README.md). The current engineering direction is the [microservices build plan](docs/superpowers/plans/2026-10-21-asi-microservices-build.md), supported by its [architecture proposal](docs/superpowers/plans/2026-10-21-asi-microservices-migration.md).

## Getting Started

The Express backend and its existing domain packages are consolidated under [`backend/`](backend/README.md). See that guide for PostgreSQL/pgvector configuration, build/start commands and current capability limitations. The UI demo command below remains an explicitly synthetic preview.

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

Use the current microservices plan for proposed service placement and the original/V2 task ledgers for feature requirements and recorded qualification. The large V2 guide retains historical source snapshots; it is reference material, not a second current implementation roadmap. See the [backend migration evidence](docs/release-evidence/express-backend-migration.md) for executed checks and limitations.
