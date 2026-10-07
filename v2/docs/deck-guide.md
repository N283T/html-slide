# Working on this deck

This is an [html-slide](https://github.com/N283T/html-slide) deck. The whole
presentation is `index.html`: every slide is a top-level
`<section class="slide">` inside `<main id="deck">`. There is no build step —
edit the HTML and the open browser updates that one slide in place.

## The loop

```bash
hs check .            # layout problems + open @fix notes, with file:line
hs shot . --slide 7   # render slide 7 to shots/slide-07.png — look at it
```

1. Run `hs check .` first. It lists anything that overflows the canvas, text
   that is clipped, too small or too low-contrast, broken images, and every
   open review note.
2. A review note is an HTML comment the author left **directly above the
   element it is about**:

   ```html
   <!-- @fix: legend overlaps the plot; move it top-right -->
   <hs-chart type="line">…</hs-chart>
   ```

   Fix what it asks, then **delete the comment**. Deleting it is how a note
   is marked resolved.
3. After any visual change, `hs shot . --slide N` and read the PNG. Do not
   claim a slide looks right without looking at it.
4. Finish with `hs check .` reporting no errors.

`hs check . --json` gives the same data for scripting.

## Rules

- The canvas is fixed at 1920×1080. Body text is 32px; do not go below 20px
  for anything the audience should read.
- One idea per slide. The `<h2>` states the claim, not the topic.
- Never hard-code colours or fonts. Use theme tokens: `var(--accent)`,
  `var(--muted)`, `var(--surface)`, `var(--heading)`, `var(--bg)`,
  `var(--fg)`, `var(--line)`, `var(--accent-2)`, `var(--accent-soft)`.
- Position things with layout (`.cols`, `.grow`, `gap`) rather than margins.
  Use a `.free` element only for things that genuinely sit on top of the
  layout: an arrow or a label on a figure.
- Classes starting with `hs-` and attributes starting with `data-hs-` are
  runtime state. Never write them into the source.
- Images go in `assets/` and are referenced relatively.

## Slide anatomy

```html
<section class="slide">
  <header>
    <p class="kicker">Results</p>
    <h2>The proposed method is 3.4× faster</h2>
  </header>
  <p>Body copy.</p>
  <footer><span>Source: …</span></footer>
  <aside class="notes">Speaker notes — presenter view only.</aside>
</section>
```

A slide is a flex column. Add `.grow` to the one child that should take the
remaining height (a chart, a `.cols` grid, a figure).

**Layouts** — `data-layout` on the section:
`cover` · `section` · `statement` · `quote` · `center` · `split` · `hero` · `end`
(no attribute = the standard header + body).
`split` expects `<div class="media">` and `<div class="text">`; add
`.is-flip` to put the media on the right. `hero` expects a `.media` behind
the text.

**Tones** — `data-tone="invert" | "accent" | "soft"` recolours one slide (or
one card). Use `invert` or `accent` on section dividers for rhythm.

**Transitions** — `data-transition="morph|fade|slide|zoom|none"` on the deck
or one slide. With `morph` (the default) elements that two consecutive
slides share — same text, same image, or the same `data-morph="name"` —
glide from their old position and size to the new one.

**Steps** — `data-step` reveals an element on the next key press
(`data-step="2"` for an explicit order). `data-steps` on a list reveals its
children one by one. `data-fx="up|left|zoom|blur|wipe"` picks the entrance.

## Components

| Markup | Use |
|---|---|
| `.cols` (`data-cols="3"`, `.is-1-2`, `.is-2-1`, `.is-2-3`, `.is-3-2`, `.is-stretch`, `.is-center`) | columns |
| `.card` (`.is-accent`, `.is-outline`, `.is-raised`), `.icon` | grouped box |
| `.callout`, `.takeaway` | the sentence to remember / the conclusion band |
| `.stat` > `<hs-count>3.4×</hs-count>` + `<span>` (`.is-s`, `.is-line`) | one big number, counts up |
| `.tag`, `.delta` (`.is-down`), `mark`, `kbd` | inline accents |
| `ol.steps`, `ol.timeline` (`li.is-now`), `ol.agenda`, `ul.checklist` (`li.is-no`) | structured lists |
| `.bento` (`.is-wide`, `.is-tall`, `.is-accent`) | mosaic summary |
| `.window[data-title]` > `pre > code.lang-py` | code in a window frame |
| `figure` (`.grow`, `.frame`, `.is-cover`) + `figcaption` | figures |
| `table` (`td.num`, `td.is-hl`) | tables |
| `.meter` with `style="--value: 72"` | progress bar |
| `.free` + inline `left/top/width` — `.label`, `.shape`, `.arrow` (`rotate:`) | annotations on the canvas |

Utilities: `.grow` `.muted` `.accent` `.small` `.tiny` `.mono` `.center`
`.nowrap` `.gradient`.

## Charts

Data is a plain table; the chart draws itself from it and follows the theme.

```html
<hs-chart type="bar" unit="%" highlight="Q4">
  <table>
    <tr><td>Q1</td><td>61</td></tr>
    <tr><td>Q4</td><td>83</td></tr>
  </table>
</hs-chart>
```

`type`: `bar` `hbar` `line` `area` `donut` `scatter`. Two columns are one
series of (label, value). For several series, the first row holds the
categories and each following row is a series. `scatter` rows are
(label, x, y) under a header row; add `trend` for a fit line. Other
attributes: `unit`, `max`, `min`, `stacked`, `highlight`, `values="off"`,
`center` (donut). Set the height with `style="height: 520px"` or `.grow`.
