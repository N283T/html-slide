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

  /* Typography audit — the two Japanese-typesetting mistakes that are
   * invisible in the source and ugly on screen: a full-width space
   * inside a mono span, and full-width parens around Latin text. */
  function auditText(slide) {
    const problems = [];
    slide.querySelectorAll('code, .mono, pre').forEach(function (el) {
      if (el.textContent.includes('　')) {
        problems.push('U+3000 in ' + describe(el));
      }
    });
    const textish = slide.querySelectorAll('p, li, h1, h2, h3, td, th, figcaption, .subtitle');
    textish.forEach(function (el) {
      if (el.closest('.notes')) return;
      if (/（[\x20-\x7e]+）/.test(el.textContent)) {
        problems.push('full-width parens around Latin in ' + describe(el));
      }
    });
    return problems;
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
    const problems = [];
    if (offenders.length) {
      problems.push('overflow: ' + offenders.slice(0, 3).map(describe).join(', '));
    }
    problems.push.apply(problems, auditText(slide));
    if (problems.length) {
      const badge = document.createElement('div');
      badge.className = 'overflow-warning';
      badge.textContent = problems.slice(0, 3).join(' · ');
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
