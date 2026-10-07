/* Editor chrome: top bar, filmstrip, the inspector (design / layers /
 * review) and the status bar. */

import { HS, ed, isFree, isArrow, pathOf, fromPath } from './core.js';
import { h, icon, iconButton, menu, toast, MOD } from './ui.js';
import {
  mutate, sync, undo, redo, moveSlide, duplicateSlide, deleteSlide,
  setTheme, setDeckAttr, currentTheme
} from './sync.js';
import {
  select, startText, setTool, removeSelected, duplicateSelected, reorder, toggleFree,
  align, distribute, resetZoom, setHover, isInlineEl, canEditText, openNoteEditor, resolveNote,
  requestDraw
} from './stage.js';
import {
  BLOCKS, OBJECTS, insertBlock, insertObject, chooseImage, openGallery, openPalette, openHelp,
  present, getThemes
} from './commands.js';

let root, film, side, sideBody, statusEl, barInfo, barIssues, barZoom;
let tab = 'design';

/* replaceChildren, minus the nulls a conditional leaves behind. */
const fill = (el, ...children) => el.replaceChildren(...children.flat().filter(Boolean));

/* ================= filmstrip ================= */

const items = new Map();   /* slide -> {root, num, thumb, badge} */
const auditTimers = new Map();

function runAudit(slide) {
  const item = items.get(slide);
  if (!item) return;
  const clone = item.thumb.firstElementChild;
  const found = HS.audit(clone).map((issue) => ({
    kind: issue.kind,
    level: issue.level,
    message: issue.message,
    path: issue.el === clone ? [] : pathOf(issue.el, clone),
    label: issue.el === clone ? 'スライド' : HS.describe(issue.el),
    text: issue.el === clone ? '' : HS.snippet(issue.el, 28)
  }));
  ed.issues.set(slide, found);
  const errors = found.filter((i) => i.level === 'error').length;
  const warns = found.filter((i) => i.level === 'warn').length;
  const notes = found.filter((i) => i.level === 'note').length;
  fill(item.badge,
    errors ? h('i', { class: 'is-error', title: 'レイアウトの問題 ' + errors, text: errors }) : null,
    warns ? h('i', { class: 'is-warn', title: '注意 ' + warns, text: warns }) : null,
    notes ? h('i', { class: 'is-note', title: '@fix ' + notes, text: notes }) : null);
  ed.emit('issues');
}

function scheduleAudit(slide, delay) {
  clearTimeout(auditTimers.get(slide));
  auditTimers.set(slide, setTimeout(() => runAudit(slide), delay || 450));
}

function refreshThumb(slide) {
  const item = items.get(slide);
  if (!item) return;
  const fresh = HS.thumb(slide);
  item.thumb.replaceWith(fresh);
  item.thumb = fresh;
  scheduleAudit(slide);
}

let dragFrom = -1;

function makeItem(slide) {
  const thumb = HS.thumb(slide);
  const num = h('span', { class: 'hse-film-num' });
  const badge = h('span', { class: 'hse-film-badge' });
  const index = () => HS.slides.indexOf(slide);
  const el = h('div', {
    class: 'hse-film-item', draggable: true,
    onclick: () => HS.go(index(), 0),
    oncontextmenu: (e) => {
      e.preventDefault();
      e.stopPropagation();
      HS.go(index(), 0);
      menu([
        { label: 'この後に新しいスライド…', run: () => openGallery(index(), el) },
        { label: '複製', keys: MOD + 'D', run: () => duplicateSlide(index()) },
        '-',
        { label: '削除', danger: true, run: () => deleteSlide(index()) }
      ], { x: e.clientX, y: e.clientY });
    },
    ondragstart: (e) => {
      dragFrom = index();
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragFrom));
      el.classList.add('is-dragging');
    },
    ondragend: () => {
      dragFrom = -1;
      el.classList.remove('is-dragging');
      film.querySelectorAll('.is-over, .is-over-after').forEach((x) => x.classList.remove('is-over', 'is-over-after'));
    },
    ondragover: (e) => {
      if (dragFrom < 0) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      el.classList.toggle('is-over', !after);
      el.classList.toggle('is-over-after', after);
    },
    ondragleave: () => el.classList.remove('is-over', 'is-over-after'),
    ondrop: (e) => {
      if (dragFrom < 0) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      let to = index() + (after ? 1 : 0);
      if (to > dragFrom) to--;
      moveSlide(dragFrom, to);
    }
  },
    num,
    h('div', { class: 'hse-film-frame' }, thumb, badge,
      h('div', { class: 'hse-film-ops' },
        iconButton('copy', '複製', () => duplicateSlide(index())),
        iconButton('trash', '削除', () => deleteSlide(index())))),
    iconButton('plus', 'この後に新しいスライド', (e) => openGallery(index(), e.currentTarget), 'hse-film-add'));
  const item = { root: el, num, thumb, badge };
  items.set(slide, item);
  scheduleAudit(slide, 700);
  return item;
}

function syncFilm() {
  const list = HS.slides;
  const keep = new Set(list);
  items.forEach((item, slide) => {
    if (!keep.has(slide)) {
      item.root.remove();
      items.delete(slide);
      ed.issues.delete(slide);
    }
  });
  let cursor = film.firstElementChild;
  list.forEach((slide, i) => {
    const item = items.get(slide) || makeItem(slide);
    item.num.textContent = i + 1;
    if (cursor === item.root) cursor = cursor.nextElementSibling;
    else film.insertBefore(item.root, cursor);
  });
  markActive();
}

function markActive() {
  const current = HS.current;
  items.forEach((item, slide) => {
    const on = slide === current;
    item.root.classList.toggle('is-active', on);
    if (on) item.root.scrollIntoView({ block: 'nearest' });
  });
}

/* ================= inspector controls ================= */

const round = (v, digits) => {
  const k = Math.pow(10, digits || 0);
  return Math.round(v * k) / k;
};

const tidy = (el) => {
  if (!el.getAttribute('style')) el.removeAttribute('style');
  if (!el.getAttribute('class')) el.removeAttribute('class');
};

function section(title, ...rows) {
  const kids = rows.flat().filter(Boolean);
  if (!kids.length) return null;
  return h('section', { class: 'hse-sec' }, title ? h('h4', { text: title }) : null, kids);
}

function field(label, control, onReset) {
  return h('div', { class: 'hse-field' },
    typeof label === 'string' ? h('label', { text: label }) : label,
    control,
    onReset ? iconButton('close', 'テーマの値に戻す', onReset, 'hse-reset') : h('span'));
}

const edit = (fn, key) => mutate(fn, { key: 'insp:' + key, source: 'inspector' });

/* A number bound to an inline style property. Drag the label to scrub. */
function styleNum(label, prop, opts) {
  opts = opts || {};
  const els = ed.sel.slice();
  const cs = getComputedStyle(els[0]);
  const digits = opts.step && opts.step < 1 ? 2 : 0;
  const read = opts.read || (() => parseFloat(cs.getPropertyValue(prop)) || 0);
  const write = opts.write || ((v) => v + (opts.unit == null ? 'px' : opts.unit));
  const input = h('input', {
    class: 'hse-input hse-num', type: 'number', value: round(read(), digits),
    step: opts.step || 1, min: opts.min, max: opts.max
  });
  const apply = (v) => {
    if (opts.min != null) v = Math.max(opts.min, v);
    if (opts.max != null) v = Math.min(opts.max, v);
    edit(() => els.forEach((el) => el.style.setProperty(prop, write(v))), prop);
    return v;
  };
  input.addEventListener('input', () => { if (input.value !== '') apply(Number(input.value)); });
  input.addEventListener('change', rebuild);
  const scrub = h('label', { class: 'hse-scrub', text: label, title: 'ドラッグで増減' });
  scrub.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const start = e.clientX;
    const base = Number(input.value) || 0;
    const step = opts.step || 1;
    const move = (ev) => {
      input.value = round(apply(base + Math.round((ev.clientX - start) / 2) * step), digits);
    };
    const up = () => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      rebuild();
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
  });
  const isSet = !!els[0].style.getPropertyValue(prop);
  return field(scrub, input, isSet ? () => {
    edit(() => els.forEach((el) => { el.style.removeProperty(prop); tidy(el); }), prop);
    rebuild();
  } : null);
}

function seg(options, current, onPick) {
  return h('div', { class: 'hse-seg' }, options.map(([label, value, title]) => h('button', {
    type: 'button', class: current === value ? 'is-on' : '', title: title || '',
    onclick: () => { onPick(value); rebuild(); }
  }, typeof label === 'string' ? label : label)));
}

function styleSeg(label, prop, options, current) {
  const els = ed.sel.slice();
  const isSet = !!els[0].style.getPropertyValue(prop);
  return field(label, seg(options, current, (value) => {
    edit(() => els.forEach((el) => el.style.setProperty(prop, value)), prop);
  }), isSet ? () => {
    edit(() => els.forEach((el) => { el.style.removeProperty(prop); tidy(el); }), prop);
    rebuild();
  } : null);
}

function toHex(color) {
  const m = String(color).match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (!m) return '#888888';
  return '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('');
}

/* Theme-token swatches (saved as var(--token), so they follow the
 * theme) plus a free picker. */
function swatches(label, prop, tokens) {
  const els = ed.sel.slice();
  const el = els[0];
  const slideStyle = getComputedStyle(ed.slide);
  const current = el.style.getPropertyValue(prop).trim();
  const set = (value) => {
    edit(() => els.forEach((x) => {
      if (value) x.style.setProperty(prop, value);
      else { x.style.removeProperty(prop); tidy(x); }
    }), prop);
  };
  const picker = h('input', { type: 'color', class: 'hse-color', value: toHex(getComputedStyle(el).getPropertyValue(prop)), title: '自由に選ぶ' });
  picker.addEventListener('input', () => set(picker.value));
  picker.addEventListener('change', rebuild);
  return field(label, h('div', { class: 'hse-swatches' },
    tokens.map((token) => h('button', {
      type: 'button', title: token,
      class: 'hse-swatch' + (current === 'var(' + token + ')' ? ' is-on' : ''),
      style: 'background:' + slideStyle.getPropertyValue(token),
      onclick: () => { set('var(' + token + ')'); rebuild(); }
    })), picker),
  current ? () => { set(null); rebuild(); } : null);
}

function textInput(value, onInput, placeholder) {
  const input = h('input', { class: 'hse-input', type: 'text', value: value || '', placeholder: placeholder || '', spellcheck: false });
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

function chips(label, classes) {
  const els = ed.sel.slice();
  return field(label, h('div', { class: 'hse-chips' }, classes.map((cls) => h('button', {
    type: 'button', class: 'hse-chip' + (els[0].classList.contains(cls) ? ' is-on' : ''), text: cls,
    onclick: () => {
      const on = !els[0].classList.contains(cls);
      edit(() => els.forEach((el) => { el.classList.toggle(cls, on); tidy(el); }), 'class');
      rebuild();
    }
  }))));
}

/* ================= element inspector ================= */

function contextClasses(el) {
  const out = [];
  const add = (...c) => out.push(...c);
  if (el.matches('.card')) add('is-accent', 'is-outline', 'is-raised');
  if (el.matches('.cols')) add('is-stretch', 'is-center');
  if (el.matches('.timeline > li')) add('is-now');
  if (el.matches('.steps > li, .bento > *')) add('is-accent');
  if (el.matches('.bento > *')) add('is-wide', 'is-tall');
  if (el.matches('.checklist > li')) add('is-no');
  if (el.matches('.shape')) add('is-ellipse', 'is-outline');
  if (el.matches('.arrow')) add('is-line');
  if (el.matches('td, th')) add('is-hl', 'num');
  if (el.matches('figure')) add('frame', 'is-cover');
  if (el.matches('.stat')) add('is-s', 'is-line');
  if (el.matches('.tag')) add('is-plain');
  return out;
}

function chartEditor(el) {
  const rows = Array.from(el.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.cells).map((c) => c.textContent.trim()).join('\t'));
  const area = h('textarea', { class: 'hse-input hse-data', rows: Math.min(10, rows.length + 1), spellcheck: false, value: rows.join('\n') });
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      area.setRangeText('\t', area.selectionStart, area.selectionEnd, 'end');
      area.dispatchEvent(new Event('input'));
    }
  });
  area.addEventListener('input', () => {
    const data = area.value.split('\n').filter((line) => line.trim())
      .map((line) => line.split(line.includes('\t') ? '\t' : ','));
    edit(() => {
      const table = document.createElement('table');
      data.forEach((cells) => {
        const tr = table.insertRow();
        cells.forEach((c) => { tr.insertCell().textContent = c.trim(); });
      });
      const old = el.querySelector('table');
      if (old) old.replaceWith(table);
      else el.appendChild(table);
    }, 'chart-data');
  });
  const attr = (name, placeholder) => textInput(el.getAttribute(name), (v) => {
    edit(() => (v ? el.setAttribute(name, v) : el.removeAttribute(name)), 'chart-' + name);
  }, placeholder);
  const type = h('select', { class: 'hse-input' },
    [['bar', '棒'], ['hbar', '横棒'], ['line', '折れ線'], ['area', '面'], ['donut', 'ドーナツ'], ['scatter', '散布図']]
      .map(([v, l]) => h('option', { value: v, text: l, selected: (el.getAttribute('type') || 'bar') === v })));
  type.addEventListener('change', () => edit(() => el.setAttribute('type', type.value), 'chart-type'));
  return section('グラフ',
    field('種類', type),
    field('単位', attr('unit', '% など')),
    field('強調', attr('highlight', '項目名')),
    h('div', { class: 'hse-hint', text: 'データ（タブかカンマ区切り。Excel から貼り付け可）' }),
    area);
}

function elementPanel() {
  const els = ed.sel;
  const el = els[0];
  const one = els.length === 1;
  const cs = getComputedStyle(el);
  const free = els.every(isFree);
  const out = [];

  /* header: where this element sits */
  if (one) {
    const chain = [];
    for (let n = el; n && n !== ed.slide; n = n.parentElement) chain.unshift(n);
    out.push(h('div', { class: 'hse-crumbs' }, chain.map((n) => h('button', {
      type: 'button', class: n === el ? 'is-on' : '', text: HS.describe(n),
      onclick: () => select([n]),
      onpointerenter: () => setHover(n), onpointerleave: () => setHover(null)
    }))));
  } else {
    out.push(h('div', { class: 'hse-crumbs' }, h('button', { class: 'is-on', text: els.length + ' 個の要素' })));
  }

  out.push(h('div', { class: 'hse-actions' },
    one && canEditText(el) ? iconButton('text', 'テキストを編集 (Enter)', () => startText(el)) : null,
    iconButton('copy', '複製 (' + MOD + 'D)', duplicateSelected),
    iconButton('up', '順序を前へ (' + MOD + '[)', () => reorder(-1)),
    iconButton('down', '順序を後ろへ (' + MOD + '])', () => reorder(1)),
    iconButton(free ? 'flow' : 'free', free ? 'フロー配置に戻す' : '自由配置にする (⌥ドラッグ)', toggleFree),
    one ? iconButton('note', '@fix コメント (C)', (e) => openNoteEditor(el, null, e.currentTarget.getBoundingClientRect())) : null,
    iconButton('trash', '削除 (⌫)', removeSelected, 'is-danger')));

  /* position and size */
  if (free) {
    out.push(section('配置',
      h('div', { class: 'hse-actions is-tight' },
        iconButton('alignL', '左揃え', () => align('left')),
        iconButton('alignC', '左右中央', () => align('center')),
        iconButton('alignR', '右揃え', () => align('right')),
        iconButton('alignT', '上揃え', () => align('top')),
        iconButton('alignM', '上下中央', () => align('middle')),
        iconButton('alignB', '下揃え', () => align('bottom')),
        els.length > 2 ? iconButton('distH', '左右に等間隔', () => distribute('x')) : null,
        els.length > 2 ? iconButton('distV', '上下に等間隔', () => distribute('y')) : null),
      one ? h('div', { class: 'hse-grid2' },
        styleNum('X', 'left', { read: () => el.offsetLeft }),
        styleNum('Y', 'top', { read: () => el.offsetTop }),
        styleNum('W', 'width', { read: () => el.offsetWidth, min: 8 }),
        isArrow(el)
          ? styleNum('角度', 'rotate', { read: () => parseFloat(el.style.rotate) || 0, unit: 'deg' })
          : styleNum('H', 'height', { read: () => el.offsetHeight, min: 8 })) : null));
  } else if (one) {
    const pcs = getComputedStyle(el.parentElement);
    const inFlex = pcs.display.includes('flex');
    const column = inFlex && pcs.flexDirection.startsWith('column');
    out.push(section('サイズ',
      h('div', { class: 'hse-grid2' },
        styleNum('W', 'width', { read: () => el.offsetWidth, min: 8 }),
        styleNum('H', 'height', { read: () => el.offsetHeight, min: 8 })),
      inFlex || pcs.display.includes('grid') ? styleSeg(column ? '左右' : '上下', 'align-self', column
        ? [['左', 'flex-start'], ['中', 'center'], ['右', 'flex-end'], ['伸', 'stretch']]
        : [['上', 'flex-start'], ['中', 'center'], ['下', 'flex-end'], ['伸', 'stretch']],
      cs.alignSelf === 'auto' || cs.alignSelf === 'normal' ? pcs.alignItems : cs.alignSelf) : null,
      el.style.translate ? field('ずらし', h('span', { class: 'hse-value', text: el.style.translate }), () => {
        edit(() => { el.style.removeProperty('translate'); tidy(el); }, 'translate');
        rebuild();
      }) : null));
  }

  /* specific kinds */
  if (one && el.tagName === 'HS-CHART') out.push(chartEditor(el));
  if (one && el.tagName === 'HS-COUNT') {
    out.push(section('数値', field('表示', textInput(el.textContent, (v) => edit(() => { el.textContent = v; }, 'count'), '3.4×'))));
  }
  if (one && (el.tagName === 'IMG' || el.matches('.media, figure'))) {
    const img = el.tagName === 'IMG' ? el : el.querySelector('img');
    out.push(section('画像',
      h('button', { class: 'hse-btn is-wide', type: 'button', text: img ? '画像を差し替え…' : '画像を入れる…', onclick: chooseImage }),
      img ? field('代替文', textInput(img.getAttribute('alt'), (v) => edit(() => img.setAttribute('alt', v), 'alt'), '画像の説明')) : null,
      img ? field('収め方', seg([['切り抜き', 'cover'], ['全体', 'contain']], getComputedStyle(img).objectFit, (v) => {
        edit(() => { img.style.objectFit = v; }, 'fit');
      })) : null));
  }
  if (one && el.matches('.cols')) {
    const ratios = [['1:1', ''], ['1:2', 'is-1-2'], ['2:1', 'is-2-1'], ['2:3', 'is-2-3'], ['3:2', 'is-3-2']];
    const currentRatio = (ratios.find((r) => r[1] && el.classList.contains(r[1])) || ratios[0])[1];
    out.push(section('カラム',
      field('列数', seg([['2', ''], ['3', '3'], ['4', '4']], el.getAttribute('data-cols') || '', (v) => {
        edit(() => (v ? el.setAttribute('data-cols', v) : el.removeAttribute('data-cols')), 'cols');
      })),
      field('比率', seg(ratios, currentRatio, (v) => {
        edit(() => {
          ratios.forEach((r) => r[1] && el.classList.remove(r[1]));
          if (v) el.classList.add(v);
          tidy(el);
        }, 'ratio');
      }))));
  }

  /* text */
  const hasText = els.some((x) => x.textContent.trim() && !x.matches('hs-chart, img'));
  if (hasText) {
    const fontPx = parseFloat(cs.fontSize) || 32;
    const lh = parseFloat(cs.lineHeight);
    const weight = Number(cs.fontWeight) >= 650 ? '700' : Number(cs.fontWeight) >= 480 ? '500' : '400';
    out.push(section('テキスト',
      h('div', { class: 'hse-grid2' },
        styleNum('サイズ', 'font-size', { min: 8, max: 400 }),
        styleNum('行間', 'line-height', { step: 0.05, min: 0.8, max: 3, unit: '', read: () => (isNaN(lh) ? 1.6 : lh / fontPx) })),
      styleSeg('太さ', 'font-weight', [['細', '400'], ['中', '500'], ['太', '700']], weight),
      styleSeg('揃え', 'text-align', [['左', 'left'], ['中', 'center'], ['右', 'right']],
        cs.textAlign === 'start' ? 'left' : cs.textAlign),
      swatches('文字色', 'color', ['--fg', '--heading', '--muted', '--accent', '--accent-2', '--on-accent'])));
  }

  /* appearance */
  const container = cs.display.includes('flex') || cs.display.includes('grid');
  out.push(section('見た目',
    els.every(isArrow)
      ? swatches('色', 'color', ['--accent', '--accent-2', '--heading', '--muted', '--on-accent'])
      : swatches('背景', 'background-color', ['--bg', '--surface', '--accent-soft', '--accent', '--accent-2', '--heading']),
    h('div', { class: 'hse-grid2' },
      styleNum('角丸', 'border-radius', { min: 0, read: () => parseFloat(cs.borderTopLeftRadius) || 0 }),
      styleNum('不透明', 'opacity', { step: 0.05, min: 0, max: 1, unit: '', read: () => parseFloat(cs.opacity) }),
      styleNum('余白 縦', 'padding-block', { min: 0, read: () => parseFloat(cs.paddingTop) || 0 }),
      styleNum('余白 横', 'padding-inline', { min: 0, read: () => parseFloat(cs.paddingLeft) || 0 }),
      container ? styleNum('間隔', 'gap', { min: 0, read: () => parseFloat(cs.rowGap) || parseFloat(cs.columnGap) || 0 }) : null)));

  /* steps and morph */
  if (one) {
    const stepInput = h('input', { class: 'hse-input hse-num', type: 'number', min: 0, value: el.getAttribute('data-step') || (el.hasAttribute('data-step') ? HS.stepsOf(ed.slide).map.get(el) : 0) });
    stepInput.addEventListener('input', () => {
      const v = Number(stepInput.value);
      edit(() => (v > 0 ? el.setAttribute('data-step', v) : el.removeAttribute('data-step')), 'step');
    });
    stepInput.addEventListener('change', rebuild);
    const fx = h('select', { class: 'hse-input' },
      [['', 'フェード'], ['up', '下から'], ['left', '左から'], ['zoom', 'ズーム'], ['blur', 'ぼかし'], ['wipe', 'ワイプ']]
        .map(([v, l]) => h('option', { value: v, text: l, selected: (el.getAttribute('data-fx') || '') === v })));
    fx.addEventListener('change', () => edit(() => (fx.value ? el.setAttribute('data-fx', fx.value) : el.removeAttribute('data-fx')), 'fx'));
    out.push(section('アニメーション',
      field('ステップ', stepInput),
      el.hasAttribute('data-step') ? field('出し方', fx) : null,
      field('モーフ名', textInput(el.getAttribute('data-morph'), (v) => {
        edit(() => (v ? el.setAttribute('data-morph', v) : el.removeAttribute('data-morph')), 'morph');
      }, '前後のスライドと同じ名前'))));
  }

  /* classes */
  const cls = h('input', {
    class: 'hse-input hse-mono', type: 'text', spellcheck: false,
    value: Array.from(el.classList).filter((c) => !c.startsWith('hs-')).join(' ')
  });
  cls.addEventListener('change', () => {
    edit(() => els.forEach((x) => {
      const runtime = Array.from(x.classList).filter((c) => c.startsWith('hs-'));
      x.className = cls.value.trim().split(/\s+/).filter(Boolean).concat(runtime).join(' ');
      tidy(x);
    }), 'class');
    rebuild();
  });
  const special = one ? contextClasses(el) : [];
  out.push(section('クラス',
    special.length ? chips('バリエーション', special) : null,
    chips('共通', ['grow', 'muted', 'small', 'accent', 'center']),
    one ? cls : null,
    els.some((x) => x.getAttribute('style')) ? h('button', {
      class: 'hse-btn is-wide', type: 'button', text: 'インライン指定をすべて解除',
      onclick: () => {
        edit(() => els.forEach((x) => {
          if (isFree(x)) {
            const keep = ['left', 'top', 'width', 'height', 'rotate'].map((p) => [p, x.style.getPropertyValue(p)]);
            x.removeAttribute('style');
            keep.forEach(([p, v]) => v && x.style.setProperty(p, v));
          } else {
            x.removeAttribute('style');
          }
        }), 'clear');
        rebuild();
      }
    }) : null));

  return out;
}

/* ================= slide inspector ================= */

const LAYOUT_NAMES = [['', '標準'], ['cover', '表紙'], ['section', '章扉'], ['statement', '一文'],
  ['quote', '引用'], ['center', '中央'], ['split', '分割'], ['hero', 'ヒーロー'], ['end', '締め']];

function slidePanel() {
  const slide = ed.slide;
  const setAttr = (name, value, key) => mutate(() => {
    if (value) slide.setAttribute(name, value);
    else slide.removeAttribute(name);
  }, { key: 'slide:' + key, source: 'inspector' });

  const select_ = (options, current, onChange) => {
    const el = h('select', { class: 'hse-input' },
      options.map(([v, l]) => h('option', { value: v, text: l, selected: v === current })));
    el.addEventListener('change', () => onChange(el.value));
    return el;
  };

  const notesEl = slide.querySelector(':scope > .notes');
  const notes = h('textarea', {
    class: 'hse-input', rows: 5, placeholder: '話すこと。発表者ビューにだけ出ます',
    value: notesEl ? notesEl.textContent.replace(/^\s+|\s+$/g, '').replace(/\n\s+/g, '\n') : ''
  });
  notes.addEventListener('input', () => {
    mutate(() => {
      let aside = slide.querySelector(':scope > .notes');
      const text = notes.value.trim();
      if (!text) {
        if (aside) aside.remove();
        return;
      }
      if (!aside) {
        aside = h('aside', { class: 'notes' });
        slide.append(document.createTextNode('  '), aside, document.createTextNode('\n'));
      }
      aside.textContent = text;
    }, { key: 'slide:notes', source: 'inspector' });
  });

  const issues = (ed.issues.get(slide) || []).filter((i) => i.level !== 'note');
  const themes = getThemes();
  const deck = HS.deck;
  const footer = textInput(deck.getAttribute('data-footer'), () => {}, '全スライドの左下に出す文字');
  footer.addEventListener('change', () => setDeckAttr('data-footer', footer.value.trim()));

  return [
    h('div', { class: 'hse-crumbs' }, h('button', { class: 'is-on', text: 'スライド ' + (HS.state.index + 1) })),
    section('レイアウト',
      h('div', { class: 'hse-tiles' }, LAYOUT_NAMES.map(([value, label]) => h('button', {
        type: 'button', class: (slide.getAttribute('data-layout') || '') === value ? 'is-on' : '', text: label,
        onclick: () => { setAttr('data-layout', value, 'layout'); rebuild(); }
      }))),
      slide.getAttribute('data-layout') === 'split' ? field('左右', seg([['画像が左', ''], ['画像が右', 'is-flip']],
        slide.classList.contains('is-flip') ? 'is-flip' : '', (v) => {
          mutate(() => slide.classList.toggle('is-flip', !!v), { source: 'inspector' });
        })) : null),
    section('トーン',
      seg([['標準', ''], ['反転', 'invert'], ['アクセント', 'accent'], ['ソフト', 'soft']],
        slide.getAttribute('data-tone') || '', (v) => setAttr('data-tone', v, 'tone'))),
    section('切り替え',
      field('このスライド', select_([['', 'デッキの既定'], ['morph', 'モーフ'], ['fade', 'フェード'], ['slide', 'スライド'], ['zoom', 'ズーム'], ['none', 'なし']],
        slide.getAttribute('data-transition') || '', (v) => setAttr('data-transition', v, 'transition'))),
      field('ページ番号', seg([['表示', ''], ['隠す', 'off']], slide.getAttribute('data-number') || '', (v) => setAttr('data-number', v, 'number')))),
    section('ノート', notes),
    issues.length ? section('このスライドの問題', issues.map(issueRow.bind(null, slide))) : null,
    section('デッキ全体',
      themes.length ? field('テーマ', select_(themes.map((t) => [t, t]), currentTheme(), (v) => setTheme(v))) : null,
      field('切り替え', select_([['', 'モーフ'], ['fade', 'フェード'], ['slide', 'スライド'], ['zoom', 'ズーム'], ['none', 'なし']],
        deck.getAttribute('data-transition') || '', (v) => setDeckAttr('data-transition', v))),
      field('フッター', footer),
      field('進捗バー', seg([['なし', ''], ['表示', 'on']], deck.hasAttribute('data-progress') ? 'on' : '',
        (v) => setDeckAttr('data-progress', v ? 'on' : null))))
  ];
}

/* ================= layers ================= */

function layerIcon(el) {
  if (el.tagName === 'IMG' || el.matches('.media, figure')) return 'image';
  if (el.tagName === 'HS-CHART') return 'chart';
  if (isArrow(el)) return 'arrow';
  if (el.matches('.shape')) return 'rect';
  if (canEditText(el)) return 'text';
  return 'block';
}

function layersPanel() {
  const rows = [];
  const walk = (parent, depth) => {
    for (const el of parent.children) {
      if (el.matches('.notes') || isInlineEl(el) || el.closest('hs-chart') !== (el.tagName === 'HS-CHART' ? el : null)) continue;
      const leaf = canEditText(el);
      rows.push(h('button', {
        type: 'button',
        class: 'hse-layer' + (ed.sel.includes(el) ? ' is-on' : ''),
        style: 'padding-left:' + (12 + depth * 17) + 'px',
        onclick: (e) => select(e.shiftKey ? ed.sel.concat(el) : [el]),
        ondblclick: () => { if (leaf) startText(el); },
        onpointerenter: () => setHover(el),
        onpointerleave: () => setHover(null)
      },
        icon(layerIcon(el), 13),
        h('span', { class: 'hse-layer-name', text: HS.describe(el) }),
        h('span', { class: 'hse-layer-text', text: leaf ? HS.snippet(el, 22) : '' }),
        isFree(el) ? h('span', { class: 'hse-layer-tag', text: 'free' }) : null));
      if (!leaf && el.tagName !== 'HS-CHART' && el.tagName !== 'TABLE') walk(el, depth + 1);
    }
  };
  walk(ed.slide, 0);
  return rows.length ? rows : [h('div', { class: 'hse-empty', text: 'このスライドは空です' })];
}

/* ================= review ================= */

function issueRow(slide, issue) {
  return h('button', {
    type: 'button', class: 'hse-issue-row is-' + issue.level,
    onclick: () => {
      HS.go(HS.slides.indexOf(slide), 0);
      const el = issue.path.length ? fromPath(issue.path, slide) : null;
      select(el ? [el] : []);
    }
  },
    h('span', { class: 'hse-issue-dot' }),
    h('span', { class: 'hse-issue-msg', text: issue.message }),
    h('span', { class: 'hse-issue-on', text: issue.label + (issue.text ? '  “' + issue.text + '”' : '') }));
}

function reviewPanel() {
  const out = [];
  let total = 0;
  HS.slides.forEach((slide, i) => {
    const issues = ed.issues.get(slide) || [];
    if (!issues.length) return;
    total += issues.length;
    out.push(h('section', { class: 'hse-sec' },
      h('h4', { text: (i + 1) + '  ' + (HS.titleOf(slide) || '（無題）') }),
      issues.map((issue) => {
        const row = issueRow(slide, issue);
        if (issue.level === 'note' && slide === ed.slide) {
          row.appendChild(iconButton('check', '解決して削除', () => {
            const el = issue.path.length ? fromPath(issue.path, slide) : slide;
            const note = HS.notesIn(slide).find((n) => n.el === el && n.text === issue.message);
            if (note) resolveNote(note);
          }, 'hse-resolve'));
        }
        return row;
      })));
  });
  if (!total) out.push(h('div', { class: 'hse-empty' }, 'レイアウトの問題も @fix コメントもありません'));
  out.unshift(h('div', { class: 'hse-hint' },
    '@fix はソースに ', h('code', { text: '<!-- @fix: … -->' }), ' として残ります。',
    h('code', { text: 'hs check' }), ' で一覧でき、Claude はそこを直してコメントを消します。'));
  return out;
}

/* ================= inspector shell ================= */

let rebuildQueued = false;

function rebuild() {
  if (rebuildQueued) return;
  rebuildQueued = true;
  requestAnimationFrame(() => {
    rebuildQueued = false;
    if (HS.state.mode !== 'edit' || !ed.slide) return;
    const scroll = sideBody.scrollTop;
    ed.sel = ed.sel.filter((el) => el.isConnected);
    let content;
    if (tab === 'layers') content = layersPanel();
    else if (tab === 'review') content = reviewPanel();
    else content = ed.sel.length ? elementPanel() : slidePanel();
    sideBody.replaceChildren(...content.flat().filter(Boolean));
    sideBody.scrollTop = scroll;
    side.querySelectorAll('.hse-tab').forEach((b) => b.classList.toggle('is-on', b.dataset.tab === tab));
  });
}

function updateBar() {
  const issues = ed.issues.get(ed.slide) || [];
  const errors = issues.filter((i) => i.level === 'error').length;
  const warns = issues.filter((i) => i.level === 'warn').length;
  let notes = 0;
  ed.issues.forEach((list) => { notes += list.filter((i) => i.level === 'note').length; });
  barInfo.textContent = (HS.state.index + 1) + ' / ' + HS.slides.length;
  barZoom.textContent = Math.round(HS.view.zoom * 100) + '%';
  fill(barIssues,
    errors ? h('span', { class: 'is-error', text: '● 問題 ' + errors }) : null,
    warns ? h('span', { class: 'is-warn', text: '● 注意 ' + warns }) : null,
    notes ? h('span', { class: 'is-note', text: '● @fix ' + notes }) : null,
    !errors && !warns && !notes ? h('span', { text: '問題なし' }) : null);
}

function updateStatus() {
  const map = {
    saved: ['保存済み', ''], dirty: ['編集中…', 'is-busy'], saving: ['保存中…', 'is-busy'],
    error: ['保存できません', 'is-error']
  };
  const [text, cls] = map[sync.status] || map.saved;
  statusEl.className = 'hse-status ' + cls;
  statusEl.textContent = text;
  statusEl.title = sync.detail || '';
  if (sync.status === 'error' && sync.detail) toast('保存できません: ' + sync.detail, 'error');
}

/* ================= build ================= */

function toolbar() {
  const tool = (name, title, onclick, cls) => iconButton(name, title, onclick, cls);
  const noteBtn = tool('note', '@fix コメントを置く (C)', () => setTool(ed.tool === 'note' ? 'select' : 'note'));
  ed.on('tool', () => noteBtn.classList.toggle('is-on', ed.tool === 'note'));
  statusEl = h('span', { class: 'hse-status' });
  return h('div', { class: 'hse-top' },
    h('div', { class: 'hse-top-left' },
      h('span', { class: 'hse-title', text: document.title || 'deck' }),
      statusEl),
    h('div', { class: 'hse-tools' },
      tool('text', 'テキスト (T)', () => insertObject(OBJECTS[0])),
      tool('rect', '図形', (e) => menu(OBJECTS.slice(1).map((o) => ({
        label: o.label, keys: o.key, icon: o.icon, run: () => insertObject(o)
      })), e.currentTarget)),
      tool('image', '画像 (I)', chooseImage),
      tool('chart', 'グラフ', (e) => menu(BLOCKS.filter((b) => b.id.startsWith('chart-')).map((b) => ({
        label: b.label.replace('グラフ: ', ''), run: () => insertBlock(b)
      })), e.currentTarget)),
      tool('block', 'ブロックを挿入', (e) => menu(BLOCKS.filter((b) => !b.id.startsWith('chart-')).map((b) => ({
        label: b.label, run: () => insertBlock(b)
      })), e.currentTarget)),
      h('span', { class: 'hse-sep' }),
      tool('plus', '新しいスライド (N)', (e) => openGallery(undefined, e.currentTarget)),
      h('span', { class: 'hse-sep' }),
      noteBtn),
    h('div', { class: 'hse-top-right' },
      tool('undo', '元に戻す (' + MOD + 'Z)', undo),
      tool('redo', 'やり直す (⇧' + MOD + 'Z)', redo),
      h('span', { class: 'hse-sep' }),
      h('button', { class: 'hse-kbtn', type: 'button', title: 'コマンドパレット', onclick: openPalette }, icon('search', 14), h('kbd', { text: MOD + 'K' })),
      tool('more', 'ショートカット (?)', openHelp),
      h('button', { class: 'hse-btn is-primary', type: 'button', title: '発表する (' + MOD + '↵)', onclick: () => present() }, icon('play', 12), '発表')));
}

/* The stage is whatever the panels leave free; measured, so the CSS
 * alone decides how big the chrome is. */
function viewport() {
  const pad = 36;
  const left = film.getBoundingClientRect().right;
  const right = side.getBoundingClientRect().left;
  const top = root.firstElementChild.getBoundingClientRect().bottom;
  const bottom = root.lastElementChild.getBoundingClientRect().top;
  return {
    x: left + pad,
    y: top + pad,
    w: Math.max(200, right - left - pad * 2),
    h: Math.max(120, bottom - top - pad * 2)
  };
}

function applyMode() {
  const editing = HS.state.mode === 'edit';
  root.hidden = !editing;
  HS.setViewport(editing ? viewport : null);
  if (editing) {
    syncFilm();
    rebuild();
    updateBar();
  }
}

export function initPanels() {
  film = h('div', { class: 'hse-film' });
  sideBody = h('div', { class: 'hse-side-body' });
  const tabBtn = (id, label, iconName) => h('button', {
    type: 'button', class: 'hse-tab', 'data-tab': id,
    onclick: () => { tab = id; rebuild(); }
  }, icon(iconName, 13), label);
  side = h('div', { class: 'hse-side' },
    h('div', { class: 'hse-tabs' }, tabBtn('design', 'デザイン', 'sliders'), tabBtn('layers', 'レイヤー', 'layers'), tabBtn('review', 'レビュー', 'note')),
    sideBody);
  barInfo = h('span');
  barIssues = h('button', { class: 'hse-bar-issues', type: 'button', onclick: () => { tab = 'review'; rebuild(); } });
  barZoom = h('button', { class: 'hse-bar-zoom', type: 'button', title: '全体を表示 (' + MOD + '0)', onclick: resetZoom });
  root = h('div', { class: 'hse hse-root', hidden: true },
    toolbar(),
    film,
    side,
    h('div', { class: 'hse-bar' }, barInfo, barIssues, h('span', { class: 'hse-bar-space' }),
      h('span', { class: 'hse-bar-hint', text: 'ドラッグで並べ替え ・ ⌥ドラッグで自由配置 ・ ダブルクリックで文字 ・ ' + MOD + 'K でコマンド' }),
      barZoom));
  document.body.appendChild(root);

  /* thumbnails follow the slide being edited */
  let thumbTimer = 0;
  ed.on('change', (e) => {
    const slide = ed.slide;
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(() => refreshThumb(slide), e.source === 'stage' ? 400 : 250);
    if (e.source === 'inspector' || e.source === 'text') return;
    if (e.source === 'stage' && tab === 'layers') return;
    rebuild();
  });
  ed.on('select', rebuild);
  ed.on('slides', () => { syncFilm(); rebuild(); updateBar(); });
  ed.on('issues', () => {
    updateBar();
    if (tab === 'review' || (tab === 'design' && !ed.sel.length &&
        !side.contains(document.activeElement))) rebuild();
  });
  ed.on('sync', updateStatus);
  HS.on('change', () => {
    if (HS.state.mode !== 'edit') return;
    markActive();
    updateBar();
    rebuild();
  });
  HS.on('layout', () => { if (barZoom) barZoom.textContent = Math.round(HS.view.zoom * 100) + '%'; });
  HS.on('mode', applyMode);
  addEventListener('load', () => HS.slides.forEach((s) => scheduleAudit(s, 300)));
  updateStatus();
  applyMode();
  requestDraw();
}
