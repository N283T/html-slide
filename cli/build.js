/* Build: emit a static copy of the deck for plain hosting (GitHub
 * Pages etc). Dev-only modules are dropped so the published deck has
 * no edit mode, no live reload, and no slide-management UI — just
 * presentation, overview, presenter console and pen. */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/* Modules that only make sense with the dev server attached. */
const DEV_SCRIPTS = ['livereload.js', 'snippets.js', 'authoring.js', 'editor.js'];

/* Working files that never belong in a published deck. The presenter
 * console goes too: speaker notes are stripped from the build. */
const SKIP_NAMES = new Set(['slide-captures', 'deck.pdf', '.DS_Store', 'presenter.html']);

function stripNotes(html) {
  return html.replace(/[ \t]*<aside class="notes">[\s\S]*?<\/aside>\n?/g, '');
}

function stripDevScripts(html) {
  for (const name of DEV_SCRIPTS) {
    html = html.replace(
      new RegExp('[ \\t]*<script[^>]*core/' + name.replace('.', '\\.') + '[^>]*></script>\\n?', 'g'),
      '');
  }
  return html;
}

async function copyTree(from, to, exclude) {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    if (SKIP_NAMES.has(entry.name) || entry.name.startsWith('.')) continue;
    const src = path.join(from, entry.name);
    if (src === exclude) continue;
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) await copyTree(src, dst, exclude);
    else if (DEV_SCRIPTS.includes(entry.name) && from.endsWith(path.join('hs', 'core'))) continue;
    else await fs.copyFile(src, dst);
  }
}

export async function buildStatic(root, outDir) {
  root = path.resolve(root);
  outDir = path.resolve(outDir || 'dist');
  if (outDir === root) throw new Error('--out must differ from the deck directory');
  await fs.rm(outDir, { recursive: true, force: true });
  await copyTree(root, outDir, outDir);
  const file = path.join(outDir, 'index.html');
  const html = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, stripNotes(stripDevScripts(html)));
  console.log('built static deck -> %s', outDir);
}
