/* html-slide runtime — the published viewer (`hs build --viewer`).
 *
 * A deck built for the web keeps everything a reader needs (slides,
 * steps, charts and other interactive parts, keyboard, swipe and
 * edge clicks) and drops the presenter's tools. This adds a small bar:
 * previous, the slide count, next and full screen. It is meant to sit
 * in an <iframe> on any page, and works opened on its own too. */
(function () {
  'use strict';

  const HS = window.HS;
  if (!HS || HS.isStatic || !HS.flags.viewer) return;

  function button(label, title, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hs-vw-btn';
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    /* Keep focus (and the keyboard) on the deck. */
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  const bar = document.createElement('nav');
  bar.className = 'hs-ui hs-vw-bar';
  bar.setAttribute('aria-label', 'スライド操作');
  const prev = button('‹', '前へ (←)', function () { HS.prev(); });
  const next = button('›', '次へ (→)', function () { HS.next(); });
  const count = document.createElement('span');
  count.className = 'hs-vw-count';
  count.setAttribute('aria-live', 'polite');
  const full = button('⛶', '全画面 (f)', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(function () {});
  });
  if (!document.fullscreenEnabled) full.hidden = true;   /* e.g. an iframe without allowfullscreen */
  bar.append(prev, count, next, full);

  function update() {
    const total = HS.slides.length;
    const i = HS.state.index;
    count.textContent = (i + 1) + ' / ' + total;
    prev.disabled = i === 0 && HS.state.step === 0;
    next.disabled = i === total - 1 && HS.state.step >= HS.stepsOf(HS.current).count;
  }

  function mount() {
    document.body.appendChild(bar);
    update();
  }
  HS.on('change', update);
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
