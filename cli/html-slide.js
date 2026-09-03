#!/usr/bin/env node
/* html-slide CLI.
 *   html-slide dev [dir] [--port N]      serve a deck with live reload + edit mode
 *   html-slide new <dir> [--theme T]     scaffold a self-contained deck
 *   html-slide pdf [dir] [--out F]       render the deck to a PDF
 *   html-slide capture [dir] [--out D] [--slide N]   render slides to PNGs
 */

import { startDevServer } from './dev-server.js';
import { scaffold } from './new.js';
import { exportPdf, exportPngs } from './export.js';

const [, , command, ...rest] = process.argv;

function flag(name, fallback) {
  const i = rest.indexOf('--' + name);
  if (i === -1 || i + 1 >= rest.length) return fallback;
  const value = rest[i + 1];
  rest.splice(i, 2);
  return value;
}

const HELP = `html-slide — dependency-free HTML slide framework

Usage:
  html-slide dev [dir] [--port N]      Serve a deck (default dir ., port 8000).
                                       Live reload on file change; press e in
                                       the browser for edit mode with write-back.
  html-slide new <dir> [--theme T]     Scaffold a self-contained deck.
                                       Themes: paper (default), aurora, lab.
  html-slide pdf [dir] [--out F]       Export the deck to a PDF (default deck.pdf).
  html-slide capture [dir] [--out D]   Export slide-NN.png files (default
                     [--slide N|N-M|a,b] slide-captures/); --slide limits to
                     [--width W]       one slide, a range, or a list; --width
                                       sets PNG width (default 1920, 16:9).
                                       Both exporters use a local Chrome install.
`;

function fail(err) {
  console.error(err.message);
  process.exit(1);
}

switch (command) {
  case 'dev': {
    const port = Number(flag('port', 8000));
    startDevServer({ root: rest[0] || '.', port });
    break;
  }
  case 'new': {
    const theme = flag('theme', 'paper');
    if (!rest[0]) {
      console.error('usage: html-slide new <dir> [--theme T]');
      process.exit(1);
    }
    scaffold(rest[0], { theme }).catch(fail);
    break;
  }
  case 'pdf': {
    const out = flag('out', 'deck.pdf');
    exportPdf(rest[0] || '.', out).then(() => process.exit(0)).catch(fail);
    break;
  }
  case 'capture': {
    const out = flag('out', 'slide-captures');
    const slide = flag('slide', null);
    const width = flag('width', 1920);
    exportPngs(rest[0] || '.', out, slide, width).then(() => process.exit(0)).catch(fail);
    break;
  }
  default:
    console.log(HELP);
    process.exit(command ? 1 : 0);
}
