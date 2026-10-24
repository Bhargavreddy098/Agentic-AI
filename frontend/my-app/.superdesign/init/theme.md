# Theme & Design Tokens

## Part 1 — Compact Token Summary

**NOTE:** The current globals.css uses a dark theme (#141414 bg). This is being replaced with a Cursor-inspired warm parchment light theme per the user's design reference. The raw current tokens are in Part 2 below for reference.

### Target Design System (Cursor Warm Parchment)

**Colors:**
- Canvas: `#f7f7f4` (Parchment)
- Card/Sidebar: `#f2f1ed` (Bone)
- Elevated: `#e6e5e0` (Linen)
- Border: `#cdcdc9` (Stone)
- Muted text: `#a1a19f` (Mist), `#84847e` (Driftwood), `#7a7974` (Ash)
- Primary text: `#26251e` (Ink)
- Accent text only: `#f54e00` (Ember) — NEVER as background
- Action fills: `#c08532` (Amber), `#34785c` (Forest)
- Error text: `#cf2d56` (Crimson)
- Selection: `#8BC4F8`

**Fonts:**
- Primary UI: Inter/system-ui (CursorGothic substitute), weight 400 always for headings
- Editorial: Georgia/serif (EB Garamond substitute)
- Code/terminal: ui-monospace/SFMono/Menlo (berkeleyMono substitute), 12px

**Type scale:** 11px, 12px, 13px, 14px, 22px, 26px, 36px
**Spacing:** 4px base unit (4, 8, 12, 16, 20, 24, 32, 48)
**Radius:** 4px everywhere (cards, inputs, buttons, tiles) — NO pills
**Shadows:** warm rgba(0,0,0,0.14) only, never blue-tinted

### Current Tokens (being replaced)
- --background: #141414
- --foreground: #e5e5e5
- --card: #191919
- --primary: #e5e5e5
- --muted: #1c1c1c
- --accent: #303030
- --border: #292929
- --radius: 0.25rem (4px)

---

## Part 2 — Raw Source Dumps

### globals.css (current, being replaced)

```css
@import "tailwindcss";
@custom-variant dark (&:is(.dark *));
@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
}
:root {
  color-scheme: dark;
  --background: #141414; --foreground: #e5e5e5;
  --card: #191919; --card-foreground: #e5e5e5;
  --popover: #242424; --popover-foreground: #e5e5e5;
  --primary: #e5e5e5; --primary-foreground: #161616;
  --secondary: #252525; --secondary-foreground: #dedede;
  --muted: #1c1c1c; --muted-foreground: #a3a3a3;
  --accent: #303030; --accent-foreground: #ffffff;
  --destructive: #f18c8c; --border: #292929; --input: #3d3d3d;
  --ring: #a3a3a3; --radius: .25rem;
  --sidebar: #181818; --sidebar-foreground: #dedede;
  --sidebar-primary: #eeeeee; --sidebar-primary-foreground: #161616;
  --sidebar-accent: #292929; --sidebar-accent-foreground: #ffffff;
  --sidebar-border: #292929; --sidebar-ring: #a3a3a3;
}
```

### next.config.ts (Tailwind via Turbopack)

```ts
import type { NextConfig } from "next";
import { resolveApiOrigin } from "./lib/api/config";
export { resolveApiOrigin };
const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    const origin = resolveApiOrigin(process.env);
    return [
      { source: '/api/v1/:path*', destination: `${origin}/api/v1/:path*` },
      { source: '/health/:path*', destination: `${origin}/health/:path*` },
    ];
  },
  experimental: { cpus: 1, agentFeedback: false },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};
export default nextConfig;
```

No tailwind.config.ts — this project uses Tailwind v4 with CSS-based configuration via `@theme` blocks in globals.css.
