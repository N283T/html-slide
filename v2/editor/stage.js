/* The stage: selection, the overlay drawn above the slide, and every
 * pointer gesture.
 *
 * A slide mixes two kinds of element, and they are manipulated the way
 * each one actually behaves:
 *   - flow elements keep their place in the layout. Dragging one
 *     reorders it (or moves it into another container); its handles set
 *     a size the layout then honours.
 *   - .free elements are positioned on the canvas. Dragging moves them
 *     and snaps to the canvas, its margins and every other element.
 * Alt-dragging a flow element lifts it out into a free one. */

import { HS, ed, isFree, isArrow, indentFor, fromPath, place } from './core.js';
import { h, isChrome, popover, closeFloating, toast } from './ui.js';
import { mutate, capture, touch, cleanClone } from './sync.js';

export const overlay = h('div', { class: 'hse hse-overlay' });

const active = () => HS.state.mode === 'edit' && !!ed.slide;
const scale = () => HS.view.scale;
const round = Math.round;

/* ================= geometry ================= */

function slideBox() { return ed.slide.getBoundingClientRect(); }

function toSlide(clientX, clientY) {
  const R = slideBox();
  return { x: (clientX - R.left) / scale(), y: (clientY - R.top) / scale() };
}

/* Bounding box of an element in slide coordinates. */
export function rectOf(el) {
  const R = slideBox();
  const r = el.getBoundingClientRect();
  const s = scale();
  return { x: (r.left - R.left) / s, y: (r.top - R.top) / s, w: r.width / s, h: r.height / s };
}

function union(rects) {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return {
    x, y,
    w: Math.max(...rects.map((r) => r.x + r.w)) - x,
    h: Math.max(...rects.map((r) => r.y + r.h)) - y
  };
}

const INLINE_TAGS = new Set(['STRONG', 'EM', 'B', 'I', 'U', 'S', 'SPAN', 'A', 'CODE', 'MARK', 'SUB',
  'SUP', 'BR', 'WBR', 'SMALL', 'KBD', 'TIME', 'CITE', 'ABBR', 'Q', 'HS-COUNT']);

export function isInlineEl(el) {
  if (!INLINE_TAGS.has(el.tagName) || isFree(el)) return false;
  const d = getComputedStyle(el).display;
  return d === 'inline' || d === 'inline-block' || d === 'contents' || d === 'none';
}

const NO_TEXT = new Set(['IMG', 'SVG', 'svg', 'VIDEO', 'AUDIO', 'HR', 'TABLE', 'TBODY', 'THEAD', 'TR',
  'UL', 'OL', 'HS-CHART', 'HS-COUNT', 'IFRAME', 'CANVAS']);

export function canEditText(el) {
  if (!el || NO_TEXT.has(el.tagName) || isArrow(el) || el.closest('hs-chart')) return false;
  return !Array.prototype.some.call(el.children, (c) => !isInlineEl(c) && c.tagName !== 'IMG');
}

/* The element a click at this point means: the deepest block under the
 * pointer. Inline formatting resolves to the block that holds it. */
export function pick(clientX, clientY, exact) {
  const slide = ed.slide;
  let el = document.elementFromPoint(clientX, clientY);
  if (!el || el === slide || !slide.contains(el)) return null;
  if (el.closest('.notes')) return null;
  for (let s = el.closest('svg'); s && slide.contains(s); s = s.parentElement && s.parentElement.closest('svg')) el = s;
  const chart = el.closest('hs-chart');
  if (chart) el = chart;
  if (exact) return el;
  while (el.parentElement !== slide && isInlineEl(el)) el = el.parentElement;
  return el;
}

/* ================= selection ================= */

export function select(els) {
  const next = (els || []).filter((el) => el && el.isConnected);
  if (next.length === ed.sel.length && next.every((el, i) => el === ed.sel[i])) return;
  ed.sel = next;
  ed.emit('select');
}

export function selectParent() {
  const el = ed.sel[0];
  if (!el) return false;
  if (el.parentElement === ed.slide) select([]);
  else select([el.parentElement]);
  return true;
}

export function selectChild() {
  const el = ed.sel[0];
  if (!el) return;
  const child = Array.prototype.find.call(el.children, (c) => !isInlineEl(c));
  if (child) select([child]);
  else if (canEditText(el)) startText(el);
}

export function selectSibling(delta) {
  const el = ed.sel[0];
  const pool = Array.prototype.filter.call((el ? el.parentElement : ed.slide).children,
    (c) => !c.matches('.notes') && !isInlineEl(c));
  if (!pool.length) return;
  const i = el ? pool.indexOf(el) : (delta > 0 ? -1 : 0);
  select([pool[(i + delta + pool.length) % pool.length]]);
}

/* ================= element operations ================= */

const tidy = (el) => {
  if (!el.getAttribute('style')) el.removeAttribute('style');
  if (!el.getAttribute('class')) el.removeAttribute('class');
};

/* Lift a flow element out onto the canvas where it currently sits. */
export function toFree(el) {
  const r = rectOf(el);
  const text = canEditText(el);
  el.classList.add('free');
  el.style.left = round(r.x) + 'px';
  el.style.top = round(r.y) + 'px';
  el.style.width = round(r.w) + 'px';
  if (!text) el.style.height = round(r.h) + 'px';
  ['flex', 'translate', 'align-self'].forEach((p) => el.style.removeProperty(p));
  if (el.parentElement !== ed.slide) {
    ed.slide.append(document.createTextNode('  '), el, document.createTextNode('\n'));
  }
}

export function toFlow(el) {
  el.classList.remove('free');
  ['left', 'top', 'width', 'height', 'rotate'].forEach((p) => el.style.removeProperty(p));
  tidy(el);
}

export function toggleFree() {
  if (!ed.sel.length) return;
  mutate(() => ed.sel.forEach((el) => (isFree(el) ? toFlow(el) : toFree(el))));
  ed.emit('select');
}

export function removeSelected() {
  if (!ed.sel.length) return;
  const els = ed.sel.slice();
  select([]);
  mutate(() => els.forEach((el) => {
    const prev = el.previousSibling;
    if (prev && prev.nodeType === 3 && !prev.data.trim()) prev.remove();
    el.remove();
  }));
}

export function duplicateSelected() {
  if (!ed.sel.length) return;
  const copies = [];
  mutate(() => ed.sel.forEach((el) => {
    const copy = cleanClone(el);
    el.after(document.createTextNode(indentFor(el.parentElement, ed.slide)), copy);
    if (isFree(copy)) {
      copy.style.left = el.offsetLeft + 28 + 'px';
      copy.style.top = el.offsetTop + 28 + 'px';
    }
    copies.push(copy);
  }));
  select(copies);
}

/* Move within the parent's children: reading order for flow elements,
 * stacking order for free ones. */
export function reorder(delta) {
  const el = ed.sel[0];
  if (!el) return;
  const pool = Array.prototype.filter.call(el.parentElement.children, (c) => !c.matches('.notes'));
  const other = pool[pool.indexOf(el) + delta];
  if (!other) return;
  mutate(() => (delta < 0 ? other.before(el) : other.after(el)));
}

export function nudge(dx, dy) {
  if (!ed.sel.length) return;
  mutate(() => ed.sel.forEach((el) => {
    if (isFree(el)) {
      el.style.left = el.offsetLeft + dx + 'px';
      el.style.top = el.offsetTop + dy + 'px';
    } else {
      const parts = (el.style.translate || '0px 0px').split(/\s+/);
      const x = (parseFloat(parts[0]) || 0) + dx;
      const y = (parseFloat(parts[1]) || 0) + dy;
      if (x || y) el.style.translate = x + 'px ' + y + 'px';
      else {
        el.style.removeProperty('translate');
        tidy(el);
      }
    }
  }), { key: 'nudge' });
}

/* Align free elements: to each other when several are selected, to the
 * slide's content box when one is. */
export function align(mode) {
  const els = ed.sel.filter(isFree);
  if (!els.length) return toast('整列は自由配置の要素に使えます（⌥ドラッグで自由配置に）');
  const rects = els.map(rectOf);
  let frame = union(rects);
  if (els.length === 1) {
    const cs = getComputedStyle(ed.slide);
    const pl = parseFloat(cs.paddingLeft) || 0;
    const pt = parseFloat(cs.paddingTop) || 0;
    frame = {
      x: pl, y: pt,
      w: HS.W - pl - (parseFloat(cs.paddingRight) || 0),
      h: HS.H - pt - (parseFloat(cs.paddingBottom) || 0)
    };
  }
  mutate(() => els.forEach((el, i) => {
    const r = rects[i];
    let dx = 0;
    let dy = 0;
    if (mode === 'left') dx = frame.x - r.x;
    if (mode === 'center') dx = frame.x + frame.w / 2 - (r.x + r.w / 2);
    if (mode === 'right') dx = frame.x + frame.w - (r.x + r.w);
    if (mode === 'top') dy = frame.y - r.y;
    if (mode === 'middle') dy = frame.y + frame.h / 2 - (r.y + r.h / 2);
    if (mode === 'bottom') dy = frame.y + frame.h - (r.y + r.h);
    el.style.left = round(el.offsetLeft + dx) + 'px';
    el.style.top = round(el.offsetTop + dy) + 'px';
  }));
}

export function distribute(axis) {
  const els = ed.sel.filter(isFree);
  if (els.length < 3) return toast('等間隔は自由配置の要素を3つ以上選んでください');
  const items = els.map((el) => ({ el, r: rectOf(el) }))
    .sort((a, b) => (axis === 'x' ? a.r.x - b.r.x : a.r.y - b.r.y));
  const size = (r) => (axis === 'x' ? r.w : r.h);
  const pos = (r) => (axis === 'x' ? r.x : r.y);
  const first = items[0].r;
  const last = items[items.length - 1].r;
  const total = items.reduce((sum, it) => sum + size(it.r), 0);
  const gap = (pos(last) + size(last) - pos(first) - total) / (items.length - 1);
  mutate(() => {
    let cursor = pos(first);
    items.forEach((it) => {
      const delta = cursor - pos(it.r);
      if (axis === 'x') it.el.style.left = round(it.el.offsetLeft + delta) + 'px';
      else it.el.style.top = round(it.el.offsetTop + delta) + 'px';
      cursor += size(it.r) + gap;
    });
  });
}

/* ================= text editing ================= */

let textAbort = null;

export function startText(el, event) {
  if (ed.textEl === el) return;
  commitText();
  if (!canEditText(el)) return;
  capture();
  ed.textEl = el;
  select([el]);
  el.setAttribute('contenteditable', 'true');
  el.setAttribute('spellcheck', 'false');
  el.focus({ preventScroll: true });
  const selection = getSelection();
  let placed = false;
  if (event && document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(event.clientX, event.clientY);
    if (range && el.contains(range.startContainer)) {
      selection.removeAllRanges();
      selection.addRange(range);
      placed = true;
    }
  }
  if (!placed) selection.selectAllChildren(el);

  textAbort = new AbortController();
  const opt = { signal: textAbort.signal };
  el.addEventListener('input', () => {
    touch();
    ed.emit('change', { source: 'text' });
  }, opt);
  el.addEventListener('paste', (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  }, opt);
  el.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      commitText();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (el.tagName === 'LI' && !e.shiftKey) splitItem(el);
      else if (el.closest('pre')) document.execCommand('insertText', false, '\n');
      else document.execCommand('insertLineBreak');
    } else if (e.key === 'Tab' && el.closest('pre')) {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
    } else if (e.key === 'Backspace' && el.tagName === 'LI' && !el.textContent) {
      e.preventDefault();
      const prev = el.previousElementSibling;
      commitText();
      if (prev && canEditText(prev)) {
        startText(prev);
        getSelection().collapse(prev, prev.childNodes.length);
      }
    }
  }, opt);
  ed.emit('select');
  requestDraw();
}

function splitItem(li) {
  const next = document.createElement('li');
  if (li.className) next.className = li.className.split(/\s+/).filter((c) => !c.startsWith('hs-')).join(' ');
  tidy(next);
  commitText(true);
  li.after(document.createTextNode(indentFor(li.parentElement, ed.slide)), next);
  touch();
  startText(next);
}

export function commitText(keepEmpty) {
  const el = ed.textEl;
  if (!el) return;
  ed.textEl = null;
  if (textAbort) textAbort.abort();
  el.removeAttribute('contenteditable');
  el.removeAttribute('spellcheck');
  const swap = (from, to) => el.querySelectorAll(from).forEach((old) => {
    const fresh = document.createElement(to);
    fresh.append(...old.childNodes);
    old.replaceWith(fresh);
  });
  swap('b', 'strong');
  swap('i', 'em');
  if (el.lastChild && el.lastChild.nodeName === 'BR' && el.childNodes.length > 1) el.lastChild.remove();
  getSelection().removeAllRanges();
  el.blur();
  if (!keepEmpty && !el.textContent.trim() && !el.querySelector('img, svg') &&
      (isFree(el) || el.tagName === 'LI')) {
    const prev = el.previousSibling;
    if (prev && prev.nodeType === 3 && !prev.data.trim()) prev.remove();
    el.remove();
    ed.sel = ed.sel.filter((s) => s !== el);
  }
  touch();
  ed.emit('select');
  ed.emit('change', {});
}

/* Wrap or unwrap the text selection in an inline element. */
export function format(kind) {
  if (!ed.textEl) return;
  if (kind === 'bold' || kind === 'italic') {
    document.execCommand(kind);
  } else {
    const [tag, cls] = { mark: ['mark'], code: ['code'], accent: ['span', 'accent'] }[kind];
    const selection = getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    let node = range.commonAncestorContainer;
    if (node.nodeType === 3) node = node.parentElement;
    const existing = node.closest(tag + (cls ? '.' + cls : ''));
    if (existing && existing !== ed.textEl && ed.textEl.contains(existing)) {
      existing.replaceWith(...existing.childNodes);
    } else if (!range.collapsed) {
      const wrap = document.createElement(tag);
      if (cls) wrap.className = cls;
      wrap.appendChild(range.extractContents());
      range.insertNode(wrap);
      selection.selectAllChildren(wrap);
    }
  }
  touch();
  ed.emit('change', { source: 'text' });
}

/* ================= review notes ================= */

const cleanNote = (text) => text.replace(/--+/g, '—').replace(/\s+/g, ' ').trim();

export function addNote(el, text) {
  text = cleanNote(text);
  if (!text) return;
  mutate(() => {
    const comment = document.createComment(' @fix: ' + text + ' ');
    if (el === ed.slide) el.append(document.createTextNode('  '), comment, document.createTextNode('\n'));
    else el.before(comment, document.createTextNode(indentFor(el.parentElement, ed.slide)));
  });
}

export function resolveNote(note) {
  mutate(() => {
    const next = note.comment.nextSibling;
    if (next && next.nodeType === 3 && !next.data.trim()) next.remove();
    note.comment.remove();
  });
}

export function openNoteEditor(target, note, at) {
  const area = h('textarea', {
    class: 'hse-input', rows: 3, placeholder: '例: 凡例が図に被っている。右上へ',
    value: note ? note.text : ''
  });
  const done = () => {
    closeFloating();
    setTool('select');
  };
  const submit = () => {
    const text = cleanNote(area.value);
    if (note) {
      if (text) mutate(() => { note.comment.data = ' @fix: ' + text + ' '; });
      else resolveNote(note);
    } else {
      addNote(target, text);
    }
    done();
  };
  area.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
    if (e.key === 'Escape') done();
  });
  const body = h('div', { class: 'hse-note-editor' },
    h('div', { class: 'hse-pop-title' },
      '@fix — ' + (target === ed.slide ? 'スライド全体' : HS.describe(target))),
    area,
    h('div', { class: 'hse-row-end' },
      note ? h('button', {
        class: 'hse-btn', type: 'button', text: '解決して削除',
        onclick: () => { resolveNote(note); done(); }
      }) : null,
      h('button', { class: 'hse-btn is-primary', type: 'button', text: note ? '更新' : '追加', onclick: submit })));
  popover(body, at);
  setTimeout(() => area.focus(), 0);
}

export function setTool(tool) {
  if (ed.tool === tool) return;
  ed.tool = tool;
  document.documentElement.classList.toggle('hse-tool-note', tool === 'note');
  ed.emit('tool');
  requestDraw();
}

/* ================= snapping ================= */

function snapTargets(exclude) {
  const slide = ed.slide;
  const xs = new Set([0, HS.W / 2, HS.W]);
  const ys = new Set([0, HS.H / 2, HS.H]);
  const cs = getComputedStyle(slide);
  const pl = parseFloat(cs.paddingLeft) || 0;
  if (pl) {
    xs.add(pl);
    xs.add(HS.W - (parseFloat(cs.paddingRight) || 0));
    ys.add(parseFloat(cs.paddingTop) || 0);
    ys.add(HS.H - (parseFloat(cs.paddingBottom) || 0));
  }
  let count = 0;
  for (const el of slide.querySelectorAll('*')) {
    if (count > 180) break;
    if (exclude.some((x) => x === el || x.contains(el))) continue;
    if (el.closest('.notes') || isInlineEl(el)) continue;
    const r = rectOf(el);
    if (r.w < 8 || r.h < 8) continue;
    xs.add(r.x); xs.add(r.x + r.w / 2); xs.add(r.x + r.w);
    ys.add(r.y); ys.add(r.y + r.h / 2); ys.add(r.y + r.h);
    count++;
  }
  return { xs: Array.from(xs), ys: Array.from(ys) };
}

function nearest(value, targets, tol) {
  let best = null;
  for (const t of targets) {
    const d = t - value;
    if (Math.abs(d) <= tol && (best == null || Math.abs(d) < Math.abs(best))) best = d;
  }
  return best;
}

/* Snap a rectangle by the given edges. Returns the correction and the
 * guide lines to draw. */
function snapRect(r, targets, xEdges, yEdges) {
  const tol = 6 / scale();
  const px = { l: r.x, c: r.x + r.w / 2, r: r.x + r.w };
  const py = { t: r.y, m: r.y + r.h / 2, b: r.y + r.h };
  let dx = null;
  let dy = null;
  xEdges.forEach((e) => {
    const d = nearest(px[e], targets.xs, tol);
    if (d != null && (dx == null || Math.abs(d) < Math.abs(dx))) dx = d;
  });
  yEdges.forEach((e) => {
    const d = nearest(py[e], targets.ys, tol);
    if (d != null && (dy == null || Math.abs(d) < Math.abs(dy))) dy = d;
  });
  dx = dx || 0;
  dy = dy || 0;
  const hit = (edges, pos, list, d) => {
    const out = [];
    edges.forEach((e) => list.forEach((t) => { if (Math.abs(pos[e] + d - t) < 0.6) out.push(t); }));
    return out;
  };
  return { dx, dy, xs: hit(xEdges, px, targets.xs, dx), ys: hit(yEdges, py, targets.ys, dy) };
}

/* ================= gestures ================= */

let g = null;            /* the gesture in progress */
let gestureId = 0;
let hoverEl = null;
let spaceDown = false;

/* Highlight an element from outside the stage (the layers panel). */
export function setHover(el) {
  if (hoverEl === el) return;
  hoverEl = el;
  requestDraw();
}

function startMove(e) {
  const els = ed.sel.filter(isFree);
  const rects = els.map(rectOf);
  g = {
    type: 'move', key: 'g' + (++gestureId), x0: g.x0, y0: g.y0,
    items: els.map((el) => ({ el, x: el.offsetLeft, y: el.offsetTop })),
    bounds: union(rects),
    targets: snapTargets(els)
  };
}

function doMove(e) {
  let dx = (e.clientX - g.x0) / scale();
  let dy = (e.clientY - g.y0) / scale();
  if (e.shiftKey) {
    if (Math.abs(dx) > Math.abs(dy)) dy = 0;
    else dx = 0;
  }
  g.guides = null;
  if (!(e.metaKey || e.ctrlKey)) {
    const s = snapRect({ x: g.bounds.x + dx, y: g.bounds.y + dy, w: g.bounds.w, h: g.bounds.h },
      g.targets, ['l', 'c', 'r'], ['t', 'm', 'b']);
    dx += s.dx;
    dy += s.dy;
    g.guides = s;
  }
  mutate(() => g.items.forEach((it) => {
    it.el.style.left = round(it.x + dx) + 'px';
    it.el.style.top = round(it.y + dy) + 'px';
  }), { key: g.key, source: 'stage' });
}

function startResize(e, dir) {
  const el = ed.sel[0];
  if (!el) return;
  const base = { dir, el, key: 'g' + (++gestureId), x0: e.clientX, y0: e.clientY };
  if (dir === 'head' || dir === 'tail') {
    const height = el.offsetHeight;
    const angle = (parseFloat(el.style.rotate) || 0) * Math.PI / 180;
    const tail = { x: el.offsetLeft, y: el.offsetTop + height / 2 };
    g = Object.assign(base, {
      type: 'endpoint', height, tail,
      head: { x: tail.x + el.offsetWidth * Math.cos(angle), y: tail.y + el.offsetWidth * Math.sin(angle) },
      targets: snapTargets([el])
    });
  } else if (isFree(el)) {
    g = Object.assign(base, {
      type: 'resize',
      r: { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight },
      media: /^(IMG|VIDEO)$/.test(el.tagName),
      hadHeight: !!el.style.height,
      targets: snapTargets([el])
    });
  } else {
    g = Object.assign(base, {
      type: 'flowsize', w: el.offsetWidth, h: el.offsetHeight,
      media: /^(IMG|VIDEO)$/.test(el.tagName)
    });
  }
  document.documentElement.classList.add('hse-dragging');
}

function doResize(e) {
  const dir = g.dir;
  const dx = (e.clientX - g.x0) / scale();
  const dy = (e.clientY - g.y0) / scale();
  let x1 = g.r.x;
  let y1 = g.r.y;
  let x2 = g.r.x + g.r.w;
  let y2 = g.r.y + g.r.h;
  const west = dir.includes('w');
  const east = dir.includes('e');
  const north = dir.includes('n');
  const south = dir.includes('s');
  if (west) x1 += dx;
  if (east) x2 += dx;
  if (north) y1 += dy;
  if (south) y2 += dy;

  g.guides = null;
  if (!(e.metaKey || e.ctrlKey)) {
    const tol = 6 / scale();
    const guides = { xs: [], ys: [] };
    const sx = west || east ? nearest(west ? x1 : x2, g.targets.xs, tol) : null;
    const sy = north || south ? nearest(north ? y1 : y2, g.targets.ys, tol) : null;
    if (sx != null) {
      if (west) x1 += sx; else x2 += sx;
      guides.xs.push(west ? x1 : x2);
    }
    if (sy != null) {
      if (north) y1 += sy; else y2 += sy;
      guides.ys.push(north ? y1 : y2);
    }
    g.guides = guides;
  }
  if (x2 - x1 < 8) { if (west) x1 = x2 - 8; else x2 = x1 + 8; }
  if (y2 - y1 < 8) { if (north) y1 = y2 - 8; else y2 = y1 + 8; }

  const keep = g.media ? !e.shiftKey : e.shiftKey;
  if (keep) {
    const ratio = g.r.w / g.r.h;
    if (west || east) {
      const nh = (x2 - x1) / ratio;
      if (north) y1 = y2 - nh; else y2 = y1 + nh;
    } else {
      x2 = x1 + (y2 - y1) * ratio;
    }
  }
  const el = g.el;
  mutate(() => {
    el.style.left = round(x1) + 'px';
    el.style.top = round(y1) + 'px';
    el.style.width = round(x2 - x1) + 'px';
    if (g.media && keep) el.style.removeProperty('height');
    else if (north || south || g.hadHeight || g.media) el.style.height = round(y2 - y1) + 'px';
  }, { key: g.key, source: 'stage' });
}

/* Flow elements stay where the layout puts them; the handles only set
 * the size the layout should give them. */
function doFlowSize(e) {
  const dir = g.dir;
  const el = g.el;
  const dx = (e.clientX - g.x0) / scale();
  const dy = (e.clientY - g.y0) / scale();
  const horizontal = dir.includes('e') || dir.includes('w');
  const vertical = dir.includes('n') || dir.includes('s');
  const w = Math.max(16, round(g.w + (dir.includes('w') ? -dx : dx)));
  const hgt = Math.max(16, round(g.h + (dir.includes('n') ? -dy : dy)));
  const pcs = getComputedStyle(el.parentElement);
  const flex = pcs.display.includes('flex');
  const row = flex && pcs.flexDirection.startsWith('row');
  mutate(() => {
    if (horizontal) {
      if (row) el.style.flex = '0 0 ' + w + 'px';
      else el.style.width = w + 'px';
    }
    if (vertical && !(g.media && horizontal)) {
      if (flex && !row) el.style.flex = '0 0 ' + hgt + 'px';
      else el.style.height = hgt + 'px';
    }
  }, { key: g.key, source: 'stage' });
}

function doEndpoint(e) {
  let p = toSlide(e.clientX, e.clientY);
  g.guides = null;
  if (!(e.metaKey || e.ctrlKey)) {
    const tol = 6 / scale();
    const sx = nearest(p.x, g.targets.xs, tol);
    const sy = nearest(p.y, g.targets.ys, tol);
    p = { x: p.x + (sx || 0), y: p.y + (sy || 0) };
    g.guides = { xs: sx != null ? [p.x] : [], ys: sy != null ? [p.y] : [] };
  }
  const movingHead = g.dir === 'head';
  let tail = movingHead ? g.tail : p;
  let head = movingHead ? p : g.head;
  let angle = Math.atan2(head.y - tail.y, head.x - tail.x);
  const length = Math.max(24, Math.hypot(head.x - tail.x, head.y - tail.y));
  if (e.shiftKey) {
    const stepAngle = Math.PI / 12;
    angle = Math.round(angle / stepAngle) * stepAngle;
    if (movingHead) head = { x: tail.x + length * Math.cos(angle), y: tail.y + length * Math.sin(angle) };
    else tail = { x: head.x - length * Math.cos(angle), y: head.y - length * Math.sin(angle) };
  }
  const deg = Math.round(angle * 180 / Math.PI * 10) / 10;
  const el = g.el;
  mutate(() => {
    el.style.left = round(tail.x) + 'px';
    el.style.top = round(tail.y - g.height / 2) + 'px';
    el.style.width = round(length) + 'px';
    if (deg) el.style.rotate = deg + 'deg';
    else el.style.removeProperty('rotate');
  }, { key: g.key, source: 'stage' });
}

/* ---- reordering flow elements ---- */

const LIST_TAGS = new Set(['UL', 'OL']);
const TABLE_PART = 'table, thead, tbody, tr, td, th';

const BIG = '.card, .cols, .bento, .steps, .timeline, .window, table, .takeaway, header, footer';

/* Whether `el` may receive the dragged element. Lists take only list
 * items, and whole components never nest inside a card. */
function isContainer(el, dragged) {
  if (el === ed.slide) return el.getAttribute('data-layout') !== 'split';
  if (el.matches(TABLE_PART) || el.closest('hs-chart, .notes') || isInlineEl(el)) return false;
  const list = LIST_TAGS.has(el.tagName);
  if ((dragged.tagName === 'LI') !== list) return false;
  if (list) return true;
  if (el.matches('.cols, .text, .bento')) return true;
  if (el.matches('.cols > *') && !el.matches('.card')) return true;
  if (dragged.matches(BIG)) return false;
  if (el.matches('.card, header, footer, .bento > *, figure')) return true;
  return !canEditText(el) && Array.prototype.some.call(el.children, (c) => c !== dragged && !isInlineEl(c));
}

function startReorder() {
  const el = g.dragEl;
  g = { type: 'reorder', el, x0: g.x0, y0: g.y0, drop: null };
  el.classList.add('hs-dragging');
}

function doReorder(e) {
  const el = g.el;
  const slide = ed.slide;
  let container = document.elementFromPoint(e.clientX, e.clientY);
  if (!container || !slide.contains(container)) container = slide;
  while (container !== slide && (el.contains(container) || !isContainer(container, el))) {
    container = container.parentElement;
  }
  g.drop = null;
  if (!isContainer(container, el)) return;
  const kids = Array.prototype.filter.call(container.children,
    (c) => c !== el && !isFree(c) && !c.matches('.notes') && !isInlineEl(c));
  const s = scale();
  if (!kids.length) {
    const r = container.getBoundingClientRect();
    g.drop = { container, before: null, line: { x: r.left + 8, y: r.top + 8, w: r.width - 16, h: 3 } };
    return;
  }
  const rects = kids.map((k) => k.getBoundingClientRect());
  let best = 0;
  let bestDist = Infinity;
  rects.forEach((r, i) => {
    const cx = Math.max(r.left, Math.min(e.clientX, r.right));
    const cy = Math.max(r.top, Math.min(e.clientY, r.bottom));
    const d = Math.hypot(e.clientX - cx, e.clientY - cy);
    if (d < bestDist) { bestDist = d; best = i; }
  });
  const r = rects[best];
  const other = rects[best + 1] || rects[best - 1];
  const horizontal = !!other && Math.abs(other.top - r.top) < Math.min(r.height, other.height) / 2 &&
    Math.abs(other.left - r.left) > 4;
  const after = horizontal ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
  const before = after ? kids[best].nextElementSibling : kids[best];
  const neighbour = rects[best + (after ? 1 : -1)];
  const gap = (a, b) => (neighbour ? Math.abs(a - b) / 2 : 6 * s);
  let line;
  if (horizontal) {
    const x = after ? r.right + gap(neighbour && neighbour.left, r.right) : r.left - gap(r.left, neighbour && neighbour.right);
    line = { x: x - 1.5, y: r.top, w: 3, h: r.height };
  } else {
    const y = after ? r.bottom + gap(neighbour && neighbour.top, r.bottom) : r.top - gap(r.top, neighbour && neighbour.bottom);
    line = { x: r.left, y: y - 1.5, w: r.width, h: 3 };
  }
  g.drop = { container, before: before === el ? el.nextElementSibling : before, line };
}

function finishReorder(was) {
  const el = was.el;
  el.classList.remove('hs-dragging');
  tidy(el);
  const drop = was.drop;
  if (!drop) return;
  if (drop.container === el.parentElement && drop.before === el.nextElementSibling) return;
  mutate(() => {
    const prev = el.previousSibling;
    if (prev && prev.nodeType === 3 && !prev.data.trim()) prev.remove();
    place(drop.container, el, drop.before, ed.slide);
  });
}

/* ---- marquee ---- */

function doMarquee(e) {
  const m = {
    l: Math.min(g.x0, e.clientX), t: Math.min(g.y0, e.clientY),
    r: Math.max(g.x0, e.clientX), b: Math.max(g.y0, e.clientY)
  };
  g.box = m;
  if (m.r - m.l < 4 && m.b - m.t < 4) return;
  const found = [];
  const walk = (parent) => {
    for (const el of parent.children) {
      if (el.matches('.notes') || isInlineEl(el)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      if (r.left >= m.l && r.right <= m.r && r.top >= m.t && r.bottom <= m.b) found.push(el);
      else if (r.right > m.l && r.left < m.r && r.bottom > m.t && r.top < m.b) walk(el);
    }
  };
  walk(ed.slide);
  select(g.add.concat(found.filter((el) => !g.add.includes(el))));
}

/* ---- pointer routing ---- */

function onPointerDown(e) {
  if (!active()) return;
  const onOverlay = overlay.contains(e.target);
  if (isChrome(e.target) && !onOverlay) return;
  if (e.button === 1 || (e.button === 0 && spaceDown)) {
    e.preventDefault();
    g = { type: 'pan', x0: e.clientX, y0: e.clientY, px: HS.view.panX, py: HS.view.panY };
    return;
  }
  if (e.button !== 0) return;
  const handle = e.target.closest('[data-handle]');
  if (handle) {
    e.preventDefault();
    startResize(e, handle.dataset.handle);
    return;
  }
  if (onOverlay) return;
  if (ed.textEl) {
    if (ed.textEl.contains(e.target)) return;
    commitText();
  }
  const el = pick(e.clientX, e.clientY, e.metaKey || e.ctrlKey);
  e.preventDefault();
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  if (ed.tool === 'note') {
    openNoteEditor(el || ed.slide, null, { x: e.clientX + 12, y: e.clientY + 12 });
    return;
  }
  if (!el) {
    g = { type: 'marquee', x0: e.clientX, y0: e.clientY, add: e.shiftKey ? ed.sel.slice() : [] };
    if (!e.shiftKey) select([]);
    return;
  }
  const held = ed.sel.find((s) => s === el || s.contains(el));
  g = { type: 'press', el, dragEl: held || el, x0: e.clientX, y0: e.clientY, shift: e.shiftKey, alt: e.altKey };
}

function beginDrag() {
  const el = g.dragEl;
  if (!ed.sel.includes(el)) select(g.shift ? ed.sel.concat(el) : [el]);
  if (el.matches(TABLE_PART)) {
    g.type = 'idle';
    return;
  }
  document.documentElement.classList.add('hse-dragging');
  if (!isFree(el) && g.alt) {
    mutate(() => toFree(el));
    ed.emit('select');
  }
  if (isFree(el)) startMove();
  else startReorder();
}

function onPointerMove(e) {
  if (!active()) return;
  if (!g) {
    const over = isChrome(e.target) ? null : pick(e.clientX, e.clientY, e.metaKey || e.ctrlKey);
    if (over !== hoverEl) {
      hoverEl = over;
      requestDraw();
    }
    return;
  }
  if (g.type === 'press') {
    if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 4) return;
    beginDrag();
  }
  switch (g.type) {
    case 'move': doMove(e); break;
    case 'resize': doResize(e); break;
    case 'flowsize': doFlowSize(e); break;
    case 'endpoint': doEndpoint(e); break;
    case 'reorder': doReorder(e); break;
    case 'marquee': doMarquee(e); break;
    case 'pan':
      HS.view.panX = g.px + e.clientX - g.x0;
      HS.view.panY = g.py + e.clientY - g.y0;
      HS.layout();
      break;
  }
  requestDraw();
}

function onPointerUp() {
  if (!g) return;
  const was = g;
  g = null;
  document.documentElement.classList.remove('hse-dragging');
  if (was.type === 'press') {
    if (was.shift) {
      select(ed.sel.includes(was.el) ? ed.sel.filter((s) => s !== was.el) : ed.sel.concat(was.el));
    } else {
      select([was.el]);
    }
  } else if (was.type === 'reorder') {
    finishReorder(was);
  } else if (was.type === 'move' || was.type === 'resize' || was.type === 'flowsize' || was.type === 'endpoint') {
    ed.emit('change', { source: 'stage-end' });
  }
  requestDraw();
}

function onDblClick(e) {
  if (!active() || isChrome(e.target)) return;
  if (ed.textEl && ed.textEl.contains(e.target)) return;
  const el = pick(e.clientX, e.clientY);
  if (!el) return;
  e.preventDefault();
  if (canEditText(el)) startText(el, e);
  else select([el]);
}

function onWheel(e) {
  if (!active() || isChrome(e.target)) return;
  e.preventDefault();
  const v = HS.view;
  if (e.ctrlKey || e.metaKey) {
    const R = HS.deck.getBoundingClientRect();
    const px = (e.clientX - R.left) / v.scale;
    const py = (e.clientY - R.top) / v.scale;
    v.zoom = Math.max(0.25, Math.min(8, v.zoom * Math.exp(-e.deltaY * 0.012)));
    v.panX = 0;
    v.panY = 0;
    HS.layout();
    const R2 = HS.deck.getBoundingClientRect();
    v.panX = e.clientX - px * v.scale - R2.left;
    v.panY = e.clientY - py * v.scale - R2.top;
  } else {
    v.panX -= e.deltaX;
    v.panY -= e.deltaY;
  }
  HS.layout();
}

export function resetZoom() {
  HS.view.zoom = 1;
  HS.view.panX = 0;
  HS.view.panY = 0;
  HS.layout();
}

export function zoomBy(factor) {
  HS.view.zoom = Math.max(0.25, Math.min(8, HS.view.zoom * factor));
  HS.layout();
}

/* ================= overlay drawing ================= */

let drawQueued = false;

export function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(draw);
}

function boxEl(r, cls, extra) {
  return h('div', Object.assign({
    class: cls,
    style: 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px'
  }, extra || {}));
}

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function draw() {
  drawQueued = false;
  if (!active()) {
    overlay.replaceChildren();
    return;
  }
  const out = [];
  const slide = ed.slide;
  const R = slideBox();
  const s = scale();
  const toClient = (p) => ({ x: R.left + p.x * s, y: R.top + p.y * s });
  const dragging = g && g.type !== 'press' && g.type !== 'idle';

  /* problems found by the audit */
  (ed.issues.get(slide) || []).forEach((issue) => {
    if (issue.level !== 'error' && issue.kind !== 'margin') return;
    const el = issue.path.length ? fromPath(issue.path, slide) : null;
    if (el) out.push(boxEl(el.getBoundingClientRect(), 'hse-issue is-' + issue.level));
  });

  /* step numbers */
  if (!dragging) {
    HS.stepsOf(slide).map.forEach((n, el) => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      out.push(h('div', { class: 'hse-stepchip', style: 'left:' + (r.left - 4) + 'px;top:' + (r.top - 4) + 'px', text: n }));
    });
  }

  /* hover */
  if (!g && hoverEl && hoverEl.isConnected && !ed.sel.includes(hoverEl) && hoverEl !== ed.textEl) {
    const r = hoverEl.getBoundingClientRect();
    out.push(boxEl(r, 'hse-hover' + (ed.tool === 'note' ? ' is-note' : ''),
      { 'data-label': HS.describe(hoverEl) }));
  }

  /* selection */
  const sel = ed.sel.filter((el) => el.isConnected);
  if (sel.length === 1 && sel[0].parentElement !== slide && !dragging) {
    out.push(boxEl(sel[0].parentElement.getBoundingClientRect(), 'hse-parent'));
  }
  sel.forEach((el) => {
    const r = el.getBoundingClientRect();
    const editing = el === ed.textEl;
    const single = sel.length === 1;
    if (single && isArrow(el) && !editing) {
      const height = el.offsetHeight;
      const angle = (parseFloat(el.style.rotate) || 0) * Math.PI / 180;
      const tail = { x: el.offsetLeft, y: el.offsetTop + height / 2 };
      const head = { x: tail.x + el.offsetWidth * Math.cos(angle), y: tail.y + el.offsetWidth * Math.sin(angle) };
      [['tail', tail], ['head', head]].forEach(([name, p]) => {
        const c = toClient(p);
        out.push(h('div', {
          class: 'hse-handle is-round', 'data-handle': name,
          style: 'left:' + c.x + 'px;top:' + c.y + 'px'
        }));
      });
      return;
    }
    const box = boxEl(r, 'hse-box' + (editing ? ' is-text' : '') + (isFree(el) ? ' is-free' : ''));
    if (single && !dragging) {
      box.dataset.label = HS.describe(el) + (isFree(el) ? ' · free' : '');
    }
    if (single && g && (g.type === 'resize' || g.type === 'flowsize' || g.type === 'move')) {
      const rr = rectOf(el);
      box.dataset.size = g.type === 'move'
        ? round(rr.x) + ', ' + round(rr.y)
        : round(rr.w) + ' × ' + round(rr.h);
    }
    out.push(box);
    if (single && !editing && (!g || g.type === 'resize' || g.type === 'flowsize')) {
      const small = r.width < 28 || r.height < 28;
      HANDLES.forEach((dir) => {
        if (small && dir.length === 1) return;
        const x = dir.includes('w') ? r.left : dir.includes('e') ? r.right : r.left + r.width / 2;
        const y = dir.includes('n') ? r.top : dir.includes('s') ? r.bottom : r.top + r.height / 2;
        out.push(h('div', {
          class: 'hse-handle', 'data-handle': dir,
          style: 'left:' + x + 'px;top:' + y + 'px;cursor:' + dir + '-resize'
        }));
      });
    }
  });
  if (sel.length > 1) {
    const rects = sel.map((el) => el.getBoundingClientRect());
    const l = Math.min(...rects.map((r) => r.left));
    const t = Math.min(...rects.map((r) => r.top));
    out.push(boxEl({
      left: l, top: t,
      width: Math.max(...rects.map((r) => r.right)) - l,
      height: Math.max(...rects.map((r) => r.bottom)) - t
    }, 'hse-group'));
  }

  /* gesture feedback */
  if (g && g.guides) {
    g.guides.xs.forEach((x) => {
      out.push(h('div', { class: 'hse-guide', style: 'left:' + (R.left + x * s) + 'px;top:' + R.top + 'px;width:1px;height:' + R.height + 'px' }));
    });
    g.guides.ys.forEach((y) => {
      out.push(h('div', { class: 'hse-guide', style: 'left:' + R.left + 'px;top:' + (R.top + y * s) + 'px;height:1px;width:' + R.width + 'px' }));
    });
  }
  if (g && g.type === 'reorder' && g.drop) {
    const line = g.drop.line;
    out.push(boxEl({ left: line.x, top: line.y, width: line.w, height: line.h }, 'hse-drop'));
    out.push(boxEl(g.drop.container.getBoundingClientRect(), 'hse-dropzone'));
  }
  if (g && g.type === 'marquee' && g.box) {
    out.push(boxEl({ left: g.box.l, top: g.box.t, width: g.box.r - g.box.l, height: g.box.b - g.box.t }, 'hse-marquee'));
  }

  /* review notes */
  HS.notesIn(slide).forEach((note, i) => {
    const onSlide = note.el === slide;
    const r = note.el.getBoundingClientRect();
    out.push(h('button', {
      class: 'hse-pin', type: 'button', title: note.text,
      style: 'left:' + (onSlide ? r.right - 34 : r.right) + 'px;top:' + (onSlide ? r.top + 34 : r.top) + 'px',
      onpointerdown: (e) => {
        e.preventDefault();
        e.stopPropagation();
        openNoteEditor(note.el, note, { x: e.clientX + 12, y: e.clientY + 12 });
      }
    }, String(i + 1)));
  });

  /* format bar while a range of text is selected */
  if (ed.textEl) {
    const selection = getSelection();
    if (selection.rangeCount && !selection.isCollapsed && ed.textEl.contains(selection.anchorNode)) {
      const r = selection.getRangeAt(0).getBoundingClientRect();
      const btn = (label, kind, cls) => h('button', {
        type: 'button', class: cls || '', text: label,
        onpointerdown: (e) => {
          e.preventDefault();
          e.stopPropagation();
          format(kind);
        }
      });
      out.push(h('div', {
        class: 'hse-format',
        style: 'left:' + (r.left + r.width / 2) + 'px;top:' + (r.top - 8) + 'px'
      }, btn('B', 'bold', 'is-b'), btn('I', 'italic', 'is-i'), btn('マーカー', 'mark'),
        btn('色', 'accent', 'is-accent'), btn('</>', 'code', 'is-code')));
    }
  }

  overlay.replaceChildren(...out);
}

/* ================= wiring ================= */

export function initStage() {
  document.body.appendChild(overlay);
  addEventListener('pointerdown', onPointerDown, true);
  addEventListener('pointermove', onPointerMove, true);
  addEventListener('pointerup', onPointerUp, true);
  addEventListener('pointercancel', onPointerUp, true);
  addEventListener('dblclick', onDblClick, true);
  addEventListener('wheel', onWheel, { passive: false, capture: true });
  /* Links, details and the like must not act while editing. */
  addEventListener('click', (e) => {
    if (active() && !isChrome(e.target) && ed.slide.contains(e.target) && !ed.textEl) e.preventDefault();
  }, true);
  addEventListener('keydown', (e) => { if (e.key === ' ' && !ed.textEl) spaceDown = true; }, true);
  addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false; }, true);
  addEventListener('blur', () => { spaceDown = false; });
  document.addEventListener('selectionchange', () => { if (ed.textEl) requestDraw(); });
  addEventListener('resize', requestDraw);
  addEventListener('scroll', requestDraw, true);

  ed.on('select', requestDraw);
  ed.on('change', requestDraw);
  ed.on('slides', requestDraw);
  ed.on('issues', requestDraw);
  HS.on('layout', requestDraw);
  HS.on('mode', requestDraw);
  HS.on('change', (e) => {
    if (HS.state.mode !== 'edit') return;
    if (e.slideChanged) {
      commitText();
      hoverEl = null;
      select([]);
    }
    requestDraw();
  });
  /* Late layout shifts (fonts, images, charts) move things under the
   * overlay without any event; a slow tick keeps it honest. */
  setInterval(() => { if (active() && !g) requestDraw(); }, 400);
}
