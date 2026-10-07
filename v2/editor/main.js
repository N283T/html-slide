/* Editor entry point. The dev server appends this module to every deck
 * page it serves; the deck source never references it.
 *
 *   default         edit mode
 *   ?present        presentation; `e` switches to the editor
 *   ?presenter      presenter view; live sync only
 *   ?print|shot|check   untouched — those are rendered for export */

import { HS } from './core.js';
import * as sync from './sync.js';
import { initStage } from './stage.js';
import { initCommands, setThemes } from './commands.js';
import { initPanels } from './panels.js';

async function boot() {
  if (!HS || HS.isStatic) return;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/__hs/editor/editor.css';
  const styled = new Promise((resolve) => {
    css.onload = resolve;
    css.onerror = resolve;
  });
  document.head.appendChild(css);

  const ping = await fetch('/__hs/ping').then((r) => r.json()).catch(() => null);
  if (!ping || !ping.ok) return;
  setThemes(ping.themes);

  try {
    await sync.init();
  } catch (err) {
    console.error('[hs] sync unavailable:', err);
  }
  if (HS.flags.presenter) return;

  await styled;
  initStage();
  initCommands();
  initPanels();
  if (!new URLSearchParams(location.search).has('present')) HS.setMode('edit');
}

boot();
