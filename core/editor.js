/* Edit mode: press `e` to toggle.
 *  - click an element        -> select it; the panel tunes type, spacing
 *                               and (for media) width; action buttons
 *                               delete / duplicate / reorder it
 *  - drag a selected element -> nudges its margins (scale-aware)
 *  - double-click text       -> edit it in place (Esc to finish)
 *  - Cmd+Z / Shift+Cmd+Z     -> undo / redo (snapshot per gesture)
 *  - Save button / Cmd+S     -> write the slide back to the HTML source
 *                               through the dev server (POST /__hs/save)
 * Adjustments are written as inline styles, so what the panel does is
 * exactly what lands in the file — no hidden state. */
(function () {
  'use strict';

  const deck = document.getElementById('deck');
  const D = window.HSDeck;
  if (!deck || !D) return;

  let editing = false;
  let selected = null;
  let editingText = null;
  let dirty = false;
  let panel = null;

  /* ---- toast ---- */

  let toastEl = null;
  let toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'hs-editor-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('is-visible');
    }, 1800);
  }

  /* ---- undo / redo ---- */

  const undoStack = [];
  const redoStack = [];
  const MAX_UNDO = 80;

  function snapshot() {
    return { index: D.state.index, html: D.slides[D.state.index].outerHTML };
  }

  function pushSnapshot() {
    undoStack.push(snapshot());
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
  }

  function restore(snap) {
    const tpl = document.createElement('template');
    tpl.innerHTML = snap.html;
    const el = tpl.content.firstElementChild;
    selected = null;
    endTextEdit(true);
    D.replaceSlide(snap.index, el);
    if (D.state.index !== snap.index) D.goto(snap.index, 0);
    dirty = true;
    buildPanel();
  }

  function undo() {
    if (!undoStack.length) { toast('Nothing to undo'); return; }
    redoStack.push(snapshot());
    restore(undoStack.pop());
    toast('Undo');
  }

  function redo() {
    if (!redoStack.length) { toast('Nothing to redo'); return; }
    undoStack.push(snapshot());
    restore(redoStack.pop());
    toast('Redo');
  }

  /* ---- serialization ---- */

  function serializeSlide(slide) {
    const clone = slide.cloneNode(true);
    clone.classList.remove('is-active');
    clone.querySelectorAll('.slide-number, .overflow-warning').forEach(function (el) {
      el.remove();
    });
    clone.querySelectorAll('[contenteditable]').forEach(function (el) {
      el.removeAttribute('contenteditable');
    });
    clone.querySelectorAll('.hs-selected').forEach(function (el) {
      el.classList.remove('hs-selected');
    });
    clone.querySelectorAll('[data-fragment].is-visible').forEach(function (el) {
      el.classList.remove('is-visible');
    });
    clone.querySelectorAll('[class=""]').forEach(function (el) {
      el.removeAttribute('class');
    });
    clone.querySelectorAll('[style=""]').forEach(function (el) {
      el.removeAttribute('style');
    });
    return clone.outerHTML;
  }

  function save() {
    const slide = D.slides[D.state.index];
    const body = JSON.stringify({
      path: location.pathname,
      index: D.state.index,
      html: serializeSlide(slide)
    });
    if (window.HSLiveReload) window.HSLiveReload.suppress();
    fetch('/__hs/save', { method: 'POST', body: body })
      .then(function (res) {
        if (!res.ok) return res.text().then(function (t) { throw new Error(t); });
        dirty = false;
        toast('Saved slide ' + (D.state.index + 1));
      })
      .catch(function (err) {
        toast('Save failed: ' + err.message);
      });
  }

  /* ---- element operations ---- */

  function elementSiblings(el) {
    return Array.from(el.parentElement.children);
  }

  function opDelete() {
    if (!selected) return;
    pushSnapshot();
    const el = selected;
    select(null);
    el.remove();
    dirty = true;
    toast('Element deleted');
  }

  function opDuplicate() {
    if (!selected) return;
    pushSnapshot();
    const copy = selected.cloneNode(true);
    copy.classList.remove('hs-selected');
    selected.after(copy);
    dirty = true;
    select(copy);
  }

  function opMove(delta) {
    if (!selected) return;
    const sibs = elementSiblings(selected);
    const i = sibs.indexOf(selected);
    const j = i + delta;
    if (j < 0 || j >= sibs.length) return;
    pushSnapshot();
    if (delta < 0) sibs[j].before(selected);
    else sibs[j].after(selected);
    dirty = true;
    buildPanel();
  }

  /* ---- selection panel ---- */

  const SPACING_PROPS = [
    ['margin-top', 'm-top'],
    ['margin-bottom', 'm-bottom'],
    ['margin-left', 'm-left'],
    ['margin-right', 'm-right'],
    ['padding-top', 'p-top'],
    ['padding-bottom', 'p-bottom']
  ];

  function describe(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.classList.length) {
      s += '.' + Array.from(el.classList)
        .filter(function (c) { return c !== 'hs-selected'; })
        .slice(0, 2).join('.');
    }
    return s;
  }

  function row(labelText, value, min, max, oninput) {
    const div = document.createElement('div');
    div.className = 'hs-row';
    const label = document.createElement('label');
    label.textContent = labelText;
    const range = document.createElement('input');
    range.type = 'range';
    range.min = min;
    range.max = max;
    range.value = value;
    const num = document.createElement('input');
    num.type = 'number';
    num.value = value;
    let pushed = false;
    function apply(v) {
      if (!pushed) { pushSnapshot(); pushed = true; }
      range.value = v;
      num.value = v;
      oninput(Number(v));
      dirty = true;
    }
    range.addEventListener('input', function () { apply(range.value); });
    num.addEventListener('input', function () { if (num.value !== '') apply(num.value); });
    div.append(label, range, num);
    return div;
  }

  function actionButton(label, title, fn) {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', fn);
    return b;
  }

  const MEDIA_TAGS = ['IMG', 'SVG', 'VIDEO', 'FIGURE', 'CANVAS'];

  function buildPanel() {
    if (!editing) return;
    if (panel) panel.remove();
    panel = document.createElement('div');
    panel.id = 'hs-editor-panel';

    const h = document.createElement('h3');
    h.textContent = 'Edit mode';
    const tag = document.createElement('span');
    tag.className = 'hs-target-tag';
    tag.textContent = selected ? describe(selected) : 'no selection';
    h.appendChild(tag);
    panel.appendChild(h);

    if (selected) {
      const cs = getComputedStyle(selected);

      const ops = document.createElement('div');
      ops.className = 'hs-actions';
      ops.append(
        actionButton('↑', 'Move before previous sibling', function () { opMove(-1); }),
        actionButton('↓', 'Move after next sibling', function () { opMove(1); }),
        actionButton('⧉', 'Duplicate element', opDuplicate),
        actionButton('🗑', 'Delete element', opDelete)
      );
      panel.appendChild(ops);

      panel.appendChild(row('font-size', Math.round(parseFloat(cs.fontSize)), 8, 160,
        function (v) { selected.style.fontSize = v + 'px'; }));
      if (cs.display.includes('flex') || cs.display.includes('grid')) {
        panel.appendChild(row('gap', Math.round(parseFloat(cs.gap) || 0), 0, 200,
          function (v) { selected.style.gap = v + 'px'; }));
      }
      if (MEDIA_TAGS.includes(selected.tagName)) {
        const parentW = selected.parentElement.getBoundingClientRect().width || 1;
        const pct = Math.round(selected.getBoundingClientRect().width / parentW * 100);
        panel.appendChild(row('width %', Math.min(pct, 100), 5, 100,
          function (v) { selected.style.width = v + '%'; }));
      }
      SPACING_PROPS.forEach(function (pair) {
        const prop = pair[0], label = pair[1];
        const current = Math.round(parseFloat(cs.getPropertyValue(prop)) || 0);
        panel.appendChild(row(label, current, -100, 300, function (v) {
          selected.style.setProperty(prop, v + 'px');
        }));
      });
      const hint = document.createElement('p');
      hint.className = 'hs-hint';
      hint.textContent = 'Drag the element to nudge its margins. Double-click text to edit it.';
      panel.appendChild(hint);
    } else {
      const hint = document.createElement('p');
      hint.className = 'hs-hint';
      hint.textContent = 'Click an element to adjust it, double-click text to rewrite it. ⌘Z undoes, ⌘S saves to source.';
      panel.appendChild(hint);
    }

    const actions = document.createElement('div');
    actions.className = 'hs-actions';
    const undoBtn = actionButton('↩ Undo', 'Cmd+Z', undo);
    const saveBtn = document.createElement('button');
    saveBtn.className = 'hs-primary';
    saveBtn.textContent = 'Save (⌘S)';
    saveBtn.addEventListener('click', save);
    const revertBtn = actionButton('Revert', 'Reload from source', function () {
      dirty = false;
      location.reload();
    });
    actions.append(undoBtn, saveBtn, revertBtn);
    panel.appendChild(actions);

    document.body.appendChild(panel);
  }

  /* ---- selection / text editing ---- */

  function select(el) {
    if (selected) selected.classList.remove('hs-selected');
    selected = el;
    if (selected) selected.classList.add('hs-selected');
    buildPanel();
  }

  function endTextEdit(skipDirty) {
    if (!editingText) return;
    editingText.removeAttribute('contenteditable');
    editingText = null;
    if (!skipDirty) dirty = true;
  }

  const TEXT_TAGS = 'p,h1,h2,h3,h4,h5,h6,li,td,th,figcaption,blockquote,dt,dd,code,span';

  /* ---- drag-to-nudge margins ---- */

  const drag = { active: false, moved: false };

  function canvasScale() {
    return deck.getBoundingClientRect().width / 1920 || 1;
  }

  function onPointerDown(e) {
    if (!editing || !selected || e.button !== 0) return;
    if (!selected.contains(e.target)) return;
    if (editingText) return;
    drag.active = true;
    drag.moved = false;
    drag.x = e.clientX;
    drag.y = e.clientY;
    const cs = getComputedStyle(selected);
    drag.ml = parseFloat(cs.marginLeft) || 0;
    drag.mt = parseFloat(cs.marginTop) || 0;
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!drag.active) return;
    const scale = canvasScale();
    const dx = (e.clientX - drag.x) / scale;
    const dy = (e.clientY - drag.y) / scale;
    if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    if (!drag.moved) { pushSnapshot(); drag.moved = true; }
    selected.style.marginLeft = Math.round(drag.ml + dx) + 'px';
    selected.style.marginTop = Math.round(drag.mt + dy) + 'px';
    dirty = true;
  }

  function onPointerUp() {
    if (drag.active && drag.moved) buildPanel();
    drag.active = false;
  }

  /* ---- pointer routing ---- */

  function onClick(e) {
    if (!editing) return;
    if (e.target.closest('#hs-editor-panel')) return;
    if (editingText && editingText.contains(e.target)) return;
    if (drag.moved) { drag.moved = false; return; }
    endTextEdit();
    const slide = D.slides[D.state.index];
    const el = e.target.closest('.slide *');
    if (el && slide.contains(el) && !el.classList.contains('slide-number')) {
      e.preventDefault();
      e.stopPropagation();
      select(el === selected ? selected : el);
    } else {
      select(null);
    }
  }

  function onDblClick(e) {
    if (!editing) return;
    if (e.target.closest('#hs-editor-panel')) return;
    const el = e.target.closest(TEXT_TAGS);
    const slide = D.slides[D.state.index];
    if (!el || !slide.contains(el)) return;
    e.preventDefault();
    pushSnapshot();
    select(null);
    endTextEdit();
    editingText = el;
    el.setAttribute('contenteditable', 'true');
    el.focus();
  }

  /* ---- mode toggle ---- */

  function enter() {
    editing = true;
    document.body.dataset.editing = '1';
    buildPanel();
    toast('Edit mode — click to select, drag to nudge, double-click to edit text');
  }

  function exit() {
    endTextEdit();
    select(null);
    editing = false;
    delete document.body.dataset.editing;
    if (panel) { panel.remove(); panel = null; }
    if (dirty) toast('Left edit mode — unsaved changes (press e, then Save)');
  }

  addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && editing) {
      e.preventDefault();
      endTextEdit();
      save();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && editing &&
        !e.target.isContentEditable) {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if (e.target.isContentEditable) {
      if (e.key === 'Escape') { e.target.blur(); endTextEdit(); buildPanel(); }
      return;
    }
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'e') { editing ? exit() : enter(); }
    else if (e.key === 'Backspace' && editing && selected) { opDelete(); }
    else if (e.key === 'Escape' && editing) {
      if (selected) select(null);
      else exit();
    }
  });

  addEventListener('click', onClick, true);
  addEventListener('dblclick', onDblClick, true);
  addEventListener('pointerdown', onPointerDown, true);
  addEventListener('pointermove', onPointerMove, true);
  addEventListener('pointerup', onPointerUp, true);

  addEventListener('beforeunload', function (e) {
    if (dirty) e.preventDefault();
  });

  window.HSEditor = {
    toggle: function () { editing ? exit() : enter(); },
    isEditing: function () { return editing; }
  };
})();
