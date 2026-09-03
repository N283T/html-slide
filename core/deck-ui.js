/* Floating deck toolbar. Appears on mouse movement, fades when idle —
 * every keyboard feature gets a clickable counterpart, and with the
 * dev server connected it adds slide insertion and a live theme
 * switcher (both write back to the source file). */
(function () {
  'use strict';

  const D = window.HSDeck;
  if (!D) return;

  const bar = document.createElement('div');
  bar.id = 'hs-toolbar';

  function button(label, title, fn) {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      fn(b);
    });
    bar.appendChild(b);
    return b;
  }

  function sep() {
    const s = document.createElement('div');
    s.className = 'hs-tb-sep';
    bar.appendChild(s);
  }

  button('◀', '前へ (←)', function () { D.prev(); });

  const counter = document.createElement('div');
  counter.className = 'hs-tb-counter';
  bar.appendChild(counter);

  button('▶', '次へ (→)', function () { D.next(); });
  sep();
  /* Editing ships only with the dev bundle; a built deck has no
   * editor.js, so the button would be dead weight. */
  const editBtn = window.HSEditor && button('✎ 編集', '編集モード (e)', function (b) {
    window.HSEditor.toggle();
    b.classList.toggle('is-on', window.HSEditor.isEditing());
  });
  button('▦ 一覧', 'スライド一覧・管理 (o)', function () {
    if (window.HSOverview) window.HSOverview.toggle();
  });
  button('⌚ ノート', '発表者コンソール (t)', function () {
    const url = location.pathname.replace(/[^/]*$/, '') + 'presenter.html';
    open(url, 'hs-presenter', 'width=1100,height=700');
  });
  button('⛶', 'フルスクリーン (f)', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  });

  /* ---- edge-click navigation (presentation mode only) ---- */

  let edgeNav = true;
  try { edgeNav = localStorage.getItem('hs-edge-nav') !== '0'; } catch (_) {}

  const edgeBtn = button('⇄ 端クリック', '発表モードで画面の左右端クリックによるスライド送りを有効化', function (b) {
    edgeNav = !edgeNav;
    try { localStorage.setItem('hs-edge-nav', edgeNav ? '1' : '0'); } catch (_) {}
    b.classList.toggle('is-on', edgeNav);
  });
  edgeBtn.classList.toggle('is-on', edgeNav);

  addEventListener('click', function (e) {
    if (!edgeNav) return;
    if (window.HSEditor && window.HSEditor.isEditing()) return;
    if (document.body.dataset.mode) return;                    /* overview */
    if (e.target.closest('#hs-toolbar, #hs-editor-panel, #hs-gallery, a, button, canvas')) return;
    const x = e.clientX / innerWidth;
    if (x < 0.15) D.prev();
    else if (x > 0.85) D.next();
  });

  function refresh() {
    counter.textContent = (D.state.index + 1) + ' / ' + D.state.total;
    if (editBtn) editBtn.classList.toggle('is-on', window.HSEditor.isEditing());
  }
  D.on('change', refresh);
  refresh();

  /* ---- server-backed extras ---- */

  if (window.HSServer) {
    window.HSServer.then(function (info) {
      if (!info || !info.ok) return;
      refresh(); /* editor may have auto-entered edit mode by now */
      sep();
      button('＋ スライド', 'このスライドの後に新規スライドを挿入', function () {
        if (window.HSGallery) window.HSGallery(D.state.index);
      });
      const themeSel = document.createElement('select');
      themeSel.title = 'テーマ切替（ソースファイルを書き換えます）';
      const currentTheme = (function () {
        const link = document.querySelector('link[href*="themes/"]');
        const m = link && link.href.match(/themes\/([\w-]+)\.css/);
        return m ? m[1] : null;
      })();
      info.themes.forEach(function (t) {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = '🎨 ' + t;
        if (t === currentTheme) opt.selected = true;
        themeSel.appendChild(opt);
      });
      themeSel.addEventListener('change', function () {
        window.HSOps({ op: 'set-theme', theme: themeSel.value })
          .then(function () { location.reload(); })
          .catch(function (err) { alert('テーマ切替に失敗: ' + err.message); });
      });
      bar.appendChild(themeSel);
    });
  }

  document.body.appendChild(bar);

  /* ---- visibility ----
   * While editing, any mouse movement reveals the bar (idle-hidden
   * after 2s). While presenting, the mouse never summons it — `m`
   * toggles it and it stays until dismissed (m / Esc / any other
   * key), so it can't photobomb the projector. */

  let hideTimer = null;
  let sticky = false;

  function show(stick) {
    sticky = !!stick;
    bar.classList.add('is-visible');
    clearTimeout(hideTimer);
    if (sticky) return;
    hideTimer = setTimeout(function () {
      if (bar.matches(':hover')) { show(); return; }
      hide();
    }, 2000);
  }

  function hide() {
    sticky = false;
    bar.classList.remove('is-visible');
    clearTimeout(hideTimer);
  }

  function isVisible() {
    return bar.classList.contains('is-visible');
  }

  addEventListener('mousemove', function () {
    if (window.HSEditor && window.HSEditor.isEditing()) show();
  });

  addEventListener('keydown', function (e) {
    if (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'm') {
      isVisible() ? hide() : show(true);
      return;
    }
    /* any other key puts it away while presenting from the keyboard */
    hide();
  });

  /* going (or leaving) fullscreen means a mode switch — start hidden */
  addEventListener('fullscreenchange', hide);

  /* visible once at load so the controls are discoverable */
  show();
})();
