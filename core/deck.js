/* html-slide core runtime.
 * Exposes window.HSDeck: { state, goto, next, prev, on, slides, titleOf, notesOf }.
 * Keyboard: arrows/space navigate, o = overview, t = presenter window,
 * f = fullscreen, e = edit mode (dev server only), Home/End jump. */
(function () {
  'use strict';

  const deck = document.getElementById('deck');
  if (!deck) return;

  const slides = Array.from(deck.querySelectorAll(':scope > .slide'));
  const total = slides.length;
  const state = { index: 0, total, mode: 'slide', fragmentStep: 0 };
  const listeners = {};

  function on(event, fn) {
    (listeners[event] = listeners[event] || []).push(fn);
  }

  function emit(event) {
    (listeners[event] || []).forEach(function (fn) { fn(state); });
  }

  /* ---- fragments ---- */

  function fragmentsIn(slide) {
    return Array.from(slide.querySelectorAll('[data-fragment]'))
      .sort(function (a, b) {
        return Number(a.dataset.fragment) - Number(b.dataset.fragment);
      });
  }

  /* ---- rendering ---- */

  function render() {
    slides.forEach(function (s, i) {
      s.classList.toggle('is-active', i === state.index);
    });
    const active = slides[state.index];
    fragmentsIn(active).forEach(function (el) {
      el.classList.toggle('is-visible',
        Number(el.dataset.fragment) <= state.fragmentStep);
    });
  }

  /* ---- canvas scaling ---- */

  function rescale() {
    if (state.mode === 'overview') return;
    const scale = Math.min(innerWidth / 1920, innerHeight / 1080);
    const x = (innerWidth - 1920 * scale) / 2;
    const y = (innerHeight - 1080 * scale) / 2;
    deck.style.transform =
      'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
    deck.style.top = '0';
    deck.style.left = '0';
  }

  /* ---- URL sync ---- */

  function syncUrl(replace) {
    const params = new URLSearchParams();
    params.set('s', state.index + 1);
    if (state.fragmentStep) params.set('f', state.fragmentStep);
    /* Keep the hash — overview restore (#overview) rides on it. */
    const url = location.pathname + '?' + params.toString() + location.hash;
    if (replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
  }

  function readUrl() {
    const params = new URLSearchParams(location.search);
    const s = Number(params.get('s') || 1) - 1;
    const f = Number(params.get('f') || 0);
    state.index = Math.max(0, Math.min(total - 1, s));
    state.fragmentStep = f;
    if (params.has('capture')) document.body.classList.add('hs-capture');
  }

  /* ---- navigation ---- */

  function goto(i, f) {
    state.index = Math.max(0, Math.min(total - 1, i));
    state.fragmentStep = f || 0;
    render();
    syncUrl(false);
    emit('change');
  }

  function next() {
    const frags = fragmentsIn(slides[state.index]);
    if (state.fragmentStep < frags.length) {
      state.fragmentStep += 1;
      render();
      syncUrl(true);
      emit('change');
    } else if (state.index < total - 1) {
      goto(state.index + 1, 0);
    }
  }

  function prev() {
    if (state.fragmentStep > 0) {
      state.fragmentStep -= 1;
      render();
      syncUrl(true);
      emit('change');
    } else if (state.index > 0) {
      const prevFrags = fragmentsIn(slides[state.index - 1]);
      goto(state.index - 1, prevFrags.length);
    }
  }

  /* Swap the DOM node of slide i (used by the editor's undo/redo).
   * The slides array keeps its identity so every module sees the swap. */
  function replaceSlide(i, el) {
    slides[i].replaceWith(el);
    slides[i] = el;
    render();
    emit('change');
  }

  /* ---- metadata helpers ---- */

  function titleOf(i) {
    const s = slides[i];
    const h = s.querySelector('h1, h2, h3');
    return (h ? h.textContent : s.dataset.title || 'Slide ' + (i + 1)).trim();
  }

  function notesOf(i) {
    const n = slides[i].querySelector(':scope > .notes');
    return n ? n.innerHTML : '';
  }

  /* ---- presenter channel ---- */

  const channel = 'BroadcastChannel' in window
    ? new BroadcastChannel('html-slide')
    : null;

  function broadcast() {
    if (!channel) return;
    channel.postMessage({
      type: 'state',
      index: state.index,
      total: total,
      title: titleOf(state.index),
      nextTitle: state.index + 1 < total ? titleOf(state.index + 1) : null,
      notes: notesOf(state.index),
      titles: slides.map(function (_, i) { return titleOf(i); })
    });
  }

  if (channel) {
    channel.onmessage = function (e) {
      const msg = e.data || {};
      if (msg.type === 'goto') goto(msg.index, 0);
      if (msg.type === 'hello') broadcast();
    };
  }
  on('change', broadcast);

  /* ---- keyboard ---- */

  addEventListener('keydown', function (e) {
    if (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case ' ':
      case 'PageDown':
        e.preventDefault(); next(); break;
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
        e.preventDefault(); prev(); break;
      case 'Home':
        e.preventDefault(); goto(0, 0); break;
      case 'End':
        e.preventDefault(); goto(total - 1, 0); break;
      case 't': {
        const url = location.pathname.replace(/[^/]*$/, '') + 'presenter.html';
        open(url, 'hs-presenter', 'width=1100,height=700');
        break;
      }
      case 'f':
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
        break;
    }
  });

  addEventListener('popstate', function () {
    readUrl();
    render();
    emit('change');
  });

  addEventListener('resize', rescale);

  /* ---- init ---- */

  readUrl();
  render();
  rescale();
  syncUrl(true);
  broadcast();

  window.HSDeck = {
    state: state,
    slides: slides,
    goto: goto,
    next: next,
    prev: prev,
    on: on,
    emit: emit,
    rescale: rescale,
    replaceSlide: replaceSlide,
    titleOf: titleOf,
    notesOf: notesOf
  };
})();
