/* Dev server: static files, the editor, and the sync endpoints.
 *
 * GET  /__hs/ping             {ok, version, themes}
 * GET  /__hs/events           SSE: deck {path} | css {path} | asset {path} | reload
 * GET  /__hs/state?path=      {rev, head, slides: [{hash, html}]}
 * POST /__hs/save             {path, rev, slides: [{hash} | {hash?, html}]}
 *        The full slide order. An entry without html keeps that slide's
 *        source untouched. Applied only if the file still has revision
 *        `rev`; otherwise 409 with the current state, and the browser
 *        merges and retries.
 * POST /__hs/head             {path, rev, theme?, deck?: {attr: value|null}}
 * POST /__hs/asset?path=&name=  raw body -> <deck>/assets/<name>
 *
 * Deck pages get the editor module injected at serve time, so the deck
 * source never references it. */

import { createServer } from 'node:http';
import { promises as fs, watch } from 'node:fs';
import path from 'node:path';
import { parseDeck, buildDeck, hash } from './source.js';
import { FRAMEWORK, bundleJs, bundleCss, listThemes, themeFile } from './bundle.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8'
};

const IMAGE_EXT = /\.(png|jpe?g|webp|avif|gif|svg)$/i;
const FRAMEWORK_FILE = /(?:^|\/)hs\/(hs\.js|hs\.css|themes\/([\w-]+)\.css)$/;
const VERSION = '2.0.0-alpha.1';
const MAX_ASSET = 64 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function readBody(req, limit = 32 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'payload too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function startServer({ root, port = 4100, quiet = false, inject = true }) {
  root = path.resolve(root);
  const clients = new Set();
  const ownWrites = new Map();   /* file -> rev this server last wrote */
  const locks = new Map();

  const send = (event, data) => {
    const frame = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
    for (const res of clients) res.write(frame);
  };

  const urlOf = (file) => '/' + path.relative(root, file).split(path.sep).join('/');

  function resolveFile(urlPath) {
    const file = path.normalize(path.join(root, decodeURIComponent(urlPath)));
    if (file !== root && !file.startsWith(root + path.sep)) return null;
    return file;
  }

  async function deckFile(urlPath) {
    let file = resolveFile(urlPath || '/');
    if (!file) throw new HttpError(403, 'path outside root');
    const stat = await fs.stat(file).catch(() => null);
    if (stat && stat.isDirectory()) file = path.join(file, 'index.html');
    return file;
  }

  /* Reads and writes of one file are serialized, so two saves can
   * never interleave their read-modify-write. */
  function withLock(file, fn) {
    const run = (locks.get(file) || Promise.resolve()).then(fn, fn);
    locks.set(file, run.catch(() => {}));
    return run;
  }

  async function write(file, text) {
    ownWrites.set(file, hash(text));
    await fs.writeFile(file, text, 'utf8');
  }

  function stateOf(source) {
    const deck = parseDeck(source);
    return {
      rev: hash(source),
      head: deck.head,
      slides: deck.units.map((u) => ({ hash: u.hash, html: u.section }))
    };
  }

  /* ---- endpoints ---- */

  async function handleState(url) {
    const file = await deckFile(url.searchParams.get('path'));
    return stateOf(await fs.readFile(file, 'utf8'));
  }

  async function handleSave(body) {
    if (!Array.isArray(body.slides) || !body.slides.length) {
      throw new HttpError(400, 'a deck needs at least one slide');
    }
    const file = await deckFile(body.path);
    return withLock(file, async () => {
      const source = await fs.readFile(file, 'utf8');
      if (hash(source) !== body.rev) {
        throw new HttpError(409, 'file changed on disk', stateOf(source));
      }
      const deck = parseDeck(source);
      const byHash = new Map();
      deck.units.forEach((u) => { if (!byHash.has(u.hash)) byHash.set(u.hash, u); });
      const indent = deck.units.length ? deck.units[0].indent : '';
      const units = body.slides.map((s) => {
        const old = s.hash ? byHash.get(s.hash) : null;
        if (typeof s.html !== 'string') {
          if (!old) throw new HttpError(409, 'unknown slide ' + s.hash, stateOf(source));
          return old;
        }
        return {
          label: old ? old.label : '',
          indent: old ? old.indent : indent,
          section: s.html,
          hash: hash(s.html)
        };
      });
      const updated = buildDeck({ prefix: deck.prefix, suffix: deck.suffix, units });
      await write(file, updated);
      if (!quiet) console.log('saved  %s (%d slides)', urlOf(file), units.length);
      return { rev: hash(updated), slides: units.map((u) => u.hash) };
    });
  }

  async function handleHead(body) {
    const file = await deckFile(body.path);
    return withLock(file, async () => {
      const source = await fs.readFile(file, 'utf8');
      if (hash(source) !== body.rev) {
        throw new HttpError(409, 'file changed on disk', stateOf(source));
      }
      const deck = parseDeck(source);
      let prefix = deck.prefix;
      if (body.theme) {
        if (!(await listThemes()).includes(body.theme)) throw new HttpError(400, 'unknown theme');
        prefix = prefix.replace(/(hs\/themes\/)[\w-]+(\.css)/, '$1' + body.theme + '$2');
      }
      if (body.deck && typeof body.deck === 'object') {
        prefix = prefix.replace(/<main\b[^>]*\bid\s*=\s*["']deck["'][^>]*>/i, (tag) => {
          for (const [name, value] of Object.entries(body.deck)) {
            if (!/^[a-z][\w-]*$/i.test(name)) continue;
            tag = tag.replace(new RegExp('\\s+' + name + '(?:\\s*=\\s*(?:"[^"]*"|\'[^\']*\'))?(?=[\\s>])', 'i'), '');
            if (value != null && value !== '') {
              const escaped = String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
              tag = tag.replace(/>$/, ' ' + name + '="' + escaped + '">');
            }
          }
          return tag;
        });
      }
      const updated = prefix + source.slice(deck.prefix.length);
      await write(file, updated);
      const next = parseDeck(updated);
      return { rev: hash(updated), head: next.head };
    });
  }

  async function handleAsset(req, url) {
    const file = await deckFile(url.searchParams.get('path'));
    const dir = path.join(path.dirname(file), 'assets');
    const raw = path.basename(url.searchParams.get('name') || 'image.png');
    const ext = path.extname(raw).toLowerCase();
    if (!MIME[ext] || ext === '.html' || ext === '.js' || ext === '.mjs') {
      throw new HttpError(400, 'unsupported asset type ' + ext);
    }
    const stem = path.basename(raw, path.extname(raw))
      .replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset';
    const data = await readBody(req, MAX_ASSET);
    await fs.mkdir(dir, { recursive: true });
    let name = stem + ext;
    for (let n = 2; ; n++) {
      const existing = await fs.readFile(path.join(dir, name)).catch(() => null);
      if (!existing || existing.equals(data)) break;
      name = stem + '-' + n + ext;
    }
    await fs.writeFile(path.join(dir, name), data);
    if (!quiet) console.log('asset  %s', urlOf(path.join(dir, name)));
    return { url: 'assets/' + name };
  }

  /* ---- file watching ---- */

  const pending = new Map();
  function onFsEvent(base, filename) {
    if (!filename) return;
    const parts = filename.split(path.sep);
    if (parts.some((p) => p === 'node_modules' || (p.startsWith('.') && p !== '.'))) return;
    const file = path.join(base, filename);
    clearTimeout(pending.get(file));
    pending.set(file, setTimeout(async () => {
      pending.delete(file);
      const ext = path.extname(file).toLowerCase();
      const inRoot = file === root || file.startsWith(root + path.sep);
      if (ext === '.html' && inRoot) {
        const text = await fs.readFile(file, 'utf8').catch(() => null);
        if (text == null || hash(text) === ownWrites.get(file)) return;
        send('deck', { path: urlOf(file) });
      } else if (ext === '.css') {
        send('css', { path: inRoot ? urlOf(file) : path.basename(file) });
      } else if (IMAGE_EXT.test(file)) {
        if (inRoot) send('asset', { path: urlOf(file) });
      } else if (ext === '.js' || ext === '.mjs') {
        send('reload', {});
      }
    }, 60));
  }

  const watchers = [];
  const watchDir = (dir) => {
    try {
      watchers.push(watch(dir, { recursive: true }, (_e, name) => onFsEvent(dir, name)));
    } catch (err) {
      console.warn('watch unavailable for %s: %s', dir, err.message);
    }
  };
  watchDir(root);
  if (!(FRAMEWORK === root || FRAMEWORK.startsWith(root + path.sep))) {
    for (const sub of ['runtime', 'design', 'editor']) watchDir(path.join(FRAMEWORK, sub));
  }

  /* ---- static ---- */

  async function listing(dir, urlPath) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const decks = [];
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      if (e.isDirectory()) {
        const has = await fs.stat(path.join(dir, e.name, 'index.html')).catch(() => null);
        if (has) decks.push(e.name + '/');
      } else if (e.name.endsWith('.html')) {
        decks.push(e.name);
      }
    }
    const items = decks.map((d) => '<li><a href="' + encodeURI(d) + '">' + d + '</a></li>').join('');
    return '<!doctype html><meta charset="utf-8"><title>html-slide</title>' +
      '<style>body{font:16px/1.7 system-ui;background:#111;color:#ddd;padding:48px}' +
      'a{color:#8ab4ff;text-decoration:none}a:hover{text-decoration:underline}' +
      'h1{font-size:15px;font-weight:600;color:#888;letter-spacing:.08em}</style>' +
      '<h1>DECKS IN ' + urlPath + '</h1><ul>' + (items || '<li>none</li>') + '</ul>';
  }

  async function serveStatic(req, res, urlPath) {
    const reply = (status, type, data) => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(data);
    };

    if (urlPath.startsWith('/__hs/editor/')) {
      const file = path.join(FRAMEWORK, 'editor', path.basename(urlPath));
      const data = await fs.readFile(file).catch(() => null);
      if (!data) return reply(404, 'text/plain', 'not found');
      return reply(200, MIME[path.extname(file)] || 'application/octet-stream', data);
    }

    let file = resolveFile(urlPath);
    if (!file) return reply(403, 'text/plain', 'forbidden');
    let stat = await fs.stat(file).catch(() => null);

    if (stat && stat.isDirectory()) {
      if (!urlPath.endsWith('/')) {
        res.writeHead(301, { Location: urlPath + '/' }).end();
        return;
      }
      const index = path.join(file, 'index.html');
      if (await fs.stat(index).catch(() => null)) {
        file = index;
        stat = true;
      } else {
        return reply(200, MIME['.html'], await listing(file, urlPath));
      }
    }

    if (!stat) {
      /* A deck without a vendored hs/ gets the live framework. */
      const fw = urlPath.match(FRAMEWORK_FILE);
      if (fw) {
        if (fw[1] === 'hs.js') return reply(200, MIME['.js'], await bundleJs());
        if (fw[1] === 'hs.css') return reply(200, MIME['.css'], await bundleCss());
        const theme = await fs.readFile(themeFile(fw[2])).catch(() => null);
        if (theme) return reply(200, MIME['.css'], theme);
      }
      return reply(404, 'text/plain', 'not found: ' + urlPath);
    }

    const ext = path.extname(file).toLowerCase();
    let data = await fs.readFile(file);
    if (ext === '.html') {
      let text = data.toString('utf8');
      if (inject && /\bid\s*=\s*["']deck["']/.test(text)) {
        const tag = '<script type="module" src="/__hs/editor/main.js"></script>\n';
        text = /<\/body>/i.test(text) ? text.replace(/<\/body>/i, tag + '</body>') : text + tag;
      }
      data = text;
    }
    reply(200, MIME[ext] || 'application/octet-stream', data);
  }

  /* ---- server ---- */

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const urlPath = url.pathname;
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };

    try {
      if (urlPath === '/__hs/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store',
          'Connection': 'keep-alive'
        });
        res.write('retry: 1000\n\n');
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      if (urlPath === '/__hs/ping') {
        return json(200, { ok: true, version: VERSION, themes: await listThemes() });
      }
      if (urlPath === '/__hs/state') return json(200, await handleState(url));
      if (req.method === 'POST' && urlPath === '/__hs/save') {
        return json(200, await handleSave(JSON.parse(await readBody(req))));
      }
      if (req.method === 'POST' && urlPath === '/__hs/head') {
        return json(200, await handleHead(JSON.parse(await readBody(req))));
      }
      if (req.method === 'POST' && urlPath === '/__hs/asset') {
        return json(200, await handleAsset(req, url));
      }
      await serveStatic(req, res, urlPath);
    } catch (err) {
      if (err instanceof HttpError) {
        return json(err.status, { error: err.message, state: err.body });
      }
      const status = err.code === 'ENOENT' ? 404 : 500;
      json(status, { error: err.message });
    }
  });

  const ready = new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      if (!quiet) {
        console.log('html-slide %s', VERSION);
        console.log('  root  %s', root);
        console.log('  url   http://127.0.0.1:%d/', server.address().port);
      }
      resolve(server.address().port);
    });
  });

  return {
    server,
    ready,
    close() {
      watchers.forEach((w) => w.close());
      for (const res of clients) res.end();
      server.close();
    }
  };
}
