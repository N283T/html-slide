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

  button('◀', 'Previous (←)', function () { D.prev(); });

  const counter = document.createElement('div');
  counter.className = 'hs-tb-counter';
  bar.appendChild(counter);

  button('▶', 'Next (→)', function () { D.next(); });
  sep();
  const editBtn = button('✎ Edit', 'Edit mode (e)', function (b) {
    if (window.HSEditor) {
      window.HSEditor.toggle();
      b.classList.toggle('is-on', window.HSEditor.isEditing());
    }
  });
  button('▦ Slides', 'Overview (o)', function () {
    if (window.HSOverview) window.HSOverview.toggle();
  });
  button('⌚ Notes', 'Presenter window (t)', function () {
    const url = location.pathname.replace(/[^/]*$/, '') + 'presenter.html';
    open(url, 'hs-presenter', 'width=1100,height=700');
  });
  button('⛶', 'Fullscreen (f)', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  });

  function refresh() {
    counter.textContent = (D.state.index + 1) + ' / ' + D.state.total;
    if (window.HSEditor) editBtn.classList.toggle('is-on', window.HSEditor.isEditing());
  }
  D.on('change', refresh);
  refresh();

  /* ---- server-backed extras ---- */

  if (window.HSServer) {
    window.HSServer.then(function (info) {
      if (!info || !info.ok) return;
      sep();
      button('＋ Slide', 'Insert a new slide after this one', function () {
        if (window.HSGallery) window.HSGallery(D.state.index);
      });
      const themeSel = document.createElement('select');
      themeSel.title = 'Switch theme (rewrites the source file)';
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
          .catch(function (err) { alert('Theme switch failed: ' + err.message); });
      });
      bar.appendChild(themeSel);
    });
  }

  document.body.appendChild(bar);

  /* ---- show on activity, hide when idle ---- */

  let hideTimer = null;
  function poke() {
    bar.classList.add('is-visible');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (bar.matches(':hover')) { poke(); return; }
      bar.classList.remove('is-visible');
    }, 2500);
  }

  addEventListener('mousemove', poke);
  addEventListener('keydown', function () {
    /* keep it out of the way while presenting from the keyboard */
    bar.classList.remove('is-visible');
    clearTimeout(hideTimer);
  });
  poke();
})();
