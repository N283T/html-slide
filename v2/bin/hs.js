#!/usr/bin/env node
/* hs — the html-slide command line.
 *
 *   hs dev [dir] [--port N]           serve a deck (or a folder of decks) with the editor
 *   hs new <dir> [--theme name]       scaffold a self-contained deck
 *   hs check <deck> [--json]          layout/legibility audit + open @fix notes
 *   hs shot <deck> [--slide N] [--out dir] [--scale N]   PNG per slide
 *   hs pdf <deck> [--out file]        one page per slide
 *   hs build <deck> [--out dir] [--single]   static copy without notes or editor
 *   hs notes <deck>                   list @fix review notes
 *   hs upgrade <deck>                 refresh the deck's vendored hs/ */

import path from 'node:path';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next == null || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else {
      args._.push(a);
    }
  }
  return args;
}

const USAGE = `hs — html-slide

  hs dev [dir] [--port 4100]      serve with the editor (default dir: .)
  hs new <dir> [--theme paper]    scaffold a self-contained deck
  hs check <deck> [--json]        audit layout and list open @fix notes
  hs shot <deck> [--slide N] [--out shots] [--scale 1]
  hs pdf <deck> [--out deck.pdf]
  hs build <deck> [--out dist] [--single]
  hs notes <deck>
  hs upgrade <deck>
`;

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
const target = args._[0];

function need(what) {
  if (!target) {
    console.error('hs ' + command + ': missing ' + what + '\n\n' + USAGE);
    process.exit(2);
  }
  return path.resolve(target);
}

try {
  switch (command) {
    case 'dev': {
      const { startServer } = await import('../cli/server.js');
      startServer({ root: path.resolve(target || '.'), port: Number(args.port) || 4100 });
      break;
    }
    case 'new': {
      const { create } = await import('../cli/commands.js');
      await create(need('<dir>'), { theme: args.theme || 'paper' });
      break;
    }
    case 'upgrade': {
      const { upgrade } = await import('../cli/commands.js');
      await upgrade(need('<deck>'));
      break;
    }
    case 'notes': {
      const { notes } = await import('../cli/commands.js');
      await notes(need('<deck>'), { json: !!args.json });
      break;
    }
    case 'build': {
      const { build } = await import('../cli/commands.js');
      await build(need('<deck>'), { out: args.out, single: !!args.single });
      break;
    }
    case 'check': {
      const { check } = await import('../cli/render.js');
      process.exitCode = await check(need('<deck>'), { json: !!args.json });
      break;
    }
    case 'shot': {
      const { shot } = await import('../cli/render.js');
      await shot(need('<deck>'), {
        out: args.out,
        slide: args.slide ? Number(args.slide) : null,
        scale: Number(args.scale) || 1
      });
      break;
    }
    case 'pdf': {
      const { pdf } = await import('../cli/render.js');
      await pdf(need('<deck>'), { out: args.out });
      break;
    }
    default:
      console.log(USAGE);
      process.exitCode = command && command !== 'help' && command !== '--help' ? 2 : 0;
  }
} catch (err) {
  console.error('hs: ' + err.message);
  process.exit(1);
}
