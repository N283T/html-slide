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
| `Home` / `End` | first / last slide |

A floating toolbar (move the mouse to reveal it) mirrors all of this,
adds a **＋ Slide** button and a live **theme switcher**, and stays out
of captures and prints.

## Edit mode

Press `e` while the dev server is running:

- **Click** an element → a panel appears with sliders for font-size,
  gap, width (for media), margins and padding, plus buttons to
  duplicate, delete and reorder the element among its siblings.
- **Drag** a selected element → nudges its margins, scale-aware.
- **Double-click** text → edit it in place. `Esc` or click away to finish.
- **⌘Z / ⇧⌘Z** → undo / redo, one step per gesture.
- **Save (⌘S)** → the active slide's markup is written back into the
  source file. Live reload is suppressed for your own save, so you keep
  your place; other connected browsers pick the change up.
- **Revert** reloads the page, discarding unsaved changes.

Because adjustments land as inline styles in the source, a human tweak
and a Claude edit are the same kind of change — no hidden state.

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
