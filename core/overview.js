/* Overview mode: `o` toggles a clickable grid of every slide.
 * Slides are wrapped in fixed-size .hs-thumb cells and scaled with a
 * transform, so the live DOM is the thumbnail — no captures needed. */
(function () {
  'use strict';

  const deck = document.getElementById('deck');
  const D = window.HSDeck;
  if (!deck || !D) return;

  let open = false;

  function enter() {
    open = true;
    document.body.dataset.mode = 'overview';
    D.state.mode = 'overview';
    D.slides.forEach(function (slide, i) {
      const cell = document.createElement('div');
      cell.className = 'hs-thumb' + (i === D.state.index ? ' is-current' : '');
      deck.insertBefore(cell, slide);
      cell.appendChild(slide);
      const label = document.createElement('div');
      label.className = 'hs-thumb-label';
      label.textContent = (i + 1) + ' · ' + D.titleOf(i);
      cell.appendChild(label);
      cell.addEventListener('click', function () {
        exit();
        D.goto(i, 0);
      });
    });
    const current = deck.querySelector('.hs-thumb.is-current');
    if (current) current.scrollIntoView({ block: 'center' });
  }

  function exit() {
    open = false;
    delete document.body.dataset.mode;
    D.state.mode = 'slide';
    Array.from(deck.querySelectorAll(':scope > .hs-thumb')).forEach(function (cell) {
      const slide = cell.querySelector('.slide');
      deck.insertBefore(slide, cell);
      cell.remove();
    });
    D.rescale();
  }

  addEventListener('keydown', function (e) {
    if (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'o') { open ? exit() : enter(); }
    else if (e.key === 'Escape' && open) exit();
  });
})();
