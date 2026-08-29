/* Edit mode: press `e` to toggle.
 *  - click an element        -> select it, tune spacing in the side panel
 *  - double-click text       -> edit it in place (Esc or click away to finish)
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
    function apply(v) {
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

  function buildPanel() {
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
      panel.appendChild(row('font-size', Math.round(parseFloat(cs.fontSize)), 8, 160,
        function (v) { selected.style.fontSize = v + 'px'; }));
      if (cs.display.includes('flex') || cs.display.includes('grid')) {
        panel.appendChild(row('gap', Math.round(parseFloat(cs.gap) || 0), 0, 200,
          function (v) { selected.style.gap = v + 'px'; }));
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
      hint.textContent = 'Double-click text to edit it. Values are saved as inline styles.';
      panel.appendChild(hint);
    } else {
      const hint = document.createElement('p');
      hint.className = 'hs-hint';
      hint.textContent = 'Click an element on the slide to adjust its spacing, or double-click text to rewrite it.';
      panel.appendChild(hint);
    }

    const actions = document.createElement('div');
    actions.className = 'hs-actions';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'hs-primary';
    saveBtn.textContent = 'Save (⌘S)';
    saveBtn.addEventListener('click', save);
    const revertBtn = document.createElement('button');
    revertBtn.textContent = 'Revert';
    revertBtn.addEventListener('click', function () { location.reload(); });
    actions.append(saveBtn, revertBtn);
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

  function endTextEdit() {
    if (!editingText) return;
    editingText.removeAttribute('contenteditable');
    editingText = null;
    dirty = true;
  }

  const TEXT_TAGS = 'p,h1,h2,h3,h4,h5,h6,li,td,th,figcaption,blockquote,dt,dd,code,span';

  function onClick(e) {
    if (!editing) return;
    if (e.target.closest('#hs-editor-panel')) return;
    if (editingText && editingText.contains(e.target)) return;
    endTextEdit();
    const slide = D.slides[D.state.index];
    const el = e.target.closest('.slide *');
    if (el && slide.contains(el) && !el.classList.contains('slide-number')) {
      e.preventDefault();
      e.stopPropagation();
      select(el);
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
    toast('Edit mode — click to select, double-click to edit text');
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
    if ((e.metaKey || e.ctrlKey) && e.key === 's' && editing) {
      e.preventDefault();
      endTextEdit();
      save();
      return;
    }
    if (e.target.isContentEditable) {
      if (e.key === 'Escape') { e.target.blur(); endTextEdit(); buildPanel(); }
      return;
    }
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'e') { editing ? exit() : enter(); }
    else if (e.key === 'Escape' && editing) {
      if (selected) select(null);
      else exit();
    }
  });

  addEventListener('click', onClick, true);
  addEventListener('dblclick', onDblClick, true);

  addEventListener('beforeunload', function (e) {
    if (dirty) e.preventDefault();
  });
})();
