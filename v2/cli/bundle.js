/* The framework a deck links to is three files: hs/hs.js, hs/hs.css and
 * hs/themes/<name>.css. In this repository they are split into parts;
 * this module concatenates them. The dev server serves the result for
 * decks that have no vendored copy, and `hs new` / `hs build` write it
 * to disk so a deck is self-contained and works from file://. */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const FRAMEWORK = path.resolve(import.meta.dirname, '..');

const JS_PARTS = ['runtime/hs.js', 'runtime/components.js', 'runtime/present.js'];
const CSS_PARTS = ['runtime/hs.css', 'design/base.css', 'design/components.css'];

const read = (rel) => fs.readFile(path.join(FRAMEWORK, rel), 'utf8');
const join = async (parts) => (await Promise.all(parts.map(read))).join('\n');

export const bundleJs = () => join(JS_PARTS);
export const bundleCss = () => join(CSS_PARTS);

export const themeFile = (name) =>
  path.join(FRAMEWORK, 'design', 'themes', name + '.css');

export async function listThemes() {
  const names = await fs.readdir(path.join(FRAMEWORK, 'design', 'themes'));
  return names.filter((n) => n.endsWith('.css')).map((n) => n.slice(0, -4)).sort();
}

/* Write the framework into <deckDir>/hs/. */
export async function vendor(deckDir) {
  const dest = path.join(deckDir, 'hs');
  await fs.mkdir(path.join(dest, 'themes'), { recursive: true });
  await fs.writeFile(path.join(dest, 'hs.js'), await bundleJs());
  await fs.writeFile(path.join(dest, 'hs.css'), await bundleCss());
  for (const name of await listThemes()) {
    await fs.copyFile(themeFile(name), path.join(dest, 'themes', name + '.css'));
  }
}
