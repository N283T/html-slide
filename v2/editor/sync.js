/* Sync with the deck source: serialization, saving, hot merge of
 * outside edits, and undo history.
 *
 * Every slide node carries metadata: the hash of the source it was
 * loaded from and whether it has unsaved edits. A save sends the full
 * slide order; clean slides go as their hash alone, so their source
 * bytes are never rewritten. The server applies a save only if the
 * file is still at the revision this page last saw — otherwise the
 * outside change is merged in first (see merge) and the save retried. */

import { HS, ed, pathOf, fromPath, fromHTML } from './core.js';
import { toast } from './ui.js';

const filePath = location.pathname;
const meta = new WeakMap();
let nextKey = 1;
let rev = null;
let head = null;
let enabled = false;

export const sync = { status: 'saved', detail: '' };

function setStatus(status, detail) {
  if (sync.status === status && sync.detail === (detail || '')) return;
  sync.status = status;
  sync.detail = detail || '';
  ed.emit('sync');
}

function metaOf(node) {
  let m = meta.get(node);
  if (!m) {
    m = { key: nextKey++, hash: null, dirty: true, html: null, stale: true, version: 0 };
    meta.set(node, m);
  }
  return m;
}

/* ---- serialization ---- */

/* A slide as it should be written to disk: runtime state (hs-* classes,
 * data-hs-* attributes) and editing artefacts removed. */
export function cleanClone(node) {
  const clone = node.cloneNode(true);
  const all = [clone, ...clone.querySelectorAll('*')];
  for (const el of all) {
    for (const cls of Array.from(el.classList)) {
      if (cls.startsWith('hs-')) el.classList.remove(cls);
    }
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('data-hs-')) el.removeAttribute(attr.name);
    }
    if (el.hasAttribute('contenteditable')) {
      el.removeAttribute('contenteditable');
      el.removeAttribute('spellcheck');
    }
    if (el.getAttribute('class') === '') el.removeAttribute('class');
    if (el.getAttribute('style') === '') el.removeAttribute('style');
  }
  return clone;
}

/* outerHTML writes a bare attribute as name="". Put it back the way a
 * person writes it, so untouched markup does not change on save. */
const bareAttrs = (html) => html.replace(/<[a-zA-Z][^<>]*>/g,
  (tag) => tag.replace(/(\s(?!alt\b)[\w:-]+)=""/g, '$1'));

export const serialize = (node) => bareAttrs(cleanClone(node).outerHTML);

function htmlOf(node) {
  const m = metaOf(node);
  if (m.stale || m.html == null) {
    m.html = serialize(node);
    m.stale = false;
  }
  return m.html;
}

/* ---- saving ---- */

let saveTimer = 0;
let saving = false;
let structureDirty = false;
let retries = 0;

const anyDirty = () => structureDirty || HS.slides.some((n) => metaOf(n).dirty);

function schedule() {
  if (!enabled) return;
  setStatus('dirty');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 650);
}

export function touch(slide) {
  const m = metaOf(slide || HS.current);
  m.dirty = true;
  m.stale = true;
  m.version++;
  schedule();
}

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

export async function save() {
  clearTimeout(saveTimer);
  if (!enabled) return;
  if (saving) {
    saveTimer = setTimeout(save, 200);
    return;
  }
  if (!anyDirty()) {
    setStatus('saved');
    return;
  }
  const sent = HS.slides.map((node) => {
    const m = metaOf(node);
    return { m, version: m.version, html: m.dirty || !m.hash ? htmlOf(node) : null };
  });
  const hadStructure = structureDirty;
  saving = true;
  structureDirty = false;
  setStatus('saving');
  try {
    const { status, ok, data } = await post('/__hs/save', {
      path: filePath,
      rev,
      slides: sent.map((s) => (s.html == null ? { hash: s.m.hash } : { hash: s.m.hash, html: s.html }))
    });
    if (status === 409 && data.state && retries < 3) {
      retries++;
      structureDirty = hadStructure;
      saving = false;
      merge(data.state);
      return save();
    }
    if (!ok) throw new Error(data.error || 'HTTP ' + status);
    retries = 0;
    rev = data.rev;
    sent.forEach((s, i) => {
      s.m.hash = data.slides[i];
      if (s.m.version === s.version) s.m.dirty = false;
    });
  } catch (err) {
    structureDirty = structureDirty || hadStructure;
    saving = false;
    setStatus('error', err.message);
    return;
  }
  saving = false;
  if (anyDirty()) schedule();
  else setStatus('saved');
}

/* ---- merging outside edits ---- */

/* Make the deck's slides exactly `next`, moving only the nodes that
 * are out of place (re-inserting a node restarts media and charts). */
function applyOrder(next) {
  const keep = new Set(next);
  HS.slides.forEach((n) => { if (!keep.has(n)) n.remove(); });
  let cursor = HS.deck.firstElementChild;
  next.forEach((n) => {
    if (cursor === n) cursor = cursor.nextElementSibling;
    else HS.deck.insertBefore(n, cursor);
  });
}

function created(html, hash) {
  const node = fromHTML(html);
  meta.set(node, { key: nextKey++, hash, dirty: false, html: null, stale: true, version: 0 });
  return node;
}

/* Bring the DOM in line with the file. Slides this page has not
 * touched are reused or replaced by hash; a slide with unsaved local
 * edits keeps the local version. */
function merge(state) {
  if (head != null && state.head !== head) {
    head = state.head;
    if (!anyDirty()) {
      location.reload();
      return;
    }
    toast('スライド以外の部分が外部で変更されました。保存後に再読込してください', 'error');
  }
  const list = HS.slides;
  const current = HS.current;
  const clean = new Map();
  const dirty = [];
  list.forEach((n) => {
    const m = metaOf(n);
    if (m.dirty || !m.hash) dirty.push(n);
    else if (clean.has(m.hash)) clean.get(m.hash).push(n);
    else clean.set(m.hash, [n]);
  });
  const used = new Set();
  let swapped = 0;
  const next = state.slides.map((s) => {
    const pool = clean.get(s.hash);
    if (pool && pool.length) return pool.shift();
    const local = dirty.find((n) => !used.has(n) && metaOf(n).hash === s.hash);
    if (local) {
      used.add(local);
      return local;
    }
    swapped++;
    return created(s.html, s.hash);
  });
  /* Local slides the file does not have: new ones, or edits whose base
   * was changed outside. Keep them where they were. */
  dirty.filter((n) => !used.has(n)).forEach((n) => {
    if (metaOf(n).hash) toast('外部の変更と競合したスライドは、こちらの編集を残しました', 'error');
    metaOf(n).hash = null;
    next.splice(Math.min(list.indexOf(n), next.length), 0, n);
    structureDirty = true;
  });
  applyOrder(next);
  rev = state.rev;
  HS.refresh();
  const index = next.indexOf(current);
  HS.go(index >= 0 ? index : HS.state.index, 0, { animate: false, force: true });
  ed.sel = ed.sel.filter((el) => el.isConnected);
  ed.emit('slides');
  ed.emit('select');
  ed.emit('change', { structural: true });
  if (swapped) toast('外部の変更を反映しました（' + swapped + ' 枚）');
}

async function pull() {
  const res = await fetch('/__hs/state?path=' + encodeURIComponent(filePath));
  if (!res.ok) return;
  const state = await res.json();
  if (state.rev !== rev) merge(state);
}

function listen() {
  const source = new EventSource('/__hs/events');
  source.addEventListener('deck', (e) => {
    const data = JSON.parse(e.data);
    const mine = data.path === filePath || data.path === filePath + 'index.html';
    if (mine && enabled) pull();
  });
  source.addEventListener('css', () => {
    document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      const url = new URL(link.href);
      if (url.origin !== location.origin) return;
      url.searchParams.set('t', Date.now());
      link.href = url.href;
    });
  });
  source.addEventListener('asset', (e) => {
    const changed = JSON.parse(e.data).path;
    document.querySelectorAll('img').forEach((img) => {
      if (new URL(img.src, location.href).pathname !== changed) return;
      fetch(img.src, { cache: 'reload' }).then(() => {
        const src = img.getAttribute('src');
        img.setAttribute('src', '');
        img.setAttribute('src', src);
      });
    });
  });
  source.addEventListener('reload', () => {
    if (!anyDirty()) location.reload();
  });
}

export async function init() {
  listen();
  const res = await fetch('/__hs/state?path=' + encodeURIComponent(filePath));
  if (!res.ok) throw new Error('state: HTTP ' + res.status);
  const state = await res.json();
  const list = HS.slides;
  if (state.slides.length !== list.length) {
    setStatus('error', 'ソースのスライド数（' + state.slides.length + '）と表示（' + list.length + '）が一致しません');
    return false;
  }
  rev = state.rev;
  head = state.head;
  list.forEach((node, i) => {
    meta.set(node, { key: nextKey++, hash: state.slides[i].hash, dirty: false, html: null, stale: true, version: 0 });
  });
  enabled = true;
  return true;
}

addEventListener('beforeunload', (e) => {
  if (enabled && anyDirty()) {
    save();
    e.preventDefault();
  }
});

/* ---- history ---- */

const undoStack = [];
const redoStack = [];
let lastKey = null;
let lastTime = 0;

function snapshot() {
  return {
    slides: HS.slides.map((n) => ({ key: metaOf(n).key, hash: metaOf(n).hash, html: htmlOf(n) })),
    index: HS.state.index,
    sel: ed.slide ? ed.sel.map((el) => pathOf(el, ed.slide)) : []
  };
}

/* Record the state before a change. Calls sharing a key within a short
 * window collapse into one undo step (a drag, a run of nudges). */
export function capture(key) {
  const now = Date.now();
  if (key && key === lastKey && now - lastTime < 1500) {
    lastTime = now;
    return;
  }
  lastKey = key || null;
  lastTime = now;
  undoStack.push(snapshot());
  if (undoStack.length > 120) undoStack.shift();
  redoStack.length = 0;
}

function restore(snap) {
  const byKey = new Map(HS.slides.map((n) => [metaOf(n).key, n]));
  const next = snap.slides.map((s) => {
    const cur = byKey.get(s.key);
    if (cur && htmlOf(cur) === s.html) return cur;
    const node = fromHTML(s.html);
    const old = cur ? metaOf(cur) : null;
    meta.set(node, {
      key: s.key,
      hash: old ? old.hash : s.hash,
      dirty: true,
      html: s.html,
      stale: false,
      version: (old ? old.version : 0) + 1
    });
    return node;
  });
  applyOrder(next);
  structureDirty = true;
  HS.refresh();
  HS.go(snap.index, 0, { animate: false, force: true });
  ed.sel = snap.sel.map((p) => fromPath(p, HS.current)).filter(Boolean);
  ed.textEl = null;
  lastKey = null;
  schedule();
  ed.emit('slides');
  ed.emit('select');
  ed.emit('change', { structural: true });
}

export function undo() {
  if (!undoStack.length) return toast('これ以上戻せません');
  redoStack.push(snapshot());
  restore(undoStack.pop());
}

export function redo() {
  if (!redoStack.length) return toast('やり直す操作がありません');
  undoStack.push(snapshot());
  restore(redoStack.pop());
}

/* ---- mutation entry points ---- */

/* Change the active slide's DOM. opts.key groups a gesture into one
 * undo step; opts.source lets a panel ignore its own change event. */
export function mutate(fn, opts) {
  opts = opts || {};
  capture(opts.key);
  const result = fn();
  touch(opts.slide || HS.current);
  ed.emit('change', { source: opts.source });
  return result;
}

function structural(fn) {
  capture();
  const result = fn();
  structureDirty = true;
  HS.refresh();
  schedule();
  ed.emit('slides');
  ed.emit('change', { structural: true });
  return result;
}

function select(els) {
  ed.sel = els;
  ed.emit('select');
}

export function insertSlide(html, afterIndex) {
  const list = HS.slides;
  if (afterIndex == null) afterIndex = HS.state.index;
  const node = fromHTML(html);
  if (!node || !node.classList.contains('slide')) return null;
  select([]);
  structural(() => {
    metaOf(node);
    HS.deck.insertBefore(node, list[afterIndex + 1] || null);
  });
  HS.go(afterIndex + 1, 0, { animate: false, force: true });
  return node;
}

export function duplicateSlide(index) {
  const node = HS.slides[index];
  if (node) insertSlide(htmlOf(node), index);
}

export function deleteSlide(index) {
  const list = HS.slides;
  if (list.length <= 1) return toast('最後の1枚は削除できません');
  select([]);
  structural(() => list[index].remove());
  HS.go(Math.min(index, HS.slides.length - 1), 0, { animate: false, force: true });
}

export function moveSlide(from, to) {
  const list = HS.slides;
  if (from === to || !list[from] || to < 0 || to >= list.length) return;
  const current = HS.current;
  structural(() => {
    const node = list[from];
    const ref = to > from ? list[to].nextSibling : list[to];
    HS.deck.insertBefore(node, ref);
  });
  HS.go(HS.slides.indexOf(current), 0, { animate: false, force: true });
}

/* ---- deck-level settings (outside any slide; not undoable) ---- */

async function postHead(body) {
  if (!enabled) return;
  if (anyDirty()) await save();
  for (let attempt = 0; attempt < 2; attempt++) {
    const { status, ok, data } = await post('/__hs/head', Object.assign({ path: filePath, rev }, body));
    if (ok) {
      rev = data.rev;
      head = data.head;
      return;
    }
    if (status === 409 && data.state) {
      head = data.state.head;
      merge(data.state);
      continue;
    }
    toast('保存に失敗: ' + (data.error || status), 'error');
    return;
  }
}

export function currentTheme() {
  const link = document.querySelector('link[href*="hs/themes/"]');
  const m = link && link.getAttribute('href').match(/hs\/themes\/([\w-]+)\.css/);
  return m ? m[1] : null;
}

export function setTheme(name) {
  const link = document.querySelector('link[href*="hs/themes/"]');
  if (!link) return toast('テーマの <link> が見つかりません', 'error');
  link.setAttribute('href', link.getAttribute('href').replace(/(hs\/themes\/)[\w-]+(\.css)[^"]*/, '$1' + name + '$2'));
  link.addEventListener('load', () => ed.emit('slides'), { once: true });
  return postHead({ theme: name });
}

export function setDeckAttr(name, value) {
  if (value == null || value === '') HS.deck.removeAttribute(name);
  else HS.deck.setAttribute(name, value);
  HS.refresh();
  ed.emit('slides');
  return postHead({ deck: { [name]: value == null || value === '' ? null : value } });
}

export async function upload(file, name) {
  const url = '/__hs/asset?path=' + encodeURIComponent(filePath) +
    '&name=' + encodeURIComponent(name || file.name || 'image.png');
  const res = await fetch(url, { method: 'POST', body: file });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
  return data.url;
}
