# Handoff: MindGraph Notes — Petrol Redesign (App)

## Overview
Redesign of the **MindGraph Notes desktop app** in the agreed "Ruhig & verdichtet" direction (calm, de-cluttered, border-led), recolored to a **Petrol** accent, plus a **refreshed logo**. Covers **5 screens** — Dashboard, Editor/Notiz, Brain/Wissensgraph, Posteingang, Einstellungen · Module & Plugins — in **Light + Dark**.

The goal is *not* a visual overhaul of the app's structure. It is: **(a) switch the accent to Petrol, (b) apply the specific "quiet" layout changes per screen (mainly the Dashboard), (c) swap the logo.** Everything else keeps the app's existing structure, components and density.

## About the design files
The files in this bundle are **design references created in HTML** (OpenMagic "Design Component" prototypes). They show the intended look & behavior — they are **not production code to copy**. 

Implement them in the **real app's existing environment**: the **Electron + React + TypeScript renderer** under `app/src/renderer/`, using its established components and the **CSS-variable theming already defined in `app/src/renderer/styles/index.css`**. Do **not** ship the HTML.

> ⚠️ The `.dc.html` files do **not** render standalone (they need the design runtime). Use them to **read the exact inline styles/values**, and use the **screenshots** (ask the designer to add them) for visual reference. The README below is self-sufficient.

> The production codebase is actively being worked on — branch/coordinate accordingly.

## Fidelity
**High-fidelity.** Final colors, spacing, type sizes and interactions. Recreate pixel-close using the app's existing widgets (FileTree, CodeMirror editor, React-Flow graph, mail panel, settings) and the CSS-var system. Keep the app's information density.

---

## Design tokens — the core change

The app already themes through CSS variables in `styles/index.css`. The redesign is primarily **set the accent to Petrol and derive the rest**. Change the accent tokens in both theme blocks:

### Light (`:root, [data-theme="light"]`)
| Token | New value | Note |
|---|---|---|
| `--accent-color` | `#10696b` | Petrol (was neutral ink `#111111`) |
| `--accent-hover` | `#0d5a5c` | |
| `--accent-subtle` | `rgba(16,105,107,0.10)` | ≈ `#e7f1f0` on white; used for tints/active rows |

Keep light bases as-is: `--bg-primary #ffffff`, `--bg-chrome #f4f5f7` (cool-tinted sidebar/panels), `--text-primary #1a1a1a`, `--text-secondary #6b7280`, `--text-muted #9ca3af`, `--border-color ≈#e6e7e9`, `--border-subtle ≈#eef0f2`.

### Dark (`[data-theme="dark"]`)
| Token | New value | Note |
|---|---|---|
| `--accent-color` | `#3cbfb3` | **Brighter** Petrol/teal for contrast on black — do NOT reuse the light `#10696b` |
| `--accent-hover` | `#5fd0c4` | |
| `--accent-subtle` | `rgba(60,191,179,0.15)` | |

Keep dark bases: `--bg-primary #0d0d0d` (content `#111`), `--bg-chrome #18181b`, `--bg-secondary/tertiary` as existing, `--text-primary #f0f0f0`, `--text-secondary #a0a0a0`, `--text-muted #666`, `--border-color #2a2a2a`.

### ⚠️ New token needed: text-on-accent
White text on the **dark** accent (`#3cbfb3`) fails contrast. Add a token and use it for text/icons that sit **on** an accent fill (primary buttons, active nav pill):
- `--accent-on: #ffffff` (light) · `#06302e` (dark)
Toggle knobs stay `#fff` in both themes.

### Categories (semantic — unchanged, listed for completeness)
Problem `#dc2626` / dark `#ff6b6b` · Lösung `#15803d` / `#34d399` · Info `#256fd1` / `#6aa9ff`. These are functional wayfinding — keep them distinct from the (now warm-ish teal) accent; they never change with the accent.

### Other
- Radii: cards 12–14px, inner 8–11px, pills 9999px (map to existing `--radius-*`).
- Type: **keep the app's system stack** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`, base 13px. (No serif — that lives only on the marketing site.)
- Reusable **toggle** spec: pill 38×22, radius 9999; knob 18×18 circle `#fff`; ON = bg `--accent-color`, knob right (`left:18px`); OFF = bg `--border-color`, knob left (`left:2px`).

---

## Screens / Views

### 1. Dashboard  *(most changed — this is the heart of the redesign)*
**Purpose:** daily "what matters today" overview.
**Layout:** content padding 26–30px; vertical stack, gap 16px. Header row (title + date left; "Aktualisieren" ghost button right).
**Key changes from current:**
- **Kill the big tinted card headers and the red left-border bar.** Cards are neutral: `1px solid --border-color`, radius 14, no colored fills.
- **"Fokus heute"** (was "Heute im Fokus"): a compact single strip, not a large empty box. Left: 36px hollow circle (`1.5px --border-color` ring, muted check). Middle: small-caps label `--text-muted` + one line `--text-secondary`. Right: muted "0 fällig". When there IS focus content, list items with a category dot.
- **"Relevante Notizen":** score chip = neutral (`bg --bg-secondary`, `--text-secondary`), **not** a red circle. Title = display title (see below) bold 14. Meta line = category dot + "Problem · kürzlich aktiv · Notes" muted 12. Model badge (`qwen3.5:4b`) de-emphasized: muted 11px top-right, not a pill with count.
- **"Aufgaben"** empty → collapse to a single row (label + "Nichts fällig" muted). Do not render a large empty card.
- **"Gehirn · Tagesgedächtnis":** slim card — label + status dot (amber `#c98a2a`/`#e0a94f`) + "Heute noch nicht verdichtet" + right-aligned **"Verdichten"** primary button (bg `--accent-color`, text `--accent-on`, radius 8, padding 6×13).
- **"Bestand":** a quiet horizontal band (`bg --bg-secondary`, `1px --border-subtle`, radius 14) of 5–6 stat cells split by `--border-subtle`; number 22px/600 `--text-primary`, **0-values `--text-muted`**, label 10.5px muted.
- **Display titles everywhere:** show the note's frontmatter/display title (e.g. "Optimierung vs. Transformation") in the tree, tabs and cards — **not** the raw timestamp filename (`202606222240 - …`). Keep the raw id as metadata only.

### 2. Editor / Notiz  (+ Karteikarten panel)
**Layout:** main note column (flex:1) + **Karteikarten panel 322px** on the right (`1px --border-color` divider).
- **Note toolbar** (11px pad 26px): breadcrumb `Notes / <title>` (`--text-secondary`); right: "PDF" ghost; **segmented Schreiben/Lesen** toggle (bg `--bg-secondary`, radius 8; active segment bg `--accent-color`, text `--accent-on`).
- **Note body** (pad 28×34): H1 27px/700; hairline `--border-subtle`; paragraphs 15px/1.7 `--text-secondary` with bold `--text-primary`; **callout** = `border-left:3px solid --accent-color`, bg `--accent-subtle`, radius `0 10 10 0`, pad 13×16. Diagram = placeholder box (`1px dashed --border-color`) in the mock; real app renders the actual embed.
- **Footer:** "758 Wörter · 5.572 Zeichen · ~4 min" muted 11px, top border.
- **Karteikarten panel:** header "Karteikarten 3" + `＋`; **tabs** Alle/Fällig/Neu/Statistik (active = `--accent-color` text + 2px underline); card rows (`1px --border-color`, radius 11): question 13px + tag muted + due badge (Fällig = accent on `--accent-subtle`; scheduled = muted on `--bg-secondary`; Neu = green on green-subtle). Bottom: **"▶ N fällige Karte(n) lernen"** full-width primary (bg `--accent-color`, text `--accent-on`, radius 10).

### 3. Brain / Wissensgraph  (+ Smart Connections)
**Layout:** graph canvas (flex:1) + **Smart Connections panel 300px** right.
- **Control bar:** "← Freier Graph" ghost; centered month nav `‹  [accent 13px chip] Juni 2026  ›`; "Rückblick" ghost.
- **Graph:** node chips = `bg --bg-elevated/panel`, `1px --border-color`, radius 10, shadow `0 4px 12px rgba(0,0,0,.07)`, with a leading **category dot**; date-cluster cards = `1.5px solid color-mix(--accent-color 42%, transparent)` border, radius 12, title 13/700 + "N Notizen" muted. **Edges = calm curves**, `stroke:--border-color`, width 1.4 (no crossing tangles; converge on the cluster). Zoom controls bottom-left (28px squares).
- **Smart Connections panel:** header dot(accent) + "Smart Connections" + ✕; "Modell" select `bge-m3:latest`; "Aktuelle Notiz" card (bg `--bg-secondary`); "Ähnliche Notizen" with filter chips (Keyword/Link/#Tags) and a match row: title + **% in accent** + full-width **accent progress bar**.

### 4. Posteingang  (Smart Email)
**Layout:** mail **list 362px** + reading pane (flex:1).
- **List header:** "Posteingang" 15/700 + **"＋ Neu"** primary (accent). Search field (`1px --border-color`, search glyph) + **"Nur relevante"** toggle (15px accent check square).
- **Email rows:** 32px avatar circle (letter; the relevant/selected one uses `bg --accent-color` + `--accent-on`, others `bg --bg-secondary`), sender bold + time muted, subject, preview muted, optional **"Antwort erwartet"** badge (accent text, `1px color-mix(--accent 35%)` border), unread dot = accent. **Selected row bg = `--accent-subtle`.**
- **Reading pane:** subject 18/700; from row (avatar + address muted); **"Warum relevant · hoch"** box = `1px color-mix(--accent 30%)`, bg `--accent-subtle`, radius 11 — accent dot + uppercase accent label + reasons in `--text-secondary`; body 14/1.7; footer buttons: **"Antwort entwerfen"** primary (accent) + "Als Notiz speichern" ghost.

### 5. Einstellungen · Module & Plugins
**Layout:** page title "Einstellungen" 24/700 + "Module & Plugins" subtitle; two columns (Module | Plugins), gap 30.
- **Module column:** small-caps "MODULE"; rows (pad 13, `--border-subtle` divider): **color-coded 30px icon square** (`bg color-mix(color 15%,transparent)`, text = that color) + name 13.5/600 + desc muted + **toggle** (ON = accent). Icon colors: Brain=accent, Relevanz-Radar=info blue, Smart Email=amber, Karteikarten=green, Terminal=muted (OFF).
- **Plugins column:** small-caps "PLUGINS" + "3 Updates" pill (accent on `--accent-subtle`); "Katalog durchsuchen…" search; installed plugin cards (`1px --border-color`, radius 12): name + **"✓ signiert"** badge (accent on `--accent-subtle`) + desc + toggle. Antares (ON), edoobox (ON), reMarkable (OFF).

---

## Interactions & behavior
- **Theme:** light/dark via existing `data-theme` on the root. All colors come from the tokens above — no per-component dark overrides beyond what exists.
- **Navigation:** top tabs (Editor/Split/Brain/Dashboard) + mail/settings icons switch views — the app already routes these; the mock's switching is only to preview.
- **Empty states collapse** (Dashboard) — render a one-line row, never a large empty card.
- **Hover/active:** buttons darken to `--accent-hover`; active nav pill = filled accent; active list row = `--accent-subtle`.
- Toggles animate the knob (existing transition ~0.15s) between the ON/OFF positions in the spec.

## State / data
No new state. Uses existing stores, routing, theme, and data. The prototype's screen-switcher and light/dark button are preview scaffolding only — the real app already has equivalents.

## Assets
- **New logo** (replaces `docs/icon.png`, the 9-node glowing-orange mark): a **4-node graph tile** — rounded-square (radius 8 on a 32-unit viewBox) filled with `--accent-color`; inside, a white node graph = center hub (circle r3 @16,16) + 3 satellites (@16,7.5 · @8,23 · @24,23), joined by 1.5px white lines (hub→each satellite + bottom edge 8,23→24,23); satellite circles r2.3. It uses the accent as fill, so it recolors per theme/release automatically. Exact SVG is in `MindGraph Logo.dc.html` (direction **1a Tile**). Export raster app-icon sizes (256/512/1024) for packaging; use inline SVG next to the wordmark in-app.
- No other new assets.

## Files in this bundle
- **`App Redesign.dc.html`** — all 5 screens, Light + Dark, navigable shell. **Primary reference — read the inline styles for exact px/hex values.**
- **`Dashboard Redesign.dc.html`** — the agreed Dashboard direction ("1b Ruhig & verdichtet") next to the current-state screenshot (1a), useful to see before/after.
- **`MindGraph Logo.dc.html`** — logo directions (1a = chosen) + the "colour-per-release" system.
- In the project (not bundled, references marketing site): `MindGraph Website.dc.html` — the matching landing page, already on Petrol + new logo.

## Where to implement (pointers)
- Tokens: `app/src/renderer/styles/index.css` (the `:root/[data-theme]` blocks).
- Dashboard: the dashboard widget/components in `app/src/renderer/components/` (cards: Fokus, Relevante Notizen, Gehirn, Aufgaben, Bestand).
- Editor + Karteikarten, Brain/graph (React Flow), Mail panel, Settings "Module & Plugins": their respective renderer components.
- Logo: the app icon asset(s) + the in-app wordmark/logo component.
