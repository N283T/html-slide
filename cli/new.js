/* `html-slide new <dir>` — scaffold a self-contained deck.
 * Copies the starter template and vendors core/, themes/ and layouts/
 * into <dir>/assets/hs/ so the deck carries everything it needs and
 * can be committed, hosted or presented without this repository. */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRAMEWORK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* Google Fonts URL matching each theme's font stack (see themes/*.css). */
const THEME_FONTS = {
  paper: 'https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=Shippori+Mincho:wght@600;800&family=IBM+Plex+Mono:wght@400;600&display=swap',
  aurora: 'https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=Outfit:wght@500;700;800&family=JetBrains+Mono:wght@400;600&display=swap',
  lab: 'https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=Sora:wght@600;700;800&family=IBM+Plex+Mono:wght@400;600&display=swap'
};
const THEMES = Object.keys(THEME_FONTS);

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

export async function scaffold(target, { theme = 'paper' } = {}) {
  if (!THEMES.includes(theme)) {
    throw new Error('unknown theme "' + theme + '" (available: ' + THEMES.join(', ') + ')');
  }
  const dest = path.resolve(target);
  const exists = await fs.stat(dest).catch(() => null);
  if (exists && (await fs.readdir(dest)).length > 0) {
    throw new Error(dest + ' already exists and is not empty');
  }

  await copyDir(path.join(FRAMEWORK_ROOT, 'template'), dest);
  for (const dir of ['core', 'themes', 'layouts']) {
    await copyDir(path.join(FRAMEWORK_ROOT, dir), path.join(dest, 'assets', 'hs', dir));
  }

  /* The template references ../core etc. so it also runs inside the
   * framework repo; a scaffolded deck points at its vendored copy. */
  for (const file of ['index.html', 'presenter.html']) {
    const p = path.join(dest, file);
    let html = await fs.readFile(p, 'utf8');
    html = html.replaceAll('../core/', 'assets/hs/core/')
               .replaceAll('../themes/', 'assets/hs/themes/')
               .replaceAll('../layouts/', 'assets/hs/layouts/');
    if (theme !== 'paper') {
      html = html.replace('assets/hs/themes/paper.css', 'assets/hs/themes/' + theme + '.css');
      html = html.replace(/https:\/\/fonts\.googleapis\.com\/css2\?[^"]*/, THEME_FONTS[theme]);
    }
    await fs.writeFile(p, html, 'utf8');
  }

  console.log('Created %s (theme: %s)', dest, theme);
  console.log('  html-slide dev %s   # then open http://127.0.0.1:8000/', target);
}
