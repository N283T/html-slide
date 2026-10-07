/* html-slide runtime core. Exposes window.HS.
 *
 * Navigation, steps, canvas scaling, slide transitions (including the
 * automatic morph of elements two slides share) and the audit that
 * `hs check` and the editor both report from.
 *
 * Classic script on purpose: a deck must open from file://. */
(function () {
  'use strict';

  const root = document.documentElement;
  const deck = document.getElementById('deck');
  if (!deck) return;

  const W = 1920;
  const H = 1080;
  const params = new URLSearchParams(location.search);
  const flags = {
    print: params.has('print'),
    shot: params.has('shot'),
    check: params.has('check'),
    presenter: params.has('presenter')
  };
  const isStatic = flags.print || flags.shot || flags.check;
  if (isStatic) root.classList.add('hs-static');
  if (flags.print) root.classList.add('hs-print');

  const state = { index: 0, step: 0, mode: flags.presenter ? 'presenter' : 'present' };
  const view = { scale: 1, fit: 1, zoom: 1, panX: 0, panY: 0 };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = {};
  let viewport = null;
  let cache = null;

  /* ---- events ---- */

  function on(event, fn) {
    (listeners[event] = listeners[event] || []).push(fn);
    return function off() {
      listeners[event] = (listeners[event] || []).filter(function (f) { return f !== fn; });
    };
  }

  function emit(event, detail) {
    (listeners[event] || []).slice().forEach(function (fn) { fn(detail || {}); });
  }

  /* ---- slides and steps ---- */

  function slides() {
    if (!cache) {
      cache = Array.prototype.filter.call(deck.children, function (el) {
        return el.classList.contains('slide');
      });
    }
    return cache;
  }

  /* data-step="2" reveals at step 2; a bare data-step reveals one step
   * after the previous step element; data-steps on a container makes
   * each of its children a step. */
  function stepsOf(slide) {
    const map = new Map();
    let last = 0;
    slide.querySelectorAll('[data-step], [data-steps] > *').forEach(function (el) {
      const raw = el.getAttribute('data-step');
      const n = raw && !isNaN(raw) ? Number(raw) : last + 1;
      last = n;
      map.set(el, n);
    });
    let count = 0;
    map.forEach(function (n) { if (n > count) count = n; });
    return { map: map, count: count };
  }

  function render() {
    const list = slides();
    list.forEach(function (s, i) { s.classList.toggle('hs-active', i === state.index); });
    const current = list[state.index];
    if (!current) return;
    stepsOf(current).map.forEach(function (n, el) {
      el.classList.toggle('hs-on', n <= state.step);
    });
  }

  function refresh() {
    cache = null;
    const list = slides();
    const footer = deck.getAttribute('data-footer');
    list.forEach(function (s, i) {
      s.setAttribute('data-hs-n', i + 1);
      if (footer) s.setAttribute('data-hs-footer', footer);
      else s.removeAttribute('data-hs-footer');
    });
    state.index = Math.max(0, Math.min(list.length - 1, state.index));
    render();
    emit('refresh');
  }

  /* ---- morph: pair up what two slides have in common ---- */

  const MORPH_CANDIDATES =
    '[data-morph], h1, h2, h3, .kicker, img, figure, .free, .card, .stat, hs-chart, pre, blockquote, li, p';
  const MAX_PAIRS = 28;

  function signature(el) {
    if (el.hasAttribute('data-morph')) return 'm:' + el.getAttribute('data-morph');
    if (el.tagName === 'IMG') return 'img:' + el.getAttribute('src');
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    if (text) return el.tagName + ':' + text.slice(0, 240);
    if (el.classList.contains('free')) return 'free:' + el.className + ':' + (el.style.background || el.style.backgroundColor);
    return null;
  }

  function signatures(slide) {
    const seen = new Map();
    slide.querySelectorAll(MORPH_CANDIDATES).forEach(function (el) {
      if (el.closest('.notes')) return;
      const sig = signature(el);
      if (!sig) return;
      seen.set(sig, seen.has(sig) ? null : el);   /* null = ambiguous */
    });
    return seen;
  }

  function morphPairs(from, to) {
    const a = signatures(from);
    const b = signatures(to);
    const pairs = [];
    a.forEach(function (el, sig) {
      const other = b.get(sig);
      if (!el || !other || pairs.length >= MAX_PAIRS) return;
      const nested = pairs.some(function (p) {
        return p[0].contains(el) || p[1].contains(other);
      });
      if (!nested) pairs.push([el, other]);
    });
    return pairs;
  }

  function setName(el, name) {
    el.style.viewTransitionName = name;
    if (!el.getAttribute('style')) el.removeAttribute('style');
  }

  /* ---- navigation ---- */

  let transitionToken = 0;

  function go(index, step, opts) {
    opts = opts || {};
    const list = slides();
    if (!list.length) return;
    index = Math.max(0, Math.min(list.length - 1, index));
    const target = list[index];
    const count = stepsOf(target).count;
    step = step === 'last' ? count : Math.max(0, Math.min(count, step || 0));
    const from = list[state.index];
    const changed = index !== state.index;
    if (!changed && step === state.step && !opts.force) return;
    const dir = index >= state.index ? 'fwd' : 'back';

    function apply() {
      state.index = index;
      state.step = step;
      render();
    }
    function done() {
      syncHash();
      emit('change', { slideChanged: changed, remote: !!opts.remote });
      if (changed) emit('slide', { remote: !!opts.remote });
    }

    const animate = changed && opts.animate !== false && state.mode === 'present' &&
      !isStatic && !reducedMotion.matches && !!document.startViewTransition;
    const kind = animate
      ? (target.getAttribute('data-transition') || deck.getAttribute('data-transition') || 'morph')
      : 'none';
    if (kind === 'none') {
      apply();
      done();
      return;
    }

    const token = ++transitionToken;
    const pairs = kind === 'morph' ? morphPairs(from, target) : [];
    root.setAttribute('data-hs-vt', kind);
    root.setAttribute('data-hs-dir', dir);
    pairs.forEach(function (p, i) { setName(p[0], 'hs-m' + i); });
    const vt = document.startViewTransition(function () {
      pairs.forEach(function (p, i) {
        setName(p[0], '');
        setName(p[1], 'hs-m' + i);
      });
      apply();
      done();
    });
    /* A skipped transition (hidden tab, a newer one starting) rejects
     * `ready`; the DOM update above has still run. */
    vt.ready.catch(function () {});
    vt.finished.catch(function () {}).then(function () {
      pairs.forEach(function (p) { setName(p[1], ''); });
      if (token === transitionToken) {
        root.removeAttribute('data-hs-vt');
        root.removeAttribute('data-hs-dir');
      }
    });
  }

  function next() {
    const list = slides();
    if (state.step < stepsOf(list[state.index]).count && !isStatic && state.mode !== 'edit') {
      go(state.index, state.step + 1);
    } else if (state.index < list.length - 1) {
      go(state.index + 1, 0);
    }
  }

  function prev() {
    if (state.step > 0 && !isStatic && state.mode !== 'edit') go(state.index, state.step - 1);
    else if (state.index > 0) go(state.index - 1, 'last');
  }

  /* ---- URL (#5 or #5.2 = slide 5, step 2) ---- */

  function readHash() {
    const m = location.hash.match(/^#(\d+)(?:\.(\d+))?/);
    return m ? { index: Number(m[1]) - 1, step: Number(m[2] || 0) } : null;
  }

  function syncHash() {
    const hash = '#' + (state.index + 1) + (state.step ? '.' + state.step : '');
    if (location.hash !== hash) {
      try { history.replaceState(null, '', location.pathname + location.search + hash); }
      catch (_) { /* file:// in some browsers */ }
    }
  }

  addEventListener('hashchange', function () {
    const h = readHash();
    if (h) go(h.index, h.step, { animate: false });
  });

  /* ---- canvas scaling ---- */

  function layout() {
    if (flags.print) return;
    const vp = viewport ? viewport() : { x: 0, y: 0, w: innerWidth, h: innerHeight };
    view.fit = Math.max(0.01, Math.min(vp.w / W, vp.h / H));
    view.scale = view.fit * view.zoom;
    const x = vp.x + (vp.w - W * view.scale) / 2 + view.panX;
    const y = vp.y + (vp.h - H * view.scale) / 2 + view.panY;
    deck.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + view.scale + ')';
    emit('layout');
  }

  function setViewport(fn) {
    viewport = fn;
    layout();
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    root.classList.toggle('hs-edit', mode === 'edit');
    render();
    layout();
    emit('mode');
  }

  addEventListener('resize', layout);

  /* ---- metadata ---- */

  function titleOf(slide) {
    const h = slide.querySelector('h1, h2, h3');
    const text = h ? h.textContent : slide.getAttribute('data-title') || '';
    return text.replace(/\s+/g, ' ').trim();
  }

  function notesOf(slide) {
    const n = slide.querySelector(':scope > .notes');
    return n ? n.innerHTML.trim() : '';
  }

  function describe(el) {
    let s = el.tagName.toLowerCase();
    const classes = Array.prototype.filter.call(el.classList, function (c) {
      return c.indexOf('hs-') !== 0;
    });
    if (classes.length) s += '.' + classes.slice(0, 3).join('.');
    return s;
  }

  function snippet(el, max) {
    const t = el.textContent.replace(/\s+/g, ' ').trim();
    max = max || 40;
    return t.length > max ? t.slice(0, max) + '…' : t;
  }

  /* ---- thumbnails ---- */

  const thumbObserver = new ResizeObserver(function (entries) {
    entries.forEach(function (entry) {
      const clone = entry.target.firstElementChild;
      if (clone) clone.style.transform = 'scale(' + entry.contentRect.width / W + ')';
    });
  });

  /* A scaled, inert copy of a slide. `all: false` keeps the steps as
   * they currently are instead of revealing every one. */
  function thumb(slide, opts) {
    const box = document.createElement('div');
    box.className = 'hs-thumb' + (opts && opts.all === false ? '' : ' hs-all');
    const clone = slide.cloneNode(true);
    clone.classList.add('hs-active');
    clone.inert = true;
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(function (el) { el.removeAttribute('id'); });
    clone.querySelectorAll('video, audio').forEach(function (el) {
      el.removeAttribute('autoplay');
      el.muted = true;
    });
    box.appendChild(clone);
    thumbObserver.observe(box);
    return box;
  }

  /* ---- audit ---- */

  const NOTE = /^\s*@fix:?\s*([^]*?)\s*$/;
  const colorCache = new Map();
  let colorCtx = null;

  function rgba(color) {
    if (colorCache.has(color)) return colorCache.get(color);
    if (!colorCtx) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      colorCtx = canvas.getContext('2d', { willReadFrequently: true });
    }
    colorCtx.clearRect(0, 0, 1, 1);
    colorCtx.fillStyle = '#000';
    colorCtx.fillStyle = color;
    colorCtx.fillRect(0, 0, 1, 1);
    const d = colorCtx.getImageData(0, 0, 1, 1).data;
    const out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    colorCache.set(color, out);
    return out;
  }

  function luminance(c) {
    const f = function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  function over(top, bottom) {
    const a = top.a;
    return {
      r: top.r * a + bottom.r * (1 - a),
      g: top.g * a + bottom.g * (1 - a),
      b: top.b * a + bottom.b * (1 - a),
      a: 1
    };
  }

  /* The colour actually behind an element, or null when a gradient or
   * image is in the way and no honest answer exists. */
  function backdrop(el, slide) {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== 'none') return null;
      const c = rgba(cs.backgroundColor);
      if (c.a > 0.01) {
        layers.push(c);
        if (c.a > 0.99) break;
      }
      if (e === slide) break;
    }
    let result = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) result = over(layers[i], result);
    return result;
  }

  function noteTarget(comment) {
    let n = comment.nextSibling;
    while (n && n.nodeType !== 1) n = n.nextSibling;
    return n || comment.parentElement;
  }

  function notesIn(slide) {
    const out = [];
    const walker = document.createTreeWalker(slide, NodeFilter.SHOW_COMMENT);
    let n;
    while ((n = walker.nextNode())) {
      const m = n.data.match(NOTE);
      if (m) out.push({ comment: n, el: noteTarget(n), text: m[1].replace(/\s+/g, ' ') });
    }
    return out;
  }

  /* Audit one laid-out slide (the active one, or a thumbnail clone).
   * Returns [{kind, level, el, message}]. */
  function audit(slide) {
    const issues = [];
    const R = slide.getBoundingClientRect();
    if (!R.width) return issues;
    const k = R.width / W;
    const padBottom = parseFloat(getComputedStyle(slide).paddingBottom) || 0;
    const flagged = [];
    const add = function (kind, level, el, message) {
      issues.push({ kind: kind, level: level, el: el, message: message });
    };

    notesIn(slide).forEach(function (note) { add('note', 'note', note.el, note.text); });

    const walker = document.createTreeWalker(slide, NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (el) {
        return el.matches('.notes, script, style, template')
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    let el;
    while ((el = walker.nextNode())) {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden') continue;
      const b = {
        l: (r.left - R.left) / k, t: (r.top - R.top) / k,
        r: (r.right - R.left) / k, b: (r.bottom - R.top) / k
      };
      const inFlagged = flagged.some(function (f) { return f.contains(el); });

      if (!inFlagged && !el.closest('[data-bleed]')) {
        const sides = [];
        if (b.l < -2) sides.push('左 ' + Math.round(-b.l));
        if (b.t < -2) sides.push('上 ' + Math.round(-b.t));
        if (b.r > W + 2) sides.push('右 ' + Math.round(b.r - W));
        if (b.b > H + 2) sides.push('下 ' + Math.round(b.b - H));
        if (sides.length) {
          flagged.push(el);
          add('overflow', 'error', el, 'キャンバスからはみ出し（' + sides.join('px, ') + 'px）');
        } else if (el.parentElement === slide && cs.position !== 'absolute' &&
                   el.tagName !== 'FOOTER' && padBottom && b.b > H - padBottom + 4) {
          add('margin', 'warn', el,
            '下の余白に ' + Math.round(b.b - (H - padBottom)) + 'px 食い込み');
        }
      }

      const hasText = Array.prototype.some.call(el.childNodes, function (c) {
        return c.nodeType === 3 && c.data.trim();
      });

      if (hasText && (cs.overflowY === 'hidden' || cs.overflowY === 'clip') &&
          el.scrollHeight > el.clientHeight + 3) {
        add('clipped', 'error', el, 'テキストが切れています');
      }

      if (hasText && el.tagName !== 'SUP' && el.tagName !== 'SUB') {
        const size = parseFloat(cs.fontSize);
        if (size < 18) add('small-text', 'warn', el, '文字が小さい（' + Math.round(size) + 'px）');
        const fg = rgba(cs.color);
        const clipText = (cs.webkitBackgroundClip || cs.backgroundClip) === 'text';
        if (fg.a > 0.5 && !clipText) {
          const bg = backdrop(el, slide);
          if (bg) {
            const l1 = luminance(over(fg, bg));
            const l2 = luminance(bg);
            const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
            if (ratio < 3) {
              add('contrast', 'warn', el, 'コントラスト不足（' + ratio.toFixed(1) + ':1）');
            }
          }
        }
      }

      if (el.tagName === 'IMG' && el.complete && !el.naturalWidth) {
        add('image', 'error', el, '画像を読み込めません: ' + el.getAttribute('src'));
      }
    }
    return issues;
  }

  /* Next paint — or 150ms, since a hidden tab never paints. */
  const frame = function () {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () { resolve(); });
      setTimeout(resolve, 150);
    });
  };

  /* Audit every slide. Returns plain data for `hs check`. */
  function auditAll() {
    return ready.then(async function () {
      const keep = { index: state.index, step: state.step };
      const out = [];
      const list = slides();
      for (let i = 0; i < list.length; i++) {
        go(i, 'last', { animate: false, force: true });
        await frame();
        await frame();
        audit(list[i]).forEach(function (issue) {
          out.push({
            slide: i + 1,
            title: titleOf(list[i]),
            kind: issue.kind,
            level: issue.level,
            message: issue.message,
            target: issue.el === list[i] ? 'slide' : describe(issue.el),
            text: issue.el === list[i] ? '' : snippet(issue.el, 60)
          });
        });
      }
      go(keep.index, keep.step, { animate: false, force: true });
      return out;
    });
  }

  /* ---- input (presentation; the editor owns input in edit mode) ---- */

  let digits = '';

  addEventListener('keydown', function (e) {
    if (state.mode === 'edit' || e.defaultPrevented) return;
    const t = e.target;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^\d$/.test(e.key)) { digits += e.key; return; }
    if (e.key === 'Enter' && digits) {
      go(Number(digits) - 1, 0);
      digits = '';
      e.preventDefault();
      return;
    }
    digits = '';
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case ' ': case 'PageDown': case 'Enter':
        e.preventDefault(); next(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
        e.preventDefault(); prev(); break;
      case 'Home': e.preventDefault(); go(0, 0); break;
      case 'End': e.preventDefault(); go(slides().length - 1, 0); break;
      case 'f':
        if (document.fullscreenElement) document.exitFullscreen();
        else root.requestFullscreen().catch(function () {});
        break;
    }
  });

  const INTERACTIVE = 'a, button, input, textarea, select, summary, label, video, audio, [contenteditable]';

  /* Clicking the outer edges of the screen steps back / forward. */
  addEventListener('click', function (e) {
    if (state.mode !== 'present' || isStatic || e.defaultPrevented) return;
    if (e.target.closest(INTERACTIVE) || e.target.closest('.hs-ui')) return;
    const x = e.clientX / innerWidth;
    if (x > 0.86) next();
    else if (x < 0.14) prev();
  });

  let touch = null;
  addEventListener('touchstart', function (e) {
    if (state.mode !== 'present' || e.touches.length !== 1) return;
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  addEventListener('touchend', function (e) {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) next(); else prev();
  }, { passive: true });

  let idleTimer = null;
  addEventListener('pointermove', function () {
    root.classList.remove('hs-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { root.classList.add('hs-idle'); }, 2500);
  }, { passive: true });

  /* ---- init ---- */

  const ready = Promise.all([
    document.fonts ? document.fonts.ready : null,
    new Promise(function (resolve) {
      if (document.readyState === 'complete') resolve();
      else addEventListener('load', function () { resolve(); });
    })
  ]).then(frame);

  if (flags.presenter) root.classList.add('hs-presenter');
  const initial = readHash();
  refresh();
  if (initial) {
    state.index = Math.max(0, Math.min(slides().length - 1, initial.index));
    state.step = isStatic ? 0 : initial.step;
    render();
  }
  layout();
  root.classList.add('hs-ready');

  window.HS = {
    W: W, H: H,
    deck: deck,
    flags: flags,
    isStatic: isStatic,
    state: state,
    view: view,
    ready: ready,
    get slides() { return slides(); },
    get current() { return slides()[state.index]; },
    on: on, emit: emit,
    go: go, next: next, prev: prev,
    refresh: refresh, render: render, layout: layout,
    setViewport: setViewport, setMode: setMode,
    stepsOf: stepsOf, titleOf: titleOf, notesOf: notesOf,
    describe: describe, snippet: snippet,
    thumb: thumb,
    audit: audit, auditAll: auditAll, notesIn: notesIn
  };

  /* Fire once listeners from the other runtime parts have attached. */
  document.addEventListener('DOMContentLoaded', function () {
    emit('change', { slideChanged: true });
    emit('slide', {});
  });
})();
