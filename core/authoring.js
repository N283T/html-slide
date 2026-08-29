/* Authoring aids: automatic slide numbers and overflow detection.
 * A slide whose content spills past the 1920x1080 canvas gets a red
 * badge naming the overflowing element — the number one authoring
 * mistake is content that silently runs off the bottom. */
(function () {
  'use strict';

  const deck = document.getElementById('deck');
  const D = window.HSDeck;
  if (!deck || !D) return;

  const TOLERANCE_PX = 2;

  /* ---- slide numbers ---- */

  D.slides.forEach(function (slide, index) {
    const off = slide.dataset.pageNumber === 'off' ||
      (slide.classList.contains('layout-title') && slide.dataset.pageNumber !== 'on');
    let marker = slide.querySelector(':scope > .slide-number');
    if (off) {
      if (marker) marker.remove();
      return;
    }
    if (!marker) {
      marker = document.createElement('div');
      marker.className = 'slide-number';
      slide.appendChild(marker);
    }
    marker.textContent = String(index + 1).padStart(2, '0');
  });

  /* ---- overflow detection (active slide only; needs layout) ---- */

  function describe(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList.length) s += '.' + el.classList[0];
    return s;
  }

  function check(slide) {
    slide.querySelectorAll(':scope > .overflow-warning').forEach(function (b) { b.remove(); });
    const slideBox = slide.getBoundingClientRect();
    const offenders = [];
    slide.querySelectorAll('*').forEach(function (el) {
      if (el.closest('.notes')) return;
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return;
      if (box.bottom > slideBox.bottom + TOLERANCE_PX ||
          box.right > slideBox.right + TOLERANCE_PX) {
        if (!offenders.some(function (o) { return o.contains(el); })) offenders.push(el);
      }
    });
    if (offenders.length) {
      const badge = document.createElement('div');
      badge.className = 'overflow-warning';
      badge.textContent = 'overflow: ' + offenders.slice(0, 3).map(describe).join(', ');
      slide.appendChild(badge);
    }
  }

  function checkActive() {
    if (D.state.mode !== 'slide') return;
    requestAnimationFrame(function () { check(D.slides[D.state.index]); });
  }

  D.on('change', checkActive);
  addEventListener('load', checkActive);
  addEventListener('resize', checkActive);
})();
