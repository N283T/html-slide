/* Deck source model.
 *
 * A deck is one HTML file whose slides are the top-level
 * <section class="slide"> elements. The server never parses HTML
 * properly; it only needs to find those sections, so that a save can
 * splice slide markup while leaving every other byte alone.
 *
 * Slides are identified by the hash of their source text, not by
 * position, so an edit made outside the browser (an agent, a text
 * editor) to one slide never collides with a browser edit to another. */

import { createHash } from 'node:crypto';

export const hash = (text) =>
  createHash('sha1').update(text).digest('hex').slice(0, 12);

/* Byte ranges of the top-level slide sections. Comments, scripts and
 * styles are skipped so a "<section" inside them is not counted. */
function findSections(source) {
  const token = /<!--[^]*?-->|<(script|style)\b[^]*?<\/\1\s*>|<section\b[^>]*>|<\/section\s*>/gi;
  const sections = [];
  const stack = [];
  let m;
  while ((m = token.exec(source)) !== null) {
    const text = m[0];
    if (text.startsWith('<!--') || m[1]) continue;
    if (text[1] !== '/') {
      stack.push({ start: m.index, tag: text });
      continue;
    }
    const open = stack.pop();
    if (open && stack.length === 0 &&
        /\bclass\s*=\s*["'][^"']*\bslide\b/.test(open.tag)) {
      sections.push({ start: open.start, end: m.index + text.length });
    }
  }
  return sections;
}

/* Split a deck into prefix / slide units / suffix.
 * A unit carries the label comment sitting directly above its section
 * (<!-- 3 · results -->), so the label moves and dies with the slide. */
export function parseDeck(source) {
  const sections = findSections(source);
  if (!sections.length) {
    return { prefix: source, suffix: '', units: [], head: hash(source) };
  }
  const units = [];
  let prefix = '';
  sections.forEach((sec, i) => {
    const gap = source.slice(i === 0 ? 0 : sections[i - 1].end, sec.start);
    let lead = gap;
    if (i === 0) {
      const m = gap.match(/((?:[ \t]*<!--(?:(?!-->)[^])*-->[ \t]*\r?\n)*)[ \t]*$/);
      lead = m[0];
      prefix = gap.slice(0, gap.length - lead.length);
    }
    const section = source.slice(sec.start, sec.end);
    units.push({
      label: lead.trim(),
      indent: (lead.match(/[ \t]*$/) || [''])[0],
      section,
      hash: hash(section),
      start: sec.start
    });
  });
  const suffix = source.slice(sections[sections.length - 1].end);
  return { prefix, suffix, units, head: hash(prefix + '\u0000' + suffix) };
}

export function buildDeck({ prefix, suffix, units }) {
  const body = units
    .map((u) => (u.label ? u.indent + u.label + '\n' : '') + u.indent + u.section)
    .join('\n\n');
  return prefix.replace(/\s*$/, '') + '\n\n' + body + '\n\n' + suffix.replace(/^\s*/, '');
}

const stripTags = (html) =>
  html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

export function titleOf(section) {
  const m = section.match(/<h[123]\b[^>]*>([^]*?)<\/h[123]>/i);
  return m ? stripTags(m[1]) : '';
}

/* Review notes: <!-- @fix: text --> placed directly above the element
 * they are about. They live in the source so that whoever edits the
 * file next — a person or an agent — finds them where the problem is. */
export const NOTE = /<!--\s*@fix:?\s*([^]*?)\s*-->/g;

export function findNotes(source) {
  const deck = parseDeck(source);
  const notes = [];
  deck.units.forEach((unit, i) => {
    NOTE.lastIndex = 0;
    let m;
    while ((m = NOTE.exec(unit.section)) !== null) {
      const offset = unit.start + m.index;
      const after = unit.section.slice(m.index + m[0].length);
      const target = after.match(/^\s*<([a-zA-Z][\w-]*)([^>]*)>/);
      let on = 'slide';
      if (target) {
        const cls = target[2].match(/\bclass\s*=\s*["']([^"']*)["']/);
        on = target[1].toLowerCase() +
          (cls ? '.' + cls[1].trim().split(/\s+/).join('.') : '');
      }
      notes.push({
        slide: i + 1,
        title: titleOf(unit.section),
        line: source.slice(0, offset).split('\n').length,
        on,
        text: m[1].replace(/\s+/g, ' ')
      });
    }
  });
  return notes;
}

export const stripNotes = (html) => html.replace(/[ \t]*<!--\s*@fix:?[^]*?-->[ \t]*\r?\n?/g, '');
