/* Presenter console logic (layout after the openadmet-pxr-slides
 * presenter). Talks to the deck over a BroadcastChannel.
 *
 * Panels: status bar (position, progress, NEXT, elapsed + wall clock,
 * timer start/pause/reset), notes with A−/A＋ (persisted), a slide
 * outline, one row of equal control buttons, and a thumbnail grid
 * overlay fed by `html-slide capture` PNGs — a tile whose image is
 * missing says so and still navigates. */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const channel = new BroadcastChannel('html-slide');

  let titles = [];
  let total = 0;
  let currentIndex = 0;

  function goto(i) {
    channel.postMessage({ type: 'goto', index: i });
  }

  /* ---- timer: manual start/pause/resume, auto-started by the first
   * slide advance so forgetting the button costs nothing ---- */

  const timer = { since: null, base: 0 };

  function elapsedSeconds() {
    return Math.floor(timer.base + (timer.since ? (Date.now() - timer.since) / 1000 : 0));
  }

  function mmss(s) {
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function startTimer() {
    if (!timer.since) timer.since = Date.now();
  }

  function toggleTimer() {
    if (timer.since) {
      timer.base += (Date.now() - timer.since) / 1000;
      timer.since = null;
    } else {
      timer.since = Date.now();
    }
    tick();
  }

  function resetTimer() {
    timer.base = 0;
    if (timer.since) timer.since = Date.now();
    tick();
  }

  function tick() {
    const sec = elapsedSeconds();
    $('elapsed').textContent = mmss(sec);
    const now = new Date();
    $('wallclock').textContent =
      String(now.getHours()).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0');
    $('btn-timer-toggle').textContent =
      timer.since ? '一時停止' : (sec ? '再開' : '開始');
  }

  setInterval(tick, 500);
  $('btn-timer-toggle').addEventListener('click', toggleTimer);
  $('btn-timer-reset').addEventListener('click', resetTimer);

  /* ---- notes font size (persisted) ---- */

  let notesSize = 1.4;
  try { notesSize = Number(localStorage.getItem('hs-notes-size-rem')) || 1.4; } catch (_) {}

  function applyNotesSize(delta) {
    notesSize = Math.max(1.0, Math.min(2.6, Math.round((notesSize + delta) * 10) / 10));
    $('notes').style.fontSize = notesSize + 'rem';
    try { localStorage.setItem('hs-notes-size-rem', String(notesSize)); } catch (_) {}
  }
  applyNotesSize(0);
  $('btn-notes-minus').addEventListener('click', function () { applyNotesSize(-0.1); });
  $('btn-notes-plus').addEventListener('click', function () { applyNotesSize(0.1); });

  /* ---- outline ---- */

  function renderOutline() {
    const outline = $('outline');
    outline.innerHTML = '';
    titles.forEach(function (title, i) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = i === currentIndex ? 'is-current' : '';
      const num = document.createElement('span');
      num.className = 'outline__num';
      num.textContent = String(i + 1).padStart(2, '0');
      const label = document.createElement('span');
      label.className = 'outline__label';
      label.textContent = title;
      b.append(num, label);
      b.addEventListener('click', function () { goto(i); });
      outline.appendChild(b);
    });
    const current = outline.querySelector('.is-current');
    if (current) current.scrollIntoView({ block: 'nearest' });
  }

  /* ---- thumbnail grid ---- */

  const grid = $('grid');
  const bust = '?t=' + Date.now();

  function gridOpen() { return !grid.hidden; }

  function buildGrid() {
    const items = $('grid-items');
    items.innerHTML = '';
    $('grid-note').textContent =
      'html-slide capture の出力（slide-captures/）を表示。無いタイルも番号で移動できます。';
    titles.forEach(function (title, i) {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'thumb' + (i === currentIndex ? ' is-current' : '');
      const img = document.createElement('img');
      img.src = 'slide-captures/slide-' + String(i + 1).padStart(2, '0') + '.png' + bust;
      img.alt = '';
      img.addEventListener('error', function () {
        tile.classList.add('is-missing');
      });
      const missing = document.createElement('div');
      missing.className = 'thumb__missing';
      missing.textContent = 'キャプチャ未作成';
      const label = document.createElement('div');
      label.className = 'thumb__label';
      const num = document.createElement('span');
      num.className = 'thumb__num';
      num.textContent = String(i + 1).padStart(2, '0');
      const text = document.createElement('span');
      text.className = 'thumb__text';
      text.textContent = title;
      label.append(num, text);
      tile.append(img, missing, label);
      tile.addEventListener('click', function () {
        goto(i);
        toggleGrid(false);
      });
      items.appendChild(tile);
    });
  }

  function toggleGrid(force) {
    const show = force != null ? force : grid.hidden;
    if (show) buildGrid();
    grid.hidden = !show;
  }

  function markCurrentThumb() {
    if (!gridOpen()) return;
    grid.querySelectorAll('.thumb').forEach(function (tile, i) {
      tile.classList.toggle('is-current', i === currentIndex);
    });
  }

  $('btn-overview').addEventListener('click', function () { toggleGrid(); });
  $('btn-grid-close').addEventListener('click', function () { toggleGrid(false); });

  /* ---- deck messages ---- */

  channel.onmessage = function (e) {
    const msg = e.data || {};
    if (msg.type !== 'state') return;
    if (msg.index > 0) startTimer();
    currentIndex = msg.index;
    total = msg.total;
    titles = msg.titles || titles;
    $('position').textContent = String(msg.index + 1).padStart(2, '0');
    $('total').textContent = '/ ' + msg.total;
    $('progress').style.width = ((msg.index + 1) / msg.total * 100) + '%';
    $('next-title').textContent = msg.nextTitle || '— 最後のスライド —';
    $('notes-title').textContent = msg.title || '—';
    $('notes').innerHTML = msg.notes || '<em>このスライドにノートはありません。</em>';
    renderOutline();
    markCurrentThumb();
    tick();
  };

  /* ---- controls ---- */

  $('btn-first').addEventListener('click', function () { goto(0); });
  $('btn-last').addEventListener('click', function () { goto(Math.max(0, total - 1)); });
  $('btn-prev').addEventListener('click', function () { goto(Math.max(0, currentIndex - 1)); });
  $('btn-next').addEventListener('click', function () { goto(currentIndex + 1); });

  addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      goto(currentIndex + 1);
    } else if (e.key === 'ArrowLeft') {
      goto(Math.max(0, currentIndex - 1));
    } else if (e.key === 'Home') {
      goto(0);
    } else if (e.key === 'End') {
      goto(Math.max(0, total - 1));
    } else if (e.key === 'r') {
      resetTimer();
    } else if (e.key === 'o') {
      toggleGrid();
    } else if (e.key === 'Escape' && gridOpen()) {
      toggleGrid(false);
    }
  });

  channel.postMessage({ type: 'hello' });
})();
