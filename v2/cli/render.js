/* Commands that need a real browser: check, shot, pdf.
 * Each one serves the deck from a throwaway server on a free port, so
 * relative assets and web fonts resolve exactly as they do while
 * editing. */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { startServer } from './server.js';
import { launch } from './chrome.js';
import { resolveDeck } from './commands.js';
import { findNotes, parseDeck } from './source.js';

async function withPage(target, query, viewport, fn) {
  const deck = await resolveDeck(target);
  const server = startServer({ root: deck.dir, port: 0, quiet: true, inject: false });
  const port = await server.ready;
  const name = path.basename(deck.file);
  const url = 'http://127.0.0.1:' + port + '/' + (name === 'index.html' ? '' : encodeURIComponent(name)) + '?' + query;
  const browser = await launch();
  try {
    const page = await browser.open(url, viewport);
    const ok = await page.evaluate('window.HS ? HS.ready.then(() => true) : false');
    if (!ok) throw new Error(path.relative(process.cwd(), deck.file) + ' is not an html-slide deck (no #deck or hs.js)');
    return await fn(page, deck);
  } finally {
    await browser.close();
    server.close();
  }
}

const SETTLE = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))))';

/* ---- check ---- */

const ORDER = { error: 0, warn: 1, note: 2 };

export async function check(target, { json }) {
  return withPage(target, 'check', null, async (page, deck) => {
    const source = await fs.readFile(deck.file, 'utf8');
    const rel = path.relative(process.cwd(), deck.file);
    const audited = (await page.evaluate('HS.auditAll()')).filter((i) => i.kind !== 'note');
    const notes = findNotes(source).map((n) => ({
      slide: n.slide, title: n.title, kind: 'note', level: 'note',
      message: n.text, target: n.on, line: n.line
    }));
    const issues = audited.concat(notes)
      .sort((a, b) => a.slide - b.slide || ORDER[a.level] - ORDER[b.level]);
    const count = (level) => issues.filter((i) => i.level === level).length;
    const slides = parseDeck(source).units.length;

    if (json) {
      console.log(JSON.stringify({
        file: rel, slides, errors: count('error'), warnings: count('warn'), notes: count('note'), issues
      }, null, 2));
    } else if (!issues.length) {
      console.log('%s — %d slides, no problems', rel, slides);
    } else {
      console.log('%s — %d slides', rel, slides);
      let current = 0;
      for (const issue of issues) {
        if (issue.slide !== current) {
          current = issue.slide;
          console.log('\n  %d  %s', issue.slide, issue.title || '');
        }
        const where = issue.line ? rel + ':' + issue.line + '  ' : '';
        const text = issue.text ? '  “' + issue.text + '”' : '';
        console.log('     %s %s  %s<%s>%s', issue.level.padEnd(5), issue.kind.padEnd(10), where, issue.target, text);
        console.log('           %s', issue.message);
      }
      console.log('\n%d error(s), %d warning(s), %d open @fix note(s)', count('error'), count('warn'), count('note'));
    }
    return count('error') ? 1 : 0;
  });
}

/* ---- shot ---- */

export async function shot(target, { out, slide, scale }) {
  return withPage(target, 'shot', { width: 1920, height: 1080, scale }, async (page, deck) => {
    const dest = path.resolve(out || path.join(deck.dir, 'shots'));
    await fs.mkdir(dest, { recursive: true });
    const total = await page.evaluate('HS.slides.length');
    if (slide != null && (!Number.isInteger(slide) || slide < 1 || slide > total)) {
      throw new Error('--slide must be between 1 and ' + total);
    }
    const wanted = slide != null ? [slide] : Array.from({ length: total }, (_, i) => i + 1);
    const width = String(total).length < 2 ? 2 : String(total).length;
    for (const n of wanted) {
      await page.evaluate('HS.go(' + (n - 1) + ", 'last', { animate: false, force: true }); " + SETTLE);
      const file = path.join(dest, 'slide-' + String(n).padStart(width, '0') + '.png');
      await fs.writeFile(file, await page.screenshot());
      console.log(path.relative(process.cwd(), file));
    }
  });
}

/* ---- pdf ---- */

export async function pdf(target, { out }) {
  return withPage(target, 'print', null, async (page, deck) => {
    await page.evaluate(SETTLE + '.then(() => new Promise((r) => setTimeout(r, 400)))');
    const dest = path.resolve(out || path.join(deck.dir, path.basename(deck.dir) + '.pdf'));
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, await page.pdf());
    const total = await page.evaluate('HS.slides.length');
    console.log('%s  (%d pages)', path.relative(process.cwd(), dest), total);
  });
}
