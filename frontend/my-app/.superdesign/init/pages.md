# Page Dependency Trees

## /studio (Main Workspace)
Entry: `app/(studio)/studio/page.tsx`
Dependencies:
- `components/shell/activity-rail.tsx`
  - `lucide-react` (Activity, Folder, ShieldCheck, SlidersHorizontal, Workflow icons)
- `components/shell/tree-sidebar.tsx`
  - `components/stages/item-list.tsx`
    - `lib/api/client.ts`
      - `lib/api/types.ts`
      - `lib/api/requirements.ts`
      - `lib/api/envelope.ts`
      - `lib/api/problem.ts`
      - `lib/api/log.ts`
    - `lib/api/manifest.ts`
      - `lib/api/types.ts`
      - `docs/backend/api/frontend-stage01-06.manifest.json`
- `components/shell/status-bar.tsx`
  - `lib/api/manifest.ts`
  - `lib/api/status.ts`
    - `lib/api/manifest.ts`
    - `components/console/grammar.ts`
- `components/console/console-pane.tsx`
  - `components/console/parse.ts`
    - `components/console/grammar.ts`
    - `lib/api/manifest.ts`
  - `components/console/bodies.ts`
  - `components/console/query.ts`
  - `lib/api/upload.ts`
    - `lib/api/manifest.ts`
    - `lib/api/client.ts`
  - `lib/api/client.ts`
  - `lib/api/requirements.ts`
  - `lib/session/SessionProvider.tsx`
    - `lib/session/session-store.ts`
- `lib/session/SessionProvider.tsx`

## /connect (Session Bootstrap)
Entry: `app/(studio)/connect/page.tsx`
Dependencies:
- `lib/session/SessionProvider.tsx`
  - `lib/session/session-store.ts`
- `next/navigation` (useRouter)

</ARG>