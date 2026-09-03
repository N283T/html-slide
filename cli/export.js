/* Export: render the deck to PDF or per-slide PNGs with whatever
 * Chromium-family browser is already on the machine — no npm deps.
 * A throwaway dev server is started on a random port so relative
 * assets and webfonts resolve exactly as they do in the browser. */

import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { startDevServer, findSlideSections } from './dev-server.js';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Arc.app/Contents/MacOS/Arc',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

async function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    try {
      await fs.access(p);
      return p;
    } catch { /* keep looking */ }
  }
  throw new Error(
    'No Chromium-family browser found. Install Chrome or set CHROME_PATH.');
}

/* Run Chrome until the render output lands, then kill it. Recent
 * Chrome versions finish writing the file but keep running for
 * background services, so waiting for a clean exit hangs forever —
 * the file appearing (and its size settling) is the real signal. */
function render(cmd, args, outFile, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    let done = false;
    let lastSize = -1;
    child.stderr.on('data', (d) => { err += d; });

    const finish = (ok, msg) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timer);
      child.kill('SIGKILL');
      ok ? resolve() : reject(new Error(msg));
    };

    const poll = setInterval(() => {
      fs.stat(outFile).then((st) => {
        if (st.size > 0 && st.size === lastSize) finish(true);
        lastSize = st.size;
      }, () => {});
    }, 300);

    const timer = setTimeout(() => {
      finish(false, 'chrome render timed out\n' + err.slice(-400));
    }, timeoutMs);

    child.on('close', () => {
      if (done) return;
      /* It exited on its own — trust the file. */
      fs.stat(outFile).then(
        () => finish(true),
        () => finish(false, 'chrome exited without output\n' + err.slice(-400))
      );
    });
  });
}

async function withServer(root, fn) {
  /* A deck that references assets one level up (e.g. this repo's
   * template/ pointing at ../core/) must be served from its parent,
   * or every stylesheet 404s and the captures come out unstyled. */
  root = path.resolve(root);
  let urlPath = '/';
  const source = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  if (/(?:href|src)="\.\.\//.test(source)) {
    urlPath = '/' + path.basename(root) + '/';
    root = path.dirname(root);
  }
  const server = startDevServer({ root, port: 0, quiet: true });
  await new Promise((resolve) => server.on('listening', resolve));
  const port = server.address().port;
  try {
    return await fn('http://127.0.0.1:' + port + urlPath);
  } finally {
    server.close();
    /* SSE clients hold the server open; force-exit any leftovers. */
    server.closeAllConnections?.();
  }
}

async function countSlides(root) {
  const source = await fs.readFile(path.join(path.resolve(root), 'index.html'), 'utf8');
  return findSlideSections(source).length;
}

const COMMON_FLAGS = [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--no-first-run',
  '--no-default-browser-check'
];

/* A throwaway profile keeps headless runs independent of any Chrome
 * that is already open (sharing a profile can silently hang). */
async function withProfile(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-chrome-'));
  try {
    return await fn('--user-data-dir=' + dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function exportPdf(root, out) {
  const chrome = await findChrome();
  out = path.resolve(out || 'deck.pdf');
  await fs.rm(out, { force: true });
  await withServer(root, (url) => withProfile((profile) =>
    render(chrome, [
      ...COMMON_FLAGS,
      profile,
      '--no-pdf-header-footer',
      '--print-to-pdf=' + out,
      url + '?capture=1'
    ], out)
  ));
  console.log('wrote %s', out);
}

/* "51" -> [51], "48-51" -> [48..51], "1,3,7" -> [1,3,7]. */
function parseSlideSpec(spec, total) {
  const picks = new Set();
  for (const token of String(spec).split(',')) {
    const m = token.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error('bad --slide value: ' + token);
    const from = Number(m[1]);
    const to = Number(m[2] || m[1]);
    for (let i = from; i <= to; i++) {
      if (i < 1 || i > total) {
        throw new Error('slide ' + i + ' out of range (deck has ' + total + ')');
      }
      picks.add(i);
    }
  }
  return [...picks].sort((a, b) => a - b);
}

export async function exportPngs(root, outDir, slideSpec, width) {
  width = Math.round(Number(width) || 1920);
  if (width < 320 || width > 3840) throw new Error('--width out of range (320-3840)');
  const height = Math.round(width * 9 / 16);
  const chrome = await findChrome();
  outDir = path.resolve(outDir || 'slide-captures');
  await fs.mkdir(outDir, { recursive: true });
  const total = await countSlides(root);
  const picks = slideSpec
    ? parseSlideSpec(slideSpec, total)
    : Array.from({ length: total }, (_, k) => k + 1);
  await withServer(root, (url) => withProfile(async (profile) => {
    for (const i of picks) {
      const file = path.join(outDir,
        'slide-' + String(i).padStart(2, '0') + '.png');
      await fs.rm(file, { force: true });
      await render(chrome, [
        ...COMMON_FLAGS,
        profile,
        '--window-size=' + width + ',' + height,
        '--screenshot=' + file,
        url + '?s=' + i + '&capture=1'
      ], file);
      console.log('wrote %s', path.relative(process.cwd(), file));
    }
  }));
  console.log('captured %d slide%s -> %s',
    picks.length, picks.length === 1 ? '' : 's', outDir);
}
