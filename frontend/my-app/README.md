# ASI console

Next.js frontend that streams [OpenUI Lang](https://www.openui.com) from a model and renders it with [beUI](https://beui.dev) components.

## Setup

```bash
npm install
Copy-Item .env.example .env.local
```

Fill in either the `OPENAI_COMPATIBLE_*` variables (used when a base URL is set) or `OPENAI_API_KEY` plus `OPENAI_MODEL`. The chat route returns a `503` with a configuration message when no provider is available.

## Component library

`lib/beui-library.tsx` registers the components the model is allowed to emit:

- `Stack`, `Text`, `Heading` for layout and prose
- `Button` from `@beui/button-base`
- `Badge` from `@beui/animated-badge`
- `Stat` from `@beui/animated-number`

The registry no longer exposes a plain `@beui/button` item; `@beui/button-base` installs `components/motion/button/base.tsx`.

Regenerate the system-prompt spec whenever the library changes:

```bash
npm run generate:library
```

This writes `lib/generated/beui-library.spec.json`. `app/api/chat/route.ts` passes that spec to `generateSystemPrompt` and streams the model response back over SSE. `components/chat.tsx` feeds the accumulated text to `<Renderer />`.

## Layout

The console uses the shadcn dashboard shell (`SidebarProvider`, `SidebarInset`, and `SiteHeader`). The chat is the only section; the starter dashboard's cards, chart, and data table are intentionally not installed.

## Commands

```bash
npm run dev          # start the Next.js app
npm run build        # production build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run generate:library
```

## Control plane redesign (23 Oct 2026)

The main screen is now a responsive ASI workspace with overview, projects, approvals, provider/model registry, usage, native session connection, and the retained chat preview. Existing shadcn/Base UI buttons are reused; no dependencies were added.

Start the backend from the repository root with its existing protected runtime configuration and `ASI_PORT=3100`. Start this frontend with `npm run dev -- --hostname 127.0.0.1 --port 3200`. The Next rewrites forward only `/api/v1/*` and `/health/*` to `127.0.0.1:3100`. Backend Host, Origin, session, CSRF and idempotency enforcement remain active. Neither database credentials nor provider keys are sent to the browser.

Connect using `npm run session:challenge` from the root, and enter the resulting short-lived challenge/client nonce from the ACL-protected file into Connection. Values stay in component memory and are cleared after success. Existing backend origin policy must allow `http://127.0.0.1:3200`; there is no automatic policy relaxation.

Project creation sends a fresh idempotency key and session CSRF token. Expanding a project allows reads of its artifacts, conversations, budgets and grants. Approvals and provider records are read-only in this slice. Record counts describe the loaded page, not global totals. Roadmap qualification is explicitly dated documentary evidence, separate from live health. Later execution controls are not enabled.

The retained chat preview has its own existing `/api/chat` provider integration; it is not a Stage 07 execution interface. No paid inference was invoked during this redesign. Complete provider administration, approval decisions, uploads, pagination and conversation editing are not claimed by the read views.

Checks: frontend TypeScript and ESLint; real bootstrap, eight protected reads, and session revocation through the Next proxy. Visual evidence is in root `.taste-skill/before` and `.taste-skill/after`. Production webpack build is the tested alternative to the locally failing Turbopack build; Google Fonts access is needed during build.
