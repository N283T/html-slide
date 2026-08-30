/* Edit mode — the default when the dev server is running (?present=1
 * or a static host keeps the deck in presentation mode; `e` toggles).
 *
 * A docked inspector on the right:
 *  - click an element        -> select; breadcrumb picks any ancestor
 *  - drag a selected element -> nudge its margins (scale-aware)
 *  - arrow keys              -> nudge by 1px (Shift = 10px)
 *  - double-click text       -> edit in place (Esc to finish)
 *  - Cmd+Z / Shift+Cmd+Z     -> undo / redo (snapshot per gesture)
 *  - autosave (on by default) or Cmd+S -> POST /__hs/save
 * Adjustments land as inline styles / classes in the source, so what
 * the inspector does is exactly what Claude and git see. */
(function () {
  'use strict';

  const deck = document.getElementById('deck');
  const D = window.HSDeck;
  if (!deck || !D) return;

  let editing = false;
  let selected = null;
  let editingText = null;
  let dirty = false;
  let saveState = 'saved';   /* saved | dirty | error */
  let panel = null;
  let statusEl = null;

  let autosave = true;
  try { autosave = localStorage.getItem('hs-autosave') !== '0'; } catch (_) {}
  let autosaveTimer = null;

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

  /* ---- save state ---- */

  function updateStatus() {
    if (!statusEl) return;
    statusEl.className = 'hs-ep-status is-' + saveState;
    statusEl.textContent =
      saveState === 'saved' ? '✓ 保存済み' :
      saveState === 'dirty' ? (autosave ? '● 保存中…' : '● 未保存') :
      '✕ 保存失敗';
  }

  /* The slide the pending changes belong to — saving must target it
   * even if the user has meanwhile navigated elsewhere. */
  let pendingIndex = null;

  function markDirty() {
    dirty = true;
    saveState = 'dirty';
    pendingIndex = D.state.index;
    updateStatus();
    if (autosave && editing) {
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(function () { save(true); }, 900);
    }
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
    markDirty();
    buildPanel();
  }

  function undo() {
    if (!undoStack.length) { toast('これ以上戻せません'); return; }
    redoStack.push(snapshot());
    restore(undoStack.pop());
  }

  function redo() {
    if (!redoStack.length) { toast('やり直す操作がありません'); return; }
    undoStack.push(snapshot());
    restore(redoStack.pop());
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

  function save(quiet) {
    clearTimeout(autosaveTimer);
    const index = pendingIndex != null ? pendingIndex : D.state.index;
    const slide = D.slides[index];
    const body = JSON.stringify({
      path: location.pathname,
      index: index,
      html: serializeSlide(slide)
    });
    if (window.HSLiveReload) window.HSLiveReload.suppress();
    fetch('/__hs/save', { method: 'POST', body: body })
      .then(function (res) {
        if (!res.ok) return res.text().then(function (t) { throw new Error(t); });
        dirty = false;
        pendingIndex = null;
        saveState = 'saved';
        updateStatus();
        if (!quiet) toast('スライド ' + (index + 1) + ' を保存しました');
      })
      .catch(function (err) {
        saveState = 'error';
        updateStatus();
        toast('保存に失敗: ' + err.message);
      });
  }

  /* ---- element operations ---- */

  function opDelete() {
    if (!selected) return;
    pushSnapshot();
    const el = selected;
    select(null);
    el.remove();
    markDirty();
    toast('要素を削除しました');
  }

  function opDuplicate() {
    if (!selected) return;
    pushSnapshot();
    const copy = selected.cloneNode(true);
    copy.classList.remove('hs-selected');
    selected.after(copy);
    markDirty();
    select(copy);
  }

  function opMove(delta) {
    if (!selected) return;
    const sibs = Array.from(selected.parentElement.children);
    const i = sibs.indexOf(selected);
    const j = i + delta;
    if (j < 0 || j >= sibs.length) return;
    pushSnapshot();
    if (delta < 0) sibs[j].before(selected);
    else sibs[j].after(selected);
    markDirty();
    buildPanel();
  }

  /* ---- panel helpers ---- */

  function describe(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    const classes = Array.from(el.classList)
      .filter(function (c) {
        return c !== 'hs-selected' && c !== 'is-active' && c !== 'is-visible';
      })
      .slice(0, 2);
    if (classes.length) s += '.' + classes.join('.');
    return s;
  }

  function h(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function section(title) {
    const s = h('div', 'hs-ep-section');
    if (title) s.appendChild(h('h4', null, title));
    return s;
  }

  function row(parent, labelText, prop, value, min, max, apply, step) {
    const div = h('div', 'hs-row');
    const label = h('label', null, labelText);
    const range = document.createElement('input');
    range.type = 'range';
    range.min = min;
    range.max = max;
    range.step = step || 1;
    range.value = value;
    const num = document.createElement('input');
    num.type = 'number';
    num.step = step || 1;
    num.value = value;
    let pushed = false;
    function set(v) {
      if (!pushed) { pushSnapshot(); pushed = true; }
      range.value = v;
      num.value = v;
      apply(Number(v));
      markDirty();
    }
    range.addEventListener('input', function () { set(range.value); });
    num.addEventListener('input', function () { if (num.value !== '') set(num.value); });
    const reset = h('button', 'hs-reset', '✕');
    reset.title = 'インライン指定の ' + (prop || labelText) + ' を消してテーマのCSSに戻す';
    reset.addEventListener('click', function () {
      if (!selected || !prop) return;
      pushSnapshot();
      selected.style.removeProperty(prop);
      markDirty();
      buildPanel();
    });
    div.append(label, range, num, prop ? reset : h('span'));
    parent.appendChild(div);
  }

  function rgbToHex(str) {
    const m = String(str).match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (!m) return /^#/.test(str) ? str : '#888888';
    return '#' + [m[1], m[2], m[3]].map(function (v) {
      return Number(v).toString(16).padStart(2, '0');
    }).join('');
  }

  /* A row of theme swatches + a free color picker. Swatches write
   * var(--hs-*) so the value keeps following the theme; the picker
   * writes a literal hex. ✕ falls back to the stylesheet. */
  function colorRow(parent, labelText, prop, tokens, computedValue) {
    const div = h('div', 'hs-ctl-row');
    div.appendChild(h('label', null, labelText));
    const wrap = h('div', 'hs-swatches');
    const slideStyle = getComputedStyle(D.slides[D.state.index]);
    const current = (selected.style.getPropertyValue(prop) || '').trim();

    const clear = h('button', 'hs-swatch hs-swatch-clear');
    clear.title = 'テーマの色に戻す';
    clear.addEventListener('click', function () {
      pushSnapshot();
      selected.style.removeProperty(prop);
      markDirty();
      buildPanel();
    });
    wrap.appendChild(clear);

    tokens.forEach(function (token) {
      const resolved = slideStyle.getPropertyValue(token).trim();
      if (!resolved) return;
      const b = h('button',
        'hs-swatch' + (current === 'var(' + token + ')' ? ' is-on' : ''));
      b.style.background = resolved;
      b.title = token;
      b.addEventListener('click', function () {
        pushSnapshot();
        selected.style.setProperty(prop, 'var(' + token + ')');
        markDirty();
        buildPanel();
      });
      wrap.appendChild(b);
    });

    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = rgbToHex(computedValue);
    picker.title = '自由に色を選ぶ';
    let pushed = false;
    picker.addEventListener('input', function () {
      if (!pushed) { pushSnapshot(); pushed = true; }
      selected.style.setProperty(prop, picker.value);
      markDirty();
    });
    wrap.appendChild(picker);

    div.appendChild(wrap);
    parent.appendChild(div);
  }

  /* A labelled segment control writing one CSS value per button. */
  function segRow(parent, labelText, prop, options, currentValue) {
    const div = h('div', 'hs-ctl-row');
    div.appendChild(h('label', null, labelText));
    const seg = h('div', 'hs-seg');
    seg.style.marginBottom = '0';
    options.forEach(function (def) {
      const b = h('button', currentValue === def[1] ? 'is-on' : null, def[0]);
      b.title = prop + ': ' + def[1];
      b.addEventListener('click', function () {
        pushSnapshot();
        selected.style.setProperty(prop, def[1]);
        markDirty();
        buildPanel();
      });
      seg.appendChild(b);
    });
    div.appendChild(seg);
    parent.appendChild(div);
  }

  /* Axis-aware labels: in a row-direction flex, align-items is the
   * vertical axis; in a column it is horizontal. */
  const ALIGN_V = [['上', 'flex-start'], ['中', 'center'], ['下', 'flex-end'], ['伸', 'stretch']];
  const ALIGN_H = [['左', 'flex-start'], ['中', 'center'], ['右', 'flex-end'], ['伸', 'stretch']];
  const JUSTIFY_H = [['左', 'flex-start'], ['中', 'center'], ['右', 'flex-end'], ['等間', 'space-between']];
  const JUSTIFY_V = [['上', 'flex-start'], ['中', 'center'], ['下', 'flex-end'], ['等間', 'space-between']];

  const MEDIA_TAGS = ['IMG', 'SVG', 'VIDEO', 'FIGURE', 'CANVAS'];
  const TEXT_TAGS = 'p,h1,h2,h3,h4,h5,h6,li,td,th,figcaption,blockquote,dt,dd,code,span';
  const UTILITY_CLASSES = ['em', 'muted', 'small', 'mono'];

  function buildPanel() {
    if (!editing) return;
    const scrollTop = panel ? panel.scrollTop : 0;
    if (panel) panel.remove();
    panel = h('div');
    panel.id = 'hs-editor-panel';

    /* header */
    const head = h('div', 'hs-ep-head');
    head.appendChild(h('span', 'hs-ep-title',
      'スライド ' + (D.state.index + 1) + ' / ' + D.state.total));
    statusEl = h('span', 'hs-ep-status');
    head.appendChild(statusEl);
    panel.appendChild(head);
    saveState = dirty ? saveState : 'saved';
    updateStatus();

    if (selected) {
      const cs = getComputedStyle(selected);

      /* element section: breadcrumb, size, ops */
      const elSec = section('要素');
      const crumb = h('div', 'hs-breadcrumb');
      const chain = [];
      for (let el = selected; el && !el.classList.contains('slide'); el = el.parentElement) {
        chain.unshift(el);
      }
      chain.forEach(function (el) {
        const b = h('button', el === selected ? 'is-current' : null, describe(el));
        b.title = describe(el) + ' を選択';
        b.addEventListener('click', function () { select(el); });
        crumb.appendChild(b);
      });
      elSec.appendChild(crumb);
      const box = selected.getBoundingClientRect();
      const scale = deck.getBoundingClientRect().width / 1920 || 1;
      elSec.appendChild(h('div', 'hs-ep-meta',
        Math.round(box.width / scale) + ' × ' + Math.round(box.height / scale) + ' px'));

      const ops = h('div', 'hs-actions');
      [['↑', '前の兄弟要素の前へ移動', function () { opMove(-1); }],
       ['↓', '次の兄弟要素の後へ移動', function () { opMove(1); }],
       ['⧉', '複製', opDuplicate],
       ['🗑', '削除 (Backspace)', opDelete]
      ].forEach(function (def) {
        const b = h('button', null, def[0]);
        b.title = def[1];
        b.addEventListener('click', def[2]);
        ops.appendChild(b);
      });
      elSec.appendChild(ops);

      /* utility class chips */
      const chips = h('div', 'hs-chips');
      chips.style.marginTop = '10px';
      UTILITY_CLASSES.forEach(function (cls) {
        const chip = h('button',
          'hs-chip' + (selected.classList.contains(cls) ? ' is-on' : ''), '.' + cls);
        chip.addEventListener('click', function () {
          pushSnapshot();
          selected.classList.toggle(cls);
          if (!selected.classList.length) selected.removeAttribute('class');
          markDirty();
          buildPanel();
        });
        chips.appendChild(chip);
      });
      elSec.appendChild(chips);
      panel.appendChild(elSec);

      /* text section */
      const textSec = section('テキスト');
      row(textSec, '文字サイズ', 'font-size', Math.round(parseFloat(cs.fontSize)), 8, 160,
        function (v) { selected.style.fontSize = v + 'px'; });
      const fontPx = parseFloat(cs.fontSize) || 34;
      const lhRaw = parseFloat(cs.lineHeight);
      const lh = isNaN(lhRaw) ? 1.5 : Math.round(lhRaw / fontPx * 100) / 100;
      row(textSec, '行間', 'line-height', lh, 0.9, 3,
        function (v) { selected.style.lineHeight = v; }, 0.05);
      segRow(textSec, '揃え', 'text-align',
        [['左', 'left'], ['中', 'center'], ['右', 'right']], cs.textAlign);
      colorRow(textSec, '文字色', 'color',
        ['--hs-fg', '--hs-heading', '--hs-accent', '--hs-accent-2', '--hs-em', '--hs-muted'],
        cs.color);
      panel.appendChild(textSec);

      /* box section */
      const boxSec = section('余白・サイズ');
      if (cs.display.includes('flex') || cs.display.includes('grid')) {
        row(boxSec, 'gap', 'gap', Math.round(parseFloat(cs.gap) || 0), 0, 200,
          function (v) { selected.style.gap = v + 'px'; });
      }
      if (MEDIA_TAGS.includes(selected.tagName)) {
        const parentW = selected.parentElement.getBoundingClientRect().width || 1;
        const pct = Math.round(box.width / parentW * 100);
        row(boxSec, '幅 %', 'width', Math.min(pct, 100), 5, 100,
          function (v) { selected.style.width = v + '%'; });
      }
      [['m-top', 'margin-top'], ['m-bottom', 'margin-bottom'],
       ['m-left', 'margin-left'], ['m-right', 'margin-right'],
       ['p-top', 'padding-top'], ['p-bottom', 'padding-bottom']
      ].forEach(function (pair) {
        const current = Math.round(parseFloat(cs.getPropertyValue(pair[1])) || 0);
        row(boxSec, pair[0], pair[1], current, -100, 300, function (v) {
          selected.style.setProperty(pair[1], v + 'px');
        });
      });
      colorRow(boxSec, '背景色', 'background-color',
        ['--hs-bg', '--hs-surface', '--hs-accent-soft', '--hs-accent'],
        cs.backgroundColor);

      /* flex alignment — labels follow the container's axis */
      if (cs.display.includes('flex')) {
        const isColumn = cs.flexDirection.startsWith('column');
        segRow(boxSec, '子の揃え', 'align-items',
          isColumn ? ALIGN_H : ALIGN_V, cs.alignItems);
        segRow(boxSec, '子の配置', 'justify-content',
          isColumn ? JUSTIFY_V : JUSTIFY_H,
          cs.justifyContent === 'normal' ? 'flex-start' : cs.justifyContent);
      }
      const pcs = getComputedStyle(selected.parentElement);
      if (pcs.display.includes('flex')) {
        const parentColumn = pcs.flexDirection.startsWith('column');
        segRow(boxSec, '自身の揃え', 'align-self',
          parentColumn ? ALIGN_H : ALIGN_V,
          cs.alignSelf === 'auto' ? pcs.alignItems : cs.alignSelf);
      }

      const clearBtn = h('button', null, 'インライン指定をすべて解除');
      clearBtn.style.cssText = 'width:100%;margin:4px 0 10px;padding:5px 0;border:1px solid #2c2f37;border-radius:6px;background:#1f222a;color:#9aa0ab;cursor:pointer;font-size:11.5px;';
      clearBtn.addEventListener('click', function () {
        pushSnapshot();
        selected.removeAttribute('style');
        markDirty();
        buildPanel();
      });
      boxSec.appendChild(clearBtn);
      panel.appendChild(boxSec);

      const hint = section();
      hint.appendChild(h('p', 'hs-hint',
        'ドラッグまたは矢印キー（Shift で 10px）で位置を微調整。テキストはダブルクリックで直接書き換えられます。'));
      panel.appendChild(hint);
    } else {
      const empty = section();
      empty.appendChild(h('p', 'hs-hint',
        'スライド上の要素をクリックすると調整パネルが出ます。テキストはダブルクリックで編集、⌘Z で取り消し。スライドの並べ替え・追加は一覧（o / ▦）から。'));
      panel.appendChild(empty);
    }

    /* footer */
    const foot = h('div', 'hs-ep-footer');

    const autosaveLabel = h('label', 'hs-autosave');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = autosave;
    cb.addEventListener('change', function () {
      autosave = cb.checked;
      try { localStorage.setItem('hs-autosave', autosave ? '1' : '0'); } catch (_) {}
      if (autosave && dirty) save(true);
      updateStatus();
    });
    autosaveLabel.append(cb, document.createTextNode('自動保存（ソースに書き戻し）'));
    foot.appendChild(autosaveLabel);

    const histRow = h('div', 'hs-actions');
    const undoBtn = h('button', null, '↩ Undo');
    undoBtn.title = '⌘Z';
    undoBtn.addEventListener('click', undo);
    const redoBtn = h('button', null, '↪ Redo');
    redoBtn.title = '⇧⌘Z';
    redoBtn.addEventListener('click', redo);
    histRow.append(undoBtn, redoBtn);
    foot.appendChild(histRow);

    const saveRow = h('div', 'hs-actions');
    const saveBtn = h('button', null, '今すぐ保存');
    saveBtn.title = '⌘S';
    saveBtn.addEventListener('click', function () { save(false); });
    const revertBtn = h('button', null, '破棄して再読込');
    revertBtn.title = '未保存の変更を捨ててソースから読み直す';
    revertBtn.addEventListener('click', function () {
      dirty = false;
      location.reload();
    });
    saveRow.append(saveBtn, revertBtn);
    foot.appendChild(saveRow);

    const presentBtn = h('button', 'hs-primary', '▶ 発表モード');
    presentBtn.title = '編集を終えてフルスクリーンで発表（e で編集に戻る）';
    presentBtn.addEventListener('click', function () {
      exit();
      /* survive a reload as presentation mode */
      const params = new URLSearchParams(location.search);
      params.set('present', '1');
      history.replaceState(null, '', location.pathname + '?' + params.toString());
      document.documentElement.requestFullscreen().catch(function () {});
    });
    foot.appendChild(presentBtn);

    panel.appendChild(foot);
    document.body.appendChild(panel);
    panel.scrollTop = scrollTop;
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
    if (!skipDirty) markDirty();
  }

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
    markDirty();
  }

  function onPointerUp() {
    if (drag.active && drag.moved) buildPanel();
    drag.active = false;
  }

  function nudge(prop, delta) {
    const cs = getComputedStyle(selected);
    const current = parseFloat(cs.getPropertyValue(prop)) || 0;
    pushOnceForNudge();
    selected.style.setProperty(prop, Math.round(current + delta) + 'px');
    markDirty();
  }

  /* Coalesce a run of arrow-key nudges into one undo step. */
  let nudgeTimer = null;
  let nudgePushed = false;
  function pushOnceForNudge() {
    if (!nudgePushed) { pushSnapshot(); nudgePushed = true; }
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(function () {
      nudgePushed = false;
      buildPanel();
    }, 600);
  }

  /* ---- pointer routing ---- */

  function onClick(e) {
    if (!editing) return;
    if (e.target.closest('#hs-editor-panel') || e.target.closest('#hs-toolbar') ||
        e.target.closest('#hs-gallery')) return;
    if (editingText && editingText.contains(e.target)) return;
    if (drag.moved) { drag.moved = false; return; }
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
    pushSnapshot();
    select(null);
    endTextEdit();
    editingText = el;
    el.setAttribute('contenteditable', 'true');
    el.addEventListener('input', markDirty);
    el.focus();
  }

  /* ---- mode toggle ---- */

  function enter() {
    if (editing) return;
    editing = true;
    document.body.dataset.editing = '1';
    const params = new URLSearchParams(location.search);
    if (params.has('present')) {
      params.delete('present');
      history.replaceState(null, '', location.pathname + '?' + params.toString());
    }
    D.rescale();
    buildPanel();
  }

  function exit() {
    endTextEdit();
    select(null);
    editing = false;
    delete document.body.dataset.editing;
    if (panel) { panel.remove(); panel = null; statusEl = null; }
    D.rescale();
    if (dirty && !autosave) toast('未保存の変更があります — e で編集に戻って保存してください');
  }

  /* ---- keyboard ---- */

  addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && editing) {
      e.preventDefault();
      endTextEdit();
      save(false);
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

    /* arrow-key nudging beats slide navigation while a selection exists */
    if (editing && selected && /^Arrow/.test(e.key)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') nudge('margin-left', -step);
      if (e.key === 'ArrowRight') nudge('margin-left', step);
      if (e.key === 'ArrowUp') nudge('margin-top', -step);
      if (e.key === 'ArrowDown') nudge('margin-top', step);
      return;
    }

    if (e.key === 'e') { editing ? exit() : enter(); }
    else if (e.key === 'Backspace' && editing && selected) { e.preventDefault(); opDelete(); }
    else if (e.key === 'Escape' && editing) {
      if (selected) select(null);
      else exit();
    }
  }, true);

  addEventListener('click', onClick, true);
  addEventListener('dblclick', onDblClick, true);
  addEventListener('pointerdown', onPointerDown, true);
  addEventListener('pointermove', onPointerMove, true);
  addEventListener('pointerup', onPointerUp, true);

  addEventListener('beforeunload', function (e) {
    if (dirty && !autosave) e.preventDefault();
  });

  /* On slide change: flush pending edits from the slide we left, drop
   * a selection that no longer lives on the active slide, and keep the
   * header's counter honest. */
  D.on('change', function () {
    if (!editing) return;
    if (dirty && autosave && pendingIndex != null && pendingIndex !== D.state.index) {
      save(true);
    }
    if (selected && !D.slides[D.state.index].contains(selected)) select(null);
    else buildPanel();
  });

  /* ---- default mode ---- */

  if (window.HSServer) {
    window.HSServer.then(function (info) {
      const params = new URLSearchParams(location.search);
      if (info && info.ok &&
          !params.has('present') && !params.has('capture') &&
          location.hash !== '#overview') {
        enter();
      }
    });
  }

  window.HSEditor = {
    toggle: function () { editing ? exit() : enter(); },
    isEditing: function () { return editing; }
  };
})();
