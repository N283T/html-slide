/* Pen mode: press `p` while presenting to draw on the current slide,
 * like scribbling on a printed handout. Strokes are ephemeral — they
 * clear on slide change (`c` clears by hand, `p` puts the pen away). Nothing is ever written to the source. */
(function () {
  'use strict';

  const deck = document.getElementById('deck');
  const D = window.HSDeck;
  if (!deck || !D) return;

  let active = false;
  let canvas = null;
  let ctx = null;
  let drawing = false;

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    canvas.style.cssText =
      'position:absolute;inset:0;z-index:800;cursor:crosshair;';
    ctx = canvas.getContext('2d');
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ff3b30';
    deck.appendChild(canvas);
  }

  function clear() {
    if (ctx) ctx.clearRect(0, 0, 1920, 1080);
  }

  function toCanvas(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width * 1920,
      y: (e.clientY - rect.top) / rect.height * 1080
    };
  }

  function enter() {
    if (window.HSEditor && window.HSEditor.isEditing()) return;
    active = true;
    ensureCanvas();
    canvas.style.display = 'block';
  }

  function exit() {
    active = false;
    drawing = false;
    if (canvas) {
      clear();
      canvas.style.display = 'none';
    }
  }

  addEventListener('pointerdown', function (e) {
    if (!active || e.button !== 0 || e.target !== canvas) return;
    drawing = true;
    const p = toCanvas(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    e.preventDefault();
  });

  addEventListener('pointermove', function (e) {
    if (!active || !drawing) return;
    const p = toCanvas(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });

  addEventListener('pointerup', function () { drawing = false; });

  D.on('change', clear);

  addEventListener('keydown', function (e) {
    if (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    /* No Escape binding: the browser owns Esc for leaving fullscreen,
     * so the pen toggles on p alone to avoid double meanings. */
    if (e.key === 'p') { active ? exit() : enter(); }
    else if (e.key === 'c' && active) clear();
  });
})();
