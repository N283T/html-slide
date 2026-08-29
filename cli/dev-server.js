/* Dev server: static files with caching off, live reload over SSE, and
 * the write-back endpoints the in-browser editing UI saves through.
 *
 * GET  /__hs/ping  -> {ok, themes}   lets the front end detect the server
 * POST /__hs/save  {path, index, html}
 *   Replaces the index-th top-level <section class="slide"> in the
 *   served HTML file with the given markup. The browser is the one
 *   that serializes the slide; the server only locates and splices.
 * POST /__hs/ops   {path, op, ...}
 *   Structural operations on the deck source:
 *     {op:'reorder', order:[...]}       new order of slide indices
 *     {op:'delete', index}              remove a slide
 *     {op:'duplicate', index}           copy a slide in place
 *     {op:'insert', index, html}        insert markup after slide index
 *     {op:'set-theme', theme}           swap the theme + font <link>s */

import { createServer } from 'node:http';
import { promises as fs, watch } from 'node:fs';
import path from 'node:path';
import { THEME_FONTS } from './new.js';

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
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8'
};

/* Find the byte ranges of every top-level <section ...class="...slide..."...>
 * in an HTML source. Nested sections are tracked by depth and skipped. */
export function findSlideSections(source) {
  const token = /<section\b[^>]*>|<\/section>/gi;
  const ranges = [];
  const stack = [];
  let match;
  while ((match = token.exec(source)) !== null) {
    if (match[0][1] !== '/') {
      stack.push({ start: match.index, tag: match[0] });
    } else {
      const open = stack.pop();
      if (!open) continue;
      if (stack.length === 0 && /class\s*=\s*["'][^"']*\bslide\b/.test(open.tag)) {
        ranges.push({ start: open.start, end: match.index + match[0].length });
      }
    }
  }
  return ranges;
}

function resolveFile(root, urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  let filePath = path.normalize(path.join(root, clean));
  if (!filePath.startsWith(root)) return null;
  return filePath;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export function startDevServer({ root, port = 8000, quiet = false }) {
  root = path.resolve(root);
  const sseClients = new Set();

  /* ---- file watching -> live reload ---- */

  let reloadTimer = null;
  let suppressUntil = 0;
  try {
    watch(root, { recursive: true }, (_event, filename) => {
      if (!filename || filename.startsWith('.git') || filename.includes('node_modules')) return;
      if (Date.now() < suppressUntil) return;
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        for (const res of sseClients) res.write('event: reload\ndata: {}\n\n');
      }, 120);
    });
  } catch (err) {
    console.warn('watch unavailable, live reload disabled:', err.message);
  }

  /* ---- save endpoint ---- */

  async function handleSave(req, res) {
    try {
      const { path: urlPath, index, html } = JSON.parse(await readBody(req));
      if (typeof html !== 'string' || !Number.isInteger(index)) {
        throw new Error('bad payload');
      }
      let filePath = resolveFile(root, urlPath || '/');
      if (!filePath) throw new Error('path outside root');
      const stat = await fs.stat(filePath).catch(() => null);
      if (stat && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
      const source = await fs.readFile(filePath, 'utf8');
      const ranges = findSlideSections(source);
      if (index < 0 || index >= ranges.length) {
        throw new Error('slide ' + index + ' not found (' + ranges.length + ' slides in file)');
      }
      const { start, end } = ranges[index];
      const updated = source.slice(0, start) + html + source.slice(end);
      /* Our own write should not bounce every connected browser. */
      suppressUntil = Date.now() + 500;
      await fs.writeFile(filePath, updated, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
      console.log('saved slide %d -> %s', index + 1, path.relative(root, filePath));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end(err.message);
    }
  }

  /* ---- structural ops ---- */

  function spliceAll(source, ranges, contents) {
    let out = '';
    let pos = 0;
    ranges.forEach((r, i) => {
      out += source.slice(pos, r.start) + contents[i];
      pos = r.end;
    });
    return out + source.slice(pos);
  }

  async function resolveHtmlFile(urlPath) {
    let filePath = resolveFile(root, urlPath || '/');
    if (!filePath) throw new Error('path outside root');
    const stat = await fs.stat(filePath).catch(() => null);
    if (stat && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    return filePath;
  }

  /* A slide "unit" is the section plus the label comment directly
   * above it (<!-- 3 · results -->), so structural ops move, copy and
   * delete the label together with its slide. */
  function unitStart(source, start, floor) {
    let from = start;
    while (from > floor && /\s/.test(source[from - 1])) from--;
    const head = source.slice(floor, from);
    const label = head.match(/<!--(?:(?!-->)[^])*-->$/);
    if (label) {
      from -= label[0].length;
      while (from > floor && /[ \t]/.test(source[from - 1])) from--;
    }
    return from;
  }

  async function handleOps(req, res) {
    try {
      const body = JSON.parse(await readBody(req));
      const filePath = await resolveHtmlFile(body.path);
      const source = await fs.readFile(filePath, 'utf8');
      const ranges = findSlideSections(source).map((r, i, all) => ({
        start: unitStart(source, r.start, i === 0 ? 0 : all[i - 1].end),
        end: r.end
      }));
      const sections = ranges.map((r) => source.slice(r.start, r.end));
      const inRange = (i) => Number.isInteger(i) && i >= 0 && i < ranges.length;
      let updated;

      switch (body.op) {
        case 'reorder': {
          const order = body.order;
          const valid = Array.isArray(order) && order.length === ranges.length &&
            [...order].sort((a, b) => a - b).every((v, i) => v === i);
          if (!valid) throw new Error('bad order');
          updated = spliceAll(source, ranges, order.map((i) => sections[i]));
          break;
        }
        case 'delete': {
          if (!inRange(body.index)) throw new Error('bad index');
          if (ranges.length === 1) throw new Error('cannot delete the last slide');
          const { start, end } = ranges[body.index];
          /* Swallow surrounding blank lines, and the label comment
           * sitting directly above the slide (if any), so repeated
           * edits do not accrete whitespace or orphaned comments. */
          let head = source.slice(0, start).replace(/\s+$/, '');
          const label = head.match(/<!--(?:(?!-->)[^])*-->$/);
          if (label) head = head.slice(0, head.length - label[0].length).replace(/\s+$/, '');
          const tail = source.slice(end).replace(/^[ \t]*\n(?:[ \t]*\n)*/, '\n');
          updated = head + '\n' + tail;
          break;
        }
        case 'duplicate': {
          if (!inRange(body.index)) throw new Error('bad index');
          const { end } = ranges[body.index];
          updated = source.slice(0, end) + '\n\n' + sections[body.index] + source.slice(end);
          break;
        }
        case 'insert': {
          if (typeof body.html !== 'string') throw new Error('bad payload');
          const end = inRange(body.index) ? ranges[body.index].end : ranges[ranges.length - 1].end;
          updated = source.slice(0, end) + '\n\n' + body.html + source.slice(end);
          break;
        }
        case 'set-theme': {
          const theme = body.theme;
          if (!THEME_FONTS[theme]) throw new Error('unknown theme');
          updated = source
            .replace(/((?:assets\/hs\/|\.\.\/)themes\/)[\w-]+\.css/, '$1' + theme + '.css')
            .replace(/https:\/\/fonts\.googleapis\.com\/css2\?[^"]*/, THEME_FONTS[theme]);
          break;
        }
        default:
          throw new Error('unknown op');
      }

      suppressUntil = Date.now() + 500;
      await fs.writeFile(filePath, updated, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
      console.log('op %s -> %s', body.op, path.relative(root, filePath));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end(err.message);
    }
  }

  /* ---- server ---- */

  const server = createServer(async (req, res) => {
    const urlPath = req.url.split('?')[0];

    if (urlPath === '/__hs/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        'Connection': 'keep-alive'
      });
      res.write('retry: 1000\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    if (urlPath === '/__hs/save' && req.method === 'POST') {
      return handleSave(req, res);
    }

    if (urlPath === '/__hs/ops' && req.method === 'POST') {
      return handleOps(req, res);
    }

    if (urlPath === '/__hs/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, themes: Object.keys(THEME_FONTS) }));
      return;
    }

    let filePath = resolveFile(root, urlPath);
    if (!filePath) {
      res.writeHead(403).end('forbidden');
      return;
    }
    try {
      let stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        if (!urlPath.endsWith('/')) {
          res.writeHead(301, { Location: urlPath + '/' }).end();
          return;
        }
        filePath = path.join(filePath, 'index.html');
      }
      const data = await fs.readFile(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found: ' + urlPath);
    }
  });

  server.listen(port, '127.0.0.1', () => {
    if (quiet) return;
    console.log('html-slide dev server');
    console.log('  root  %s', root);
    console.log('  url   http://127.0.0.1:%d/', server.address().port);
    console.log('  keys  e edit · o overview · t presenter · f fullscreen');
  });

  return server;
}
