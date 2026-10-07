/* Drive whatever Chromium-family browser is installed, over the
 * DevTools protocol — no npm dependency. One browser launch serves a
 * whole command (every screenshot, the PDF, the audit), and the browser
 * is closed explicitly, so nothing depends on headless Chrome deciding
 * to exit on its own. */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Arc.app/Contents/MacOS/Arc',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

async function findChrome() {
  for (const candidate of CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch { /* keep looking */ }
  }
  throw new Error('no Chromium-family browser found — install Chrome or set CHROME_PATH');
}

class Connection {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.handlers = new Set();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const waiter = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (!waiter) return;
        if (msg.error) waiter.reject(new Error(msg.error.message));
        else waiter.resolve(msg.result);
      } else {
        for (const handler of this.handlers) handler(msg);
      }
    });
  }

  send(method, params, sessionId) {
    const id = ++this.nextId;
    this.ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  once(method, sessionId, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.handlers.delete(handler);
        reject(new Error('timed out waiting for ' + method));
      }, timeoutMs || 30000);
      const handler = (msg) => {
        if (msg.method !== method || msg.sessionId !== sessionId) return;
        clearTimeout(timer);
        this.handlers.delete(handler);
        resolve(msg.params);
      };
      this.handlers.add(handler);
    });
  }
}

/* Launch a headless browser. Returns { open(url, viewport), close() }. */
export async function launch() {
  const binary = await findChrome();
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-chrome-'));
  const child = spawn(binary, [
    '--headless=new',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const endpoint = await new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error('browser did not start\n' + log.slice(-400))), 20000);
    child.stderr.on('data', (chunk) => {
      log += chunk;
      const m = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    child.on('exit', () => {
      clearTimeout(timer);
      reject(new Error('browser exited early\n' + log.slice(-400)));
    });
  });

  const ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('cannot connect to the browser')), { once: true });
  });
  const cdp = new Connection(ws);

  async function open(url, viewport) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => cdp.send(method, params, sessionId);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: (viewport && viewport.width) || 1920,
      height: (viewport && viewport.height) || 1080,
      deviceScaleFactor: (viewport && viewport.scale) || 1,
      mobile: false
    });
    const loaded = cdp.once('Page.loadEventFired', sessionId, 45000);
    await send('Page.navigate', { url });
    await loaded;

    return {
      send,
      /* Evaluate an expression in the page; promises are awaited. */
      async evaluate(expression) {
        const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (res.exceptionDetails) {
          const detail = res.exceptionDetails;
          throw new Error((detail.exception && detail.exception.description) || detail.text);
        }
        return res.result.value;
      },
      async screenshot() {
        const res = await send('Page.captureScreenshot', { format: 'png' });
        return Buffer.from(res.data, 'base64');
      },
      async pdf() {
        const res = await send('Page.printToPDF', {
          printBackground: true, preferCSSPageSize: true,
          marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0
        });
        return Buffer.from(res.data, 'base64');
      }
    };
  }

  async function close() {
    await Promise.race([
      cdp.send('Browser.close').catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 2000))
    ]);
    try { ws.close(); } catch { /* already closed */ }
    child.kill('SIGKILL');
    await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  }

  return { open, close };
}
