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

  /* Whether a presenter view of this deck is open, so `p` never opens a
   * second one, even after the audience window reloads. */
  let presenterOpen = false;

  if (channel) {
    channel.onmessage = function (e) {
      const msg = e.data || {};
      if (msg.presenter === 'ping') {
        if (HS.flags.presenter) channel.postMessage({ presenter: true });
      } else if (typeof msg.presenter === 'boolean') {
        presenterOpen = msg.presenter;
      } else if (msg.hello) {
        channel.postMessage({ index: HS.state.index, step: HS.state.step });
      } else if (typeof msg.index === 'number') {
        HS.go(msg.index, msg.step, { remote: true });
      }
    };
    HS.on('change', function (e) {
      if (!e.remote) channel.postMessage({ index: HS.state.index, step: HS.state.step });
    });
    if (HS.flags.presenter) {
      channel.postMessage({ presenter: true });
      addEventListener('pagehide', function () { channel.postMessage({ presenter: false }); });
    } else {
      channel.postMessage({ presenter: 'ping' });
    }
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

  /* Chrome drops a page's fullscreen whenever it opens a popup on the
   * same display or focuses another window. So from fullscreen the
   * presenter window opens on another screen (Window Management API),
   * and one that is already open is left alone rather than focused.
   * With a single screen the drop is unavoidable; the audience window
   * then returns to fullscreen on its next key press or click. */
  let presenterWin = null;
  let refullscreen = false;

  async function otherScreen() {
    if (!('getScreenDetails' in window)) return null;
    try {
      const status = await navigator.permissions.query({ name: 'window-management' });
      if (status.state === 'denied') return null;
    } catch (_) { /* not queryable here; getScreenDetails decides */ }
    try {
      const details = await getScreenDetails();
      return details.screens.find(function (s) { return s !== details.currentScreen; }) || null;
    } catch (_) {
      return null;
    }
  }

  async function openPresenter() {
    const url = location.pathname + '?presenter' + location.hash;
    const fullscreen = !!document.fullscreenElement;
    if (presenterOpen || (presenterWin && !presenterWin.closed)) {
      if (fullscreen) {
        toast('発表者ビューは別ウィンドウで開いています');
        return;
      }
      /* An empty URL returns the named window without reloading it; a
       * blank one means the open presenter has another name. */
      if (!presenterWin || presenterWin.closed) presenterWin = open('', 'hs-presenter');
      if (!presenterWin) return;
      if (presenterWin.location.href === 'about:blank') presenterWin.location.replace(url);
      presenterWin.focus();
      return;
    }
    let features = 'width=1280,height=780';
    const other = fullscreen ? await otherScreen() : null;
    if (other) {
      features = 'left=' + other.availLeft + ',top=' + other.availTop +
        ',width=' + other.availWidth + ',height=' + other.availHeight;
    }
    presenterWin = open(url, 'hs-presenter', features);
    if (!presenterWin) {
      toast('発表者ビューを開けませんでした  もう一度 p を押してください');
      return;
    }
    /* Set before the (asynchronous) fullscreenchange, which the editor
     * reads to tell this drop from the presenter leaving fullscreen. */
    if (fullscreen && !other) refullscreen = true;
  }

  function restoreFullscreen(e) {
    if (!refullscreen || !e.isTrusted) return;
    refullscreen = false;
    if (document.fullscreenElement || !presenting()) return;
    if (e.type === 'keydown' && (e.key === 'f' || e.key === 'Escape')) return;
    root.requestFullscreen().catch(function () {});
  }
  addEventListener('keydown', restoreFullscreen, true);
  addEventListener('pointerdown', restoreFullscreen, true);

  let toastEl = null;
  let toastTimer = null;
  function toast(text) {
    if (!toastEl) {
      toastEl = el('div', 'hs-ui');
      toastEl.id = 'hs-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.remove(); toastEl = null; }, 4000);
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

  HS.present = {
    openOverview: openOverview,
    openPresenter: openPresenter,
    toggleHelp: toggleHelp,
    /* true while fullscreen was lost to the presenter popup and will
     * come back on the next input */
    get restoringFullscreen() { return refullscreen; }
  };

  if (HS.flags.presenter) initPresenterView();
  updateProgress();
})();
