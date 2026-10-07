/* html-slide runtime — presentation chrome: overview grid, presenter
 * view, laser pointer, blackout, progress bar and the key help.
 *
 *   o / g  overview        p  presenter window     l  laser
 *   b / .  blackout        ?  help                 Esc  close */
(function () {
  'use strict';

  const HS = window.HS;
  if (!HS || HS.isStatic) return;

  const root = document.documentElement;
  const presenting = function () {
    return HS.state.mode === 'present' || HS.state.mode === 'presenter';
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ---- sync between windows of the same deck ---- */

  const channel = 'BroadcastChannel' in window
    ? new BroadcastChannel('hs:' + location.pathname) : null;

  if (channel) {
    channel.onmessage = function (e) {
      const msg = e.data || {};
      if (msg.hello) {
        channel.postMessage({ index: HS.state.index, step: HS.state.step });
      } else if (typeof msg.index === 'number') {
        HS.go(msg.index, msg.step, { remote: true });
      }
    };
    HS.on('change', function (e) {
      if (!e.remote) channel.postMessage({ index: HS.state.index, step: HS.state.step });
    });
  }

  /* ---- progress bar (opt in with <main id="deck" data-progress>) ---- */

  let progress = null;
  function updateProgress() {
    const wanted = HS.deck.hasAttribute('data-progress');
    if (!wanted) {
      if (progress) { progress.remove(); progress = null; }
      return;
    }
    if (!progress) {
      progress = el('div', 'hs-ui');
      progress.id = 'hs-progress';
      document.body.appendChild(progress);
    }
    const total = HS.slides.length;
    progress.style.transform = 'scaleX(' + (total > 1 ? HS.state.index / (total - 1) : 1) + ')';
  }
  HS.on('change', updateProgress);
  HS.on('refresh', updateProgress);

  /* ---- overview ---- */

  let overview = null;
  let cursor = 0;

  function markCursor() {
    if (!overview) return;
    const items = overview.querySelectorAll('.hs-ov-item');
    items.forEach(function (item, i) { item.classList.toggle('is-current', i === cursor); });
    if (items[cursor]) items[cursor].scrollIntoView({ block: 'nearest' });
  }

  function closeOverview(go) {
    if (!overview) return;
    overview.remove();
    overview = null;
    if (go != null) HS.go(go, 0, { animate: false });
  }

  function openOverview() {
    if (overview) return;
    overview = el('div', 'hs-ui');
    overview.id = 'hs-overview';
    const grid = el('div', 'hs-ov-grid');
    HS.slides.forEach(function (slide, i) {
      const item = el('div', 'hs-ov-item');
      item.appendChild(HS.thumb(slide));
      const cap = el('div', 'hs-ov-cap');
      cap.appendChild(el('b', null, String(i + 1)));
      cap.appendChild(document.createTextNode(HS.titleOf(slide)));
      item.appendChild(cap);
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        closeOverview(i);
      });
      grid.appendChild(item);
    });
    overview.appendChild(grid);
    overview.addEventListener('click', function () { closeOverview(); });
    document.body.appendChild(overview);
    cursor = HS.state.index;
    markCursor();
  }

  /* ---- help ---- */

  let help = null;
  const KEYS = [
    ['→ ↓ Space', '次へ（ステップ → スライド）'],
    ['← ↑', '前へ'],
    ['数字 + Enter', 'そのスライドへ'],
    ['o', '一覧'],
    ['p', '発表者ビューを開く'],
    ['f', 'フルスクリーン'],
    ['l', 'レーザーポインター'],
    ['b', 'ブラックアウト'],
    ['?', 'このヘルプ']
  ];

  function toggleHelp() {
    if (help) { help.remove(); help = null; return; }
    help = el('div', 'hs-ui');
    help.id = 'hs-help';
    const card = el('div', 'hs-help-card');
    card.appendChild(el('h3', null, 'KEYS'));
    const dl = el('dl');
    KEYS.forEach(function (pair) {
      dl.appendChild(el('dt', null, pair[0]));
      dl.appendChild(el('dd', null, pair[1]));
    });
    card.appendChild(dl);
    help.appendChild(card);
    help.addEventListener('click', toggleHelp);
    document.body.appendChild(help);
  }

  /* ---- blackout / laser ---- */

  let blackout = null;
  function toggleBlackout() {
    if (blackout) { blackout.remove(); blackout = null; return; }
    blackout = el('div', 'hs-ui');
    blackout.id = 'hs-blackout';
    blackout.addEventListener('click', toggleBlackout);
    document.body.appendChild(blackout);
  }

  let laser = null;
  function moveLaser(e) {
    if (laser) {
      laser.style.left = e.clientX + 'px';
      laser.style.top = e.clientY + 'px';
    }
  }
  function toggleLaser() {
    if (laser) {
      laser.remove();
      laser = null;
      root.classList.remove('hs-laser');
      removeEventListener('pointermove', moveLaser);
      return;
    }
    laser = el('div', 'hs-ui');
    laser.id = 'hs-laser';
    laser.style.left = '-99px';
    document.body.appendChild(laser);
    root.classList.add('hs-laser');
    addEventListener('pointermove', moveLaser);
  }

  /* ---- presenter view ---- */

  function openPresenter() {
    open(location.pathname + '?presenter' + location.hash, 'hs-presenter', 'width=1280,height=780');
  }

  function initPresenterView() {
    const view = el('div', 'hs-ui');
    view.id = 'hs-pv';
    const bar = el('div', 'hs-pv-bar');
    const timer = el('div', 'hs-pv-timer', '00:00');
    timer.title = 'クリックでリセット';
    const clock = el('div', 'hs-pv-clock');
    const count = el('div', 'hs-pv-count');
    bar.append(timer, clock, count);

    const main = el('div', 'hs-pv-main');
    const side = el('div', 'hs-pv-side');
    const notes = el('div', 'hs-pv-notes');
    view.append(bar, main, side);
    document.body.appendChild(view);

    let started = null;
    timer.addEventListener('click', function () { started = null; tick(); });

    function tick() {
      const now = new Date();
      clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const sec = started ? Math.floor((now - started) / 1000) : 0;
      const mm = String(Math.floor(sec / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      timer.textContent = mm + ':' + ss;
    }
    setInterval(tick, 1000);
    tick();

    function render(e) {
      if (e && e.slideChanged && !started && HS.state.index > 0) started = new Date();
      const list = HS.slides;
      const current = HS.current;
      if (!current) return;
      const next = list[HS.state.index + 1];
      count.replaceChildren(el('b', null, String(HS.state.index + 1)),
        document.createTextNode(' / ' + list.length));
      main.replaceChildren(el('div', 'hs-pv-label', 'CURRENT'), HS.thumb(current, { all: false }));
      notes.innerHTML = HS.notesOf(current);
      side.replaceChildren(
        el('div', 'hs-pv-label', 'NEXT'),
        next ? HS.thumb(next) : el('div', 'hs-pv-end', '最後のスライド'),
        el('div', 'hs-pv-label', 'NOTES'),
        notes
      );
    }
    HS.on('change', render);
    HS.on('refresh', render);
    render();
    if (channel) channel.postMessage({ hello: true });
  }

  /* ---- keys ---- */

  addEventListener('keydown', function (e) {
    if (!presenting()) return;
    const t = e.target;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (overview) {
      const cols = Math.max(1, Math.round(
        overview.querySelector('.hs-ov-grid').clientWidth /
        overview.querySelector('.hs-ov-item').offsetWidth));
      const total = HS.slides.length;
      let handled = true;
      if (e.key === 'Escape' || e.key === 'o' || e.key === 'g') closeOverview();
      else if (e.key === 'Enter' || e.key === ' ') closeOverview(cursor);
      else if (e.key === 'ArrowRight') cursor = Math.min(total - 1, cursor + 1);
      else if (e.key === 'ArrowLeft') cursor = Math.max(0, cursor - 1);
      else if (e.key === 'ArrowDown') cursor = Math.min(total - 1, cursor + cols);
      else if (e.key === 'ArrowUp') cursor = Math.max(0, cursor - cols);
      else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
        markCursor();
      }
      return;
    }

    let handled = true;
    switch (e.key) {
      case 'o': case 'g': openOverview(); break;
      case 'p': if (!HS.flags.presenter) openPresenter(); break;
      case 'l': toggleLaser(); break;
      case 'b': case '.': toggleBlackout(); break;
      case '?': toggleHelp(); break;
      case 'Escape':
        if (help) toggleHelp();
        else if (blackout) toggleBlackout();
        else if (laser) toggleLaser();
        else handled = false;
        break;
      default: handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  HS.on('mode', function () {
    if (!presenting()) {
      closeOverview();
      if (help) toggleHelp();
      if (blackout) toggleBlackout();
      if (laser) toggleLaser();
    }
  });

  HS.present = { openOverview: openOverview, openPresenter: openPresenter, toggleHelp: toggleHelp };

  if (HS.flags.presenter) initPresenterView();
  updateProgress();
})();
