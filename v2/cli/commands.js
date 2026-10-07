/* File-level commands: new, upgrade, notes, build. */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FRAMEWORK, vendor, bundleJs, bundleCss, listThemes, themeFile } from './bundle.js';
import { findNotes, stripNotes, parseDeck } from './source.js';

/* A deck is a folder with an index.html, or an .html file. */
export async function resolveDeck(target) {
  const stat = await fs.stat(target).catch(() => null);
  if (!stat) throw new Error('no such deck: ' + target);
  const file = stat.isDirectory() ? path.join(target, 'index.html') : target;
  await fs.access(file).catch(() => { throw new Error('no index.html in ' + target); });
  return { dir: path.dirname(file), file };
}

const SKIP = new Set(['hs', 'dist', 'shots', 'node_modules', 'CLAUDE.md', 'AGENTS.md']);

async function copyTree(from, to, skip) {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || (skip && skip.has(entry.name))) continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) await copyTree(src, dest, null);
    else await fs.copyFile(src, dest);
  }
}

export async function create(dir, { theme }) {
  const themes = await listThemes();
  if (!themes.includes(theme)) {
    throw new Error('unknown theme "' + theme + '" (available: ' + themes.join(', ') + ')');
  }
  const existing = await fs.readdir(dir).catch(() => []);
  if (existing.length) throw new Error(dir + ' already exists and is not empty');

  await copyTree(path.join(FRAMEWORK, 'template'), dir, SKIP);
  const index = path.join(dir, 'index.html');
  const html = await fs.readFile(index, 'utf8');
  await fs.writeFile(index, html.replace(/(hs\/themes\/)[\w-]+(\.css)/, '$1' + theme + '$2'));
  await fs.copyFile(path.join(FRAMEWORK, 'docs', 'deck-guide.md'), path.join(dir, 'CLAUDE.md'));
  await vendor(dir);

  const rel = path.relative(process.cwd(), dir) || '.';
  console.log('created %s  (theme: %s)', rel, theme);
  console.log('  hs dev %s', rel);
}

export async function upgrade(target) {
  const { dir } = await resolveDeck(target);
  await vendor(dir);
  console.log('refreshed %s', path.join(path.relative(process.cwd(), dir) || '.', 'hs'));
}

export async function notes(target, { json }) {
  const { file } = await resolveDeck(target);
  const found = findNotes(await fs.readFile(file, 'utf8'));
  const rel = path.relative(process.cwd(), file);
  if (json) {
    console.log(JSON.stringify(found.map((n) => Object.assign({ file: rel }, n)), null, 2));
    return;
  }
  if (!found.length) {
    console.log('no open @fix notes in %s', rel);
    return;
  }
  for (const n of found) {
    console.log('%s:%d  slide %d%s  <%s>\n    %s', rel, n.line, n.slide,
      n.title ? ' “' + n.title + '”' : '', n.on, n.text);
  }
  console.log('\n%d open note%s. Fix each one, then delete its comment.', found.length, found.length === 1 ? '' : 's');
}

/* ---- build: a copy fit to publish ---- */

const NOTES = /[ \t]*<aside\b[^>]*\bclass\s*=\s*["'][^"']*\bnotes\b[^"']*["'][^>]*>[^]*?<\/aside>[ \t]*\r?\n?/gi;

const DATA_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml'
};

async function inline(html, dir) {
  const theme = (html.match(/hs\/themes\/([\w-]+)\.css/) || [])[1];
  const themeCss = theme
    ? await fs.readFile(themeFile(theme), 'utf8').catch(() => '')
    : '';
  /* Each <style> is its own stylesheet, so the theme's @import (web
   * fonts) is still the first rule of the sheet it sits in. */
  const safe = (text, tag) => text.replace(new RegExp('</' + tag, 'gi'), '<\\/' + tag);
  const base = safe(await bundleCss(), 'style');
  const js = safe(await bundleJs(), 'script');
  html = html
    .replace(/[ \t]*<link\b[^>]*hs\/hs\.css[^>]*>\r?\n?/i, () => '<style>\n' + base + '\n</style>\n')
    .replace(/[ \t]*<link\b[^>]*hs\/themes\/[\w-]+\.css[^>]*>\r?\n?/i,
      () => '<style>\n' + safe(themeCss, 'style') + '\n</style>\n')
    .replace(/<script\b[^>]*hs\/hs\.js[^>]*><\/script>/i, () => '<script>\n' + js + '\n</script>');

  const cache = new Map();
  const refs = Array.from(html.matchAll(/\b(?:src|href)\s*=\s*"([^"]+)"/g)).map((m) => m[1]);
  for (const ref of new Set(refs)) {
    const ext = path.extname(ref.split(/[?#]/)[0]).toLowerCase();
    if (!DATA_MIME[ext] || /^(?:[a-z]+:)?\/\//i.test(ref) || ref.startsWith('data:')) continue;
    const data = await fs.readFile(path.join(dir, decodeURIComponent(ref.split(/[?#]/)[0]))).catch(() => null);
    if (data) cache.set(ref, 'data:' + DATA_MIME[ext] + ';base64,' + data.toString('base64'));
  }
  return html.replace(/\b(src|href)\s*=\s*"([^"]+)"/g,
    (all, attr, ref) => (cache.has(ref) ? attr + '="' + cache.get(ref) + '"' : all));
}

export async function build(target, { out, single }) {
  const { dir, file } = await resolveDeck(target);
  let html = stripNotes((await fs.readFile(file, 'utf8')).replace(NOTES, ''));
  const slides = parseDeck(html).units.length;

  if (single) {
    const dest = path.resolve(out || path.join(dir, 'dist', path.basename(dir) + '.html'));
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, await inline(html, dir));
    console.log('built %s  (%d slides, single file)', path.relative(process.cwd(), dest), slides);
    return;
  }

  const dest = path.resolve(out || path.join(dir, 'dist'));
  if (dest === dir) throw new Error('--out must differ from the deck folder');
  await fs.rm(dest, { recursive: true, force: true });
  await copyTree(dir, dest, SKIP);
  await fs.writeFile(path.join(dest, path.basename(file)), html);
  await fs.rm(path.join(dest, path.basename(dir) + '.pdf'), { force: true });
  await vendor(dest);
  console.log('built %s  (%d slides; speaker notes and @fix comments removed)',
    path.relative(process.cwd(), dest) || '.', slides);
}
