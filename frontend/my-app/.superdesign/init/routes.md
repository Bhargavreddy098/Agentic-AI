# Routes

## File-based routing (Next.js 16 App Router)

| URL Path | Component File | Layout |
|----------|---------------|--------|
| `/` | `app/page.tsx` | Root layout → redirects to `/studio` |
| `/studio` | `app/(studio)/studio/page.tsx` | `(studio)/layout.tsx` (SessionProvider) |
| `/connect` | `app/(studio)/connect/page.tsx` | `(studio)/layout.tsx` (SessionProvider) |

### `/` (Root)
Entry: `app/page.tsx`
Server component that immediately redirects to `/studio`.

### `/studio` (Main Workspace)
Entry: `app/(studio)/studio/page.tsx`
The primary 3-pane Cursor-style IDE. Renders ActivityRail + TreeSidebar + ConsolePane + context panel + StatusBar inside a SessionProvider. Requires session connection; shows link to `/connect` when disconnected.

### `/connect` (Session Bootstrap)
Entry: `app/(studio)/connect/page.tsx`
Paste-based session bootstrap form. User pastes challenge + nonce from launcher, calls POST /session/bootstrap, then redirects to /studio on success.

</ARG>