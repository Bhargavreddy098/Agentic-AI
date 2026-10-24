# ASI Design System — Cursor Warm Parchment

## Product Context

ASI (Artificial Super Intelligence) is a governed digital creation and operations platform. The frontend is a Cursor-style 3-pane IDE (activity rail, tree sidebar, center console, context panel, status bar) that provides an Action Console REPL over all Stage 01–06 backend API routes. The UI must feel like a literary journal crossed with a developer tool — warm parchment editorial aesthetic, not a cold SaaS dashboard.

**Theme:** Light only. Warm parchment atelier lit by embers.

---

## Color Tokens

| Name | Value | Role |
|------|-------|------|
| Parchment | `#f7f7f4` | Page background, primary canvas — warm cream |
| Bone | `#f2f1ed` | Card surfaces, elevated containers, sidebar backgrounds |
| Linen | `#e6e5e0` | Secondary button fills, input backgrounds on dark surfaces |
| Stone | `#cdcdc9` | Hairline borders, dividers, 1px rules |
| Mist | `#a1a19f` | Tertiary helper text, captions |
| Driftwood | `#84847e` | Secondary body text, table content |
| Ash | `#7a7974` | Icon fills, tertiary labels, muted UI text |
| Ink | `#26251e` | Primary text, primary action button bg, nav text — warm near-black, never pure #000 |
| Ember | `#f54e00` | Text-only accent for links, tags, emphasis — NEVER as button bg or large fill |
| Amber | `#c08532` | Warm action button fill (Build, Continue), accent icon strokes |
| Forest | `#34785c` | Green action color for filled buttons, selected nav states |
| Verdant | `#1f8a65` | Green text accent for success links/tags |
| Crimson | `#cf2d56` | Red text accent for error links/tags |

### Semantic Mapping

- **Canvas / page background:** Parchment `#f7f7f4`
- **Sidebar / card surfaces:** Bone `#f2f1ed`
- **Elevated / secondary buttons:** Linen `#e6e5e0`
- **Borders / dividers:** Stone `#cdcdc9` (1px solid)
- **Primary text:** Ink `#26251e`
- **Secondary text:** Driftwood `#84847e`
- **Muted text / icons:** Ash `#7a7974`
- **Links / inline emphasis:** Ember `#f54e00` (text only)
- **Primary CTA button:** Ink `#26251e` bg → Parchment `#f7f7f4` text
- **Secondary CTA button:** Linen `#e6e5e0` bg → Ink `#26251e` text
- **Success / active state:** Forest `#34785c`
- **Error / destructive:** Crimson `#cf2d56`
- **Selection highlight:** `#8BC4F8` (only cool tone, reserved for text selection)

### Hard Rules

- Never use pure white `#ffffff` or pure black `#000000`.
- Ember `#f54e00` is TEXT-ONLY punctuation — never a button background, large surface, or icon fill.
- Shadows must stay warm: `rgba(0,0,0,0.14)` over cream, never blue-tinted.
- No gradients, glows, or color washes. Flat and editorial; depth from hairline borders and soft warm-gray shadows only.

---

## Typography

### Font Families

| Token | Family | Fallback Stack | Role |
|-------|--------|----------------|------|
| `--font-cursorgothic` | CursorGothic | Inter, system-ui, Helvetica Neue | Primary UI, headings, navigation, body |
| `--font-eb-garamond` | EB Garamond | Iowan Old Style, Palatino Linotype, ui-serif, Georgia | Editorial subheadings, prose blocks |
| `--font-berkeleymono` | berkeleyMono | ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas | Code, CLI, metadata, file paths, terminal |
| `--font-system-ui` | system-ui | -apple-system, Helvetica Neue | Micro labels, supplementary UI |

### Type Scale

| Role | Size | Weight | Line Height | Letter Spacing |
|------|------|--------|-------------|----------------|
| Eyebrow | 12px | 400 | 1.63 | normal |
| Body small | 14px | 400 | 1.5 | 0.14px |
| Heading small | 22px | 400 | 1.3 | -0.11px |
| Heading | 26px | 400 | 1.25 | -0.312px |
| Heading large | 36px | 400 | 1.2 | -0.72px |
| Display | 72px | 400 | 1.1 | -2.16px |

### Critical Typography Rules

- **ALL headlines are weight 400.** Never use 600+ for display sizes. The whisper-weight with tight tracking IS the signature.
- Progressively tighter letter-spacing as type grows (see table above).
- OpenType features for CursorGothic: `"ss08", "ss09", "tnum"`.
- EB Garamond OpenType: `"cswh"`.
- Berkeley Mono at 12px for ALL code, file paths, CLI commands, developer metadata.
- system-ui ONLY for micro labels where custom fonts add noise.

---

## Spacing & Shape

- **Base unit:** 4px
- **Density:** Compact

### Spacing Scale

4px, 8px, 12px, 16px, 20px, 24px, 32px, 48px, 56px, 64px

### Border Radius

| Element | Value |
|---------|-------|
| Cards | 4px |
| Tiles | 4px |
| Inputs | 4px |
| Modals | 8px |
| Buttons | 4px |

**NEVER use pill shapes (radius ≥ 999px).** 4px is the workhorse everywhere.

### Shadows

| Name | Value |
|------|-------|
| Subtle | `rgb(235, 234, 229) 0px 0px 0px 2px` |
| XL | `rgba(0,0,0,0.14) 0px 28px 70px 0px, rgba(0,0,0,0.1) 0px 14px 32px 0px` |

### Layout

- Section gap: 64–96px
- Card padding: 24px
- Element gap: 8px

---

## Component Patterns

### Primary Filled Button
Background `#26251e` (Ink), text `#f7f7f4` (Parchment), 4px radius, padding `0.78em 1.35em 0.8em`, CursorGothic 14px weight 400. Highest-contrast action. No gradient, no border. Transition: `color/background 150ms cubic-bezier(0.4, 0, 0.2, 1)`.

### Secondary Filled Button
Background `#e6e5e0` (Linen), text `#26251e` (Ink), 4px radius, same padding/font. Arrow glyph (→) in same color as label.

### Ghost Text Button
Background transparent, text `#26251e` at 60% opacity, no border, no padding (or 6px square for icon). Underline on hover. CursorGothic 13–14px weight 400.

### Terminal / CLI Input
Background transparent or `#f2f1ed`, 1px solid border `color-mix(in oklab, #26251e 10%, transparent)`, 4px radius, padding `10px 12px`, text in berkeleyMono 12px, caret in `#26251e`. Prompt character (`$` or `>`) in `#7a7974` (Ash).

### Product Card / Panel
Background `#f2f1ed` (Bone), 4px radius, 1px border `color-mix(in oklab, #26251e 5%, transparent)`, soft warm elevation shadow, 24px internal padding.

### Mono Metadata Tag
Background transparent, text in berkeleyMono 12px `#7a7974` (Ash), no border, no radius. Used inline for file types, timestamps, IDs.

### Navigation Bar / Activity Rail
Transparent or Bone background, icons in Ash `#7a7974`, active state in Ink `#26251e`. Thin-stroke monoline glyphs, never chromatic.

### Pairing Rule
One filled dark + one filled light in the same action group. Never stack two filled buttons of the same weight.

---

## Surfaces Hierarchy

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 1 | Canvas | `#f7f7f4` | Page background |
| 2 | Card | `#f2f1ed` | Sidebar, panels, cards |
| 3 | Elevated | `#e6e5e0` | Secondary buttons, inputs |
| 4 | Outline | `#cdcdc9` | Hairline borders |

---

## Application to ASI Frontend

The ASI studio workspace maps to this system as:

- **Activity rail** (left 48px): Bone `#f2f1ed` background, Ash icons, Ink active indicator (2px left border)
- **Tree sidebar** (244px): Bone `#f2f1ed` background, section headings in CursorGothic 12px weight 500 Ink, items in 13px Driftwood
- **Center console**: Parchment `#f7f7f4` canvas, terminal input in berkeleyMono 12px with Ash prompt glyph, results in Ink body-sm
- **Context panel** (right 258px): Bone `#f2f1ed`, session status in mono metadata tags
- **Status bar** (bottom 26px): Linen `#e6e5e0` background, Ash text 11px, health dot in Forest/Crimson/Amber
- **All borders**: 1px solid Stone `#cdcdc9`, never thicker
- **All radii**: 4px throughout, no exceptions
