# Extractable Components

## Layout Components

### ActivityRail
- Source: `components/shell/activity-rail.tsx`
- Category: layout
- Description: Left icon rail (48px) with 5 navigation buttons (Overview, Projects, Approvals, Providers, Usage) using lucide-react icons
- Extractable props: activeItem (string, default: "overview")
- Hardcoded: Icon components (Activity, Folder, ShieldCheck, SlidersHorizontal, Workflow), item labels, w-12 width, bg-accent active class

### TreeSidebar
- Source: `components/shell/tree-sidebar.tsx`
- Category: layout
- Description: Left sidebar (244px) showing surface-scoped list sections and project-scoped records (Artifacts, Conversations, Budgets, Grants) with ProjectPicker
- Extractable props: activeSurface (string, default: "overview"), csrfToken (string|null), projectId (string|null)
- Hardcoded: SURFACES map, section headings ("Workspaces", "Capabilities", etc.), "Project records" heading, ItemList usage, change project button text

### StatusBar
- Source: `components/shell/status-bar.tsx`
- Category: layout
- Description: Bottom status bar (26px) showing backend health dot, manifest coverage count, and frontend reachability count
- Extractable props: none (self-contained, reads from manifest and fetches /health/ready)
- Hardcoded: Health check URL "/health/ready", dot colors (bg-green-500/bg-red-500/bg-yellow-500), format strings, h-6 height

### StudioLayout
- Source: `app/(studio)/layout.tsx`
- Category: layout
- Description: Root layout wrapper providing SessionProvider context and studio-root div
- Extractable props: none
- Hardcoded: "studio-root" className, SessionProvider wrapper

## Basic Components

### ConsolePane
- Source: `components/console/console-pane.tsx`
- Category: basic
- Description: Center REPL console with command input, results display, file upload controls, and artifact download buttons
- Extractable props: none (fully self-contained via useSession)
- Hardcoded: Help text, Entry types (input/note/result/err), summarize function, file input label, upload button text, command placeholder

### ItemList
- Source: `components/stages/item-list.tsx`
- Category: basic
- Description: Paginated list component for rendering API records with Previous/Next/Refresh controls
- Extractable props: method (string), path (string), pathParams (Record<string,string>), csrfToken (string|null), label (string), render (function)
- Hardcoded: Pagination regex for pageable routes, limit "50", event name "asi:records-changed", button labels ("Previous", "Next", "Refresh")

</ARG>