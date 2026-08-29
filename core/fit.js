/* Auto-fit: an element with `data-fit` shrinks its font-size (never
 * grows it) until its content stops overflowing its box — PowerPoint's
 * "shrink text on overflow", but explicit and per element. Works on
 * anything with a constrained height (the flex .body qualifies).
 * The computed size stays in the DOM only; saving a slide from edit
 * mode will persist it as an inline style like any other tweak. */
(function () {
  'use strict';

  const D = window.HSDeck;
  if (!D) return;

  const MIN_PX = 14;

  function overflows(el) {
    return el.scrollHeight > el.clientHeight + 1 ||
           el.scrollWidth > el.clientWidth + 1;
  }

  function fit(el) {
    el.style.fontSize = el.dataset.fitBase || '';
    if (!overflows(el)) return;
    if (!el.dataset.fitBase) {
      el.dataset.fitBase = getComputedStyle(el).fontSize;
    }
    let size = parseFloat(getComputedStyle(el).fontSize);
    let guard = 40;
    while (overflows(el) && size > MIN_PX && guard-- > 0) {
      size = Math.floor(size * 0.94);
      el.style.fontSize = size + 'px';
    }
  }

  function fitActive() {
    if (D.state.mode !== 'slide') return;
    requestAnimationFrame(function () {
      D.slides[D.state.index].querySelectorAll('[data-fit]').forEach(fit);
    });
  }

  D.on('change', fitActive);
  addEventListener('load', fitActive);
  addEventListener('resize', fitActive);
})();
