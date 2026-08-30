/* Presenter console logic. Lives in presenter.html, talks to the deck
 * over a BroadcastChannel. Shows current/next titles, speaker notes,
 * an elapsed clock (starts on first slide change, r resets), a
 * clickable list of slides, prev/next buttons and an overview grid.
 *
 * The overview uses the PNGs written by `html-slide capture`
 * (slide-captures/slide-NN.png, relative to the deck root); a tile
 * whose image is missing shows the slide number and title instead and
 * still navigates. */
(function () {
  'use strict';

  const el = function (id) { return document.getElementById(id); };
  const channel = new BroadcastChannel('html-slide');

  let startedAt = null;
  let titles = [];
  let currentIndex = 0;

  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  setInterval(function () {
    el('clock').textContent = startedAt ? fmt(Date.now() - startedAt) : '00:00';
  }, 500);

  function goto(i) {
    channel.postMessage({ type: 'goto', index: i });
  }

  function renderList() {
    const list = el('list');
    list.innerHTML = '';
    titles.forEach(function (title, i) {
      const li = document.createElement('li');
      li.textContent = (i + 1) + '. ' + title;
      li.className = i === currentIndex ? 'is-current' : '';
      li.addEventListener('click', function () { goto(i); });
      list.appendChild(li);
    });
  }

  /* ---- overview grid ---- */

  const overview = el('overview');

  function overviewOpen() {
    return overview && !overview.hidden;
  }

  function buildOverview() {
    const grid = overview.querySelector('.grid');
    grid.innerHTML = '';
    /* one cache-buster per open, so re-captured slides show fresh */
    const bust = '?t=' + Date.now();
    titles.forEach(function (title, i) {
      const tile = document.createElement('div');
      tile.className = 'tile' + (i === currentIndex ? ' is-current' : '');
      const img = document.createElement('img');
      img.src = 'slide-captures/slide-' + String(i + 1).padStart(2, '0') + '.png' + bust;
      img.alt = '';
      img.addEventListener('error', function () {
        const ph = document.createElement('div');
        ph.className = 'ph';
        ph.textContent = (i + 1) + ' — キャプチャ未作成';
        img.replaceWith(ph);
      });
      const cap = document.createElement('div');
      cap.className = 'cap';
      cap.textContent = (i + 1) + ' · ' + title;
      tile.append(img, cap);
      tile.addEventListener('click', function () {
        goto(i);
        toggleOverview(false);
      });
      grid.appendChild(tile);
    });
  }

  function toggleOverview(force) {
    if (!overview) return;
    const show = force != null ? force : overview.hidden;
    if (show) buildOverview();
    overview.hidden = !show;
    el('btn-overview').classList.toggle('is-on', show);
  }

  function markCurrentTile() {
    if (!overviewOpen()) return;
    overview.querySelectorAll('.tile').forEach(function (tile, i) {
      tile.classList.toggle('is-current', i === currentIndex);
    });
  }

  /* ---- deck messages ---- */

  channel.onmessage = function (e) {
    const msg = e.data || {};
    if (msg.type !== 'state') return;
    if (startedAt === null && msg.index > 0) startedAt = Date.now();
    currentIndex = msg.index;
    titles = msg.titles || titles;
    el('position').textContent = (msg.index + 1) + ' / ' + msg.total;
    el('current-title').textContent = msg.title || '';
    el('next-title').textContent = msg.nextTitle || '— 最後のスライド —';
    el('notes').innerHTML = msg.notes || '<em>このスライドにノートはありません。</em>';
    const bar = document.querySelector('#progress > div');
    if (bar) bar.style.width = ((msg.index + 1) / msg.total * 100) + '%';
    renderNextPreview(msg);
    renderList();
    markCurrentTile();
  };

  /* ---- next-slide preview (uses capture PNGs like the overview) ---- */

  const previewBust = '?t=' + Date.now();

  function renderNextPreview(msg) {
    const frame = document.getElementById('np-frame');
    if (!frame) return;
    frame.innerHTML = '';
    const next = msg.index + 1;
    if (next >= msg.total) {
      const ph = document.createElement('div');
      ph.className = 'np-ph';
      ph.textContent = '— 最後のスライド —';
      frame.appendChild(ph);
      return;
    }
    const img = document.createElement('img');
    img.src = 'slide-captures/slide-' + String(next + 1).padStart(2, '0') + '.png' + previewBust;
    img.alt = '';
    img.addEventListener('error', function () {
      const ph = document.createElement('div');
      ph.className = 'np-ph';
      ph.textContent = (next + 1) + ' · ' + (msg.nextTitle || '');
      img.replaceWith(ph);
    });
    frame.appendChild(img);
  }

  /* ---- notes font size (persisted) ---- */

  let notesSize = 19;
  try { notesSize = Number(localStorage.getItem('hs-notes-size')) || 19; } catch (_) {}

  function applyNotesSize(delta) {
    notesSize = Math.max(14, Math.min(34, notesSize + (delta || 0)));
    el('notes').style.fontSize = notesSize + 'px';
    try { localStorage.setItem('hs-notes-size', String(notesSize)); } catch (_) {}
  }
  applyNotesSize(0);
  el('btn-notes-minus').addEventListener('click', function () { applyNotesSize(-2); });
  el('btn-notes-plus').addEventListener('click', function () { applyNotesSize(2); });

  el('btn-reset').addEventListener('click', function () { startedAt = Date.now(); });

  /* ---- controls ---- */

  el('btn-first').addEventListener('click', function () { goto(0); });
  el('btn-last').addEventListener('click', function () {
    goto(Math.max(0, titles.length - 1));
  });
  el('btn-prev').addEventListener('click', function () {
    goto(Math.max(0, currentIndex - 1));
  });
  el('btn-next').addEventListener('click', function () {
    goto(currentIndex + 1);
  });
  el('btn-overview').addEventListener('click', function () {
    toggleOverview();
  });

  addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      goto(currentIndex + 1);
    } else if (e.key === 'ArrowLeft') {
      goto(Math.max(0, currentIndex - 1));
    } else if (e.key === 'Home') {
      goto(0);
    } else if (e.key === 'End') {
      goto(Math.max(0, titles.length - 1));
    } else if (e.key === 'r') {
      startedAt = Date.now();
    } else if (e.key === 'o') {
      toggleOverview();
    } else if (e.key === 'Escape' && overviewOpen()) {
      toggleOverview(false);
    }
  });

  channel.postMessage({ type: 'hello' });
})();
