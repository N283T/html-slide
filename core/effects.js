/* Slide-entrance effects: count-up numbers and animated meters.
 * Both re-fire every time their slide becomes active, so the punch
 * survives going back and forth. Headless capture (PDF/PNG export)
 * gets the final state instantly — nothing renders half-animated. */
(function () {
  'use strict';

  const D = window.HSDeck;
  if (!D) return;

  const instant = navigator.webdriver === true ||
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- data-countup ----
   * <span data-countup>12,400</span> counts from 0 to 12,400.
   * Prefix/suffix around the number (%, ×, −, units) are preserved;
   * comma grouping and decimal places follow the source text.
   * data-duration overrides the default 900ms. */

  function format(value, decimals, grouped) {
    if (!grouped) return value.toFixed(decimals);
    return value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function countup(el) {
    if (!el.dataset.hsCountupText) el.dataset.hsCountupText = el.textContent;
    const original = el.dataset.hsCountupText;
    const match = original.match(/[\d,]*\.?\d+/);
    if (!match) return;
    const numText = match[0];
    const target = parseFloat(numText.replace(/,/g, ''));
    if (!isFinite(target)) return;
    if (instant) { el.textContent = original; return; }

    const decimals = (numText.split('.')[1] || '').length;
    const grouped = numText.includes(',');
    const prefix = original.slice(0, match.index);
    const suffix = original.slice(match.index + numText.length);
    const duration = parseFloat(el.dataset.duration) || 900;
    const start = performance.now();

    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + format(target * eased, decimals, grouped) + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = original;
    }
    requestAnimationFrame(tick);
  }

  /* ---- .meter[data-value] ---- */

  function meter(el) {
    let bar = el.querySelector('i');
    if (!bar) { bar = document.createElement('i'); el.appendChild(bar); }
    const value = Math.max(0, Math.min(100, parseFloat(el.dataset.value) || 0));
    if (instant) {
      bar.style.transition = 'none';
      bar.style.width = value + '%';
      return;
    }
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth;
    bar.style.transition = 'width 0.9s cubic-bezier(0.22, 0.61, 0.36, 1)';
    bar.style.width = value + '%';
  }

  function run() {
    const slide = D.slides[D.state.index];
    if (!slide) return;
    slide.querySelectorAll('[data-countup]').forEach(countup);
    slide.querySelectorAll('.meter[data-value]').forEach(meter);
  }

  D.on('change', run);
  addEventListener('load', run);
})();
