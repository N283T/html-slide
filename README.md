# html-slide

A dependency-free HTML/CSS slide framework: fixed 1920×1080 canvas,
layout templates × swappable themes, a presenter console, and an
in-browser **edit mode** that writes your tweaks back to the HTML source.

Slides are plain `<section class="slide">` elements in one HTML file —
readable by humans, editable by Claude, versioned by git. No build step;
the only tooling is a small Node dev server.

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

## Edit mode

Press `e` while the dev server is running:

- **Click** an element → a panel appears with sliders for font-size,
  gap, margins and padding. Values are applied as inline styles.
- **Double-click** text → edit it in place. `Esc` or click away to finish.
- **Save (⌘S)** → the active slide's markup is written back into the
  source file. Live reload is suppressed for your own save, so you keep
  your place; other connected browsers pick the change up.
- **Revert** reloads the page, discarding unsaved changes.

Because adjustments land as inline styles in the source, a human tweak
and a Claude edit are the same kind of change — no hidden state.

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
core/      runtime: deck.js, editor, overview, presenter, authoring, deck.css
layouts/   the slide-level design system (structure only)
themes/    color/type token sets
template/  starter deck copied by `html-slide new`
cli/       dev server (static + SSE reload + save endpoint) and scaffolder
```
