# html-slide

A dependency-free HTML/CSS slide framework: fixed 1920×1080 canvas,
layout templates × swappable themes, a presenter console, built-in
SVG charts, PDF/PNG export, and an in-browser **editing suite** —
text editing, spacing sliders, drag-to-nudge, undo/redo, plus a slide
manager with drag-reorder and a layout gallery — all of it writing
straight back to the HTML source.

Slides are plain `<section class="slide">` elements in one HTML file —
readable by humans, editable by Claude, versioned by git. No build step,
no npm dependencies; the only tooling is a small Node dev server.

## Quick start

```bash
# scaffold a self-contained deck (vendors the framework into assets/hs/)
node cli/html-slide.js new ~/talks/my-talk --theme paper

# serve it with live reload + edit mode
node cli/html-slide.js dev ~/talks/my-talk
# -> http://127.0.0.1:8000/
```

To try the framework itself, serve this repository and open the template:

```bash
node cli/html-slide.js dev .
# -> http://127.0.0.1:8000/template/
```

## Keys

| Key | Action |
|---|---|
| `→` `↓` `Space` | next (steps through `data-fragment` reveals first) |
| `←` `↑` | previous |
| `o` | overview grid (click a slide to jump) |
| `t` | open the presenter console (second screen) |
| `f` | fullscreen |
| `e` | **edit mode** (needs the dev server) |
| `p` | pen — draw on the slide (`c` clears; strokes vanish on slide change) |
| `Home` / `End` | first / last slide |

A floating toolbar (move the mouse to reveal it) mirrors all of this,
adds a **＋ Slide** button and a live **theme switcher**, and stays out
of captures and prints.

## Edit mode

**Edit is the default whenever the dev server is running** — open the
deck and start clicking. `▶ Present` (or `e`) switches to presentation
mode and goes fullscreen; `?present=1` in the URL, a static host, or an
export keeps the deck presentational. A docked inspector sits on the
right:

- **Click** an element → inspect it; the **breadcrumb** picks any
  ancestor. Sliders cover font-size, line-height, gap, width (media),
  margins and padding — each with a ✕ that falls back to the
  stylesheet. Text and background colors offer theme-token swatches
  (saved as `var(--hs-*)`, so they follow theme switches) plus a free
  picker. Flex containers get align-items / justify-content segments
  and flex children align-self, labelled by the container's axis.
  Buttons duplicate, delete and reorder the element; chips toggle the
  utility classes (`.em`, `.muted`, `.small`, `.mono`).
- **Drag** a selected element, or press **arrow keys** (Shift = 10px),
  to nudge its margins — canvas-scale aware.
- **Double-click** text → edit it in place. `Esc` or click away to finish.
- **⌘Z / ⇧⌘Z** → undo / redo, one step per gesture.
- **Autosave** (on by default) writes the slide back to the source
  ~1s after you stop tweaking, and flushes when you change slides;
  toggle it off for explicit **Save now / ⌘S**. Live reload is
  suppressed for your own saves, so you keep your place.

Because adjustments land as inline styles and classes in the source, a
human tweak and a Claude edit are the same kind of change — no hidden
state.

## Slide manager

With the dev server running, the overview (`o`) is also a manager:

- **Drag** a thumbnail onto another to reorder the deck.
- **＋** (on a thumbnail, or the trailing tile) inserts a new slide
  from the **layout gallery** of starter snippets.
- **⧉ / ✕** duplicate / delete a slide.

Every operation edits the HTML source directly — a slide's label
comment (`<!-- 3 · results -->`) moves, copies and dies with it.

## Charts

Bar, line and donut charts render as theme-aware SVG from inline JSON —
no chart library:

```html
<div data-chart='{"type": "bar", "unit": "%",
  "labels": ["Q1", "Q2", "Q3", "Q4"],
  "series": [{"name": "accuracy", "data": [61, 68, 74, 83]}],
  "highlight": 3}'></div>
```

Options: `max`, `legend`, `values` (bar labels), `highlight` (dim all
but one bar), `dashed` per line series, `center`/`centerLabel` (donut).
Large data can go in a `<script type="application/json">` child instead
of the attribute. Colors come from the active theme's tokens, so charts
restyle themselves when the theme changes.

## Export

```bash
html-slide pdf my-talk --out my-talk.pdf        # one page per slide
html-slide capture my-talk --out slide-captures # slide-NN.png, 1920×1080
```

Both use whatever Chrome/Chromium/Edge/Brave is already installed
(`CHROME_PATH` overrides discovery). Fragments are shown, badges and
toolbar hidden.

## Layouts

One class per slide picks its structure; see `template/index.html` for a
working example of each.

| Class | Use for |
|---|---|
| `layout-title` | cover slide (`h1`, `.subtitle`, `.meta`) |
| `layout-section` | chapter dividers |
| `layout-std` | heading + free-form body |
| `layout-two-col` | text/figure pairs (`.col`, `.is-narrow`, `.is-wide`) |
| `layout-figure` | figure-first slides (`figure` + `.aside`) |
| `layout-compare` | before/after, ours/theirs (`.panel`, `.is-accent`, `.vs`) |
| `layout-cards` | 2–3 parallel points (`.card`, `.is-two-up`) |
| `layout-quote` | one quotation (`blockquote`, `.attribution`) |
| `layout-end` | closing slide |

Components usable anywhere: `.kicker`, `.card`, `.callout`, `.stat`,
`.tag`, `.steps`, `.em`, `.muted`, `.small`, `.foot`, plus styled
tables and `pre`/`code`.

Speaker notes go in `<aside class="notes">` inside a slide; they render
only in the presenter console. `data-page-number="off"` hides a slide's
number (title slides hide it by default).

## Themes

Swap one `<link>` to restyle the whole deck. A theme is ~30 CSS custom
properties (`--hs-bg`, `--hs-accent`, fonts, radii…); layouts never hard-code
color or type, so any layout works under any theme.

- `paper` — warm light, editorial serif headings
- `aurora` — dark, cold gradient accents
- `lab` — cool light, high-contrast, data-first

To make your own, copy a theme file and change the tokens.

## Authoring guardrails

- Content that spills off the 1920×1080 canvas gets a red
  **overflow** badge naming the offending element.
- The same badge flags a full-width space (U+3000) inside a mono
  span and full-width parens around Latin text — both invisible in
  the source and ugly on screen.
- `data-fit` on an element shrinks its font-size until the content
  fits its box (PowerPoint's "shrink on overflow", but explicit).
- CSS in `layouts/` never exceeds two classes of specificity, so a
  single class in your deck always wins an override.

## Repository layout

```
core/      runtime: deck, editor, overview/manager, toolbar, charts,
           presenter, authoring aids, snippets, deck.css
layouts/   the slide-level design system (structure only)
themes/    color/type token sets
template/  starter deck copied by `html-slide new`
cli/       dev server (static + SSE reload + save/ops endpoints),
           scaffolder, PDF/PNG exporter
```
