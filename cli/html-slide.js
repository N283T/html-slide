#!/usr/bin/env node
/* html-slide CLI.
 *   html-slide dev [dir] [--port N]   serve a deck with live reload + edit mode
 *   html-slide new <dir> [--theme T]  scaffold a self-contained deck
 */

import { startDevServer } from './dev-server.js';
import { scaffold } from './new.js';

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
  html-slide dev [dir] [--port N]    Serve a deck (default dir ., port 8000).
                                     Live reload on file change; press e in
                                     the browser for edit mode with write-back.
  html-slide new <dir> [--theme T]   Scaffold a self-contained deck.
                                     Themes: paper (default), aurora, lab.
`;

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
    scaffold(rest[0], { theme }).catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
    break;
  }
  default:
    console.log(HELP);
    process.exit(command ? 1 : 0);
}
