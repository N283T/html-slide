/* Small DOM toolkit for the editor chrome: element builder, icons,
 * toast, menus and popovers. Everything it creates carries the `hse`
 * class, which is how the rest of the editor tells chrome from deck. */

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key === 'html') el.innerHTML = value;
      else if (key === 'style') el.style.cssText = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else if (key in el && key !== 'list') el[key] = value;
      else el.setAttribute(key, value);
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}

/* 24×24 stroke icons. */
const PATHS = {
  cursor: 'M5 3l14 7.5-6 1.8-1.8 6z',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  rect: 'M4 6h16v12H4z',
  ellipse: 'M12 5a8 7 0 100 14 8 7 0 000-14z',
  arrow: 'M4 18L19 5M11 5h8v8',
  image: 'M4 5h16v14H4zM4 15l4.5-4.5 4 4 3-3L20 16M9 9.5a1 1 0 100-.01',
  chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-7',
  block: 'M4 5h16M4 10h10M4 15h16M4 20h7',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  undo: 'M9 7L4 12l5 5M4 12h10a5 5 0 010 10h-2',
  redo: 'M15 7l5 5-5 5M20 12H10a5 5 0 000 10h2',
  play: 'M7 4l13 8-13 8z',
  layers: 'M12 4l9 5-9 5-9-5zM3 14l9 5 9-5',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  note: 'M5 5h14v10H10l-5 4z',
  check: 'M5 12.5l4.5 4.5L19 7',
  close: 'M6 6l12 12M18 6L6 18',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM16 16l4.5 4.5',
  pin: 'M12 3a6 6 0 016 6c0 4.5-6 12-6 12S6 13.500 6 9a6 6 0 016-6zM12 7a2 2 0 100 4 2 2 0 000-4z',
  free: 'M5 5h6v6H5zM13 13h6v6h-6zM11 8h5v5M8 11v5h5',
  flow: 'M5 5h14v4H5zM5 11h14v4H5zM5 17h8v2H5z',
  alignL: 'M4 4v16M8 7h11v4H8zM8 14h7v4H8z',
  alignC: 'M12 4v16M6 7h12v4H6zM8 14h8v4H8z',
  alignR: 'M20 4v16M5 7h11v4H5zM9 14h7v4H9z',
  alignT: 'M4 4h16M7 8h4v11H7zM14 8h4v7h-4z',
  alignM: 'M4 12h16M7 6h4v12H7zM14 8h4v8h-4z',
  alignB: 'M4 20h16M7 5h4v11H7zM14 9h4v7h-4z',
  distH: 'M4 4v16M20 4v16M9 8h6v8H9z',
  distV: 'M4 4h16M4 20h16M8 9h8v6H8z',
  warn: 'M12 4l9 16H3zM12 10v5M12 17.500v.5',
  palette: 'M12 4a8 8 0 100 16c1.500 0 2-1 2-2s-.5-2 1-2h2a3 3 0 003-3c0-5-4-9-8-9zM8 11a1 1 0 100-.01M12 8a1 1 0 100-.01M16 11a1 1 0 100-.01',
  more: 'M6 12a1 1 0 100-.01M12 12a1 1 0 100-.01M18 12a1 1 0 100-.01',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  line: 'M5 19L19 5',
  step: 'M4 18h5v-5h5V8h6',
  link: 'M10 14a4 4 0 005.5 0l3-3a4 4 0 00-5.500-5.500l-1 1M14 10a4 4 0 00-5.500 0l-3 3a4 4 0 005.500 5.500l1-1'
};

/* The chrome is drawn 1.2× its original size; icons follow. */
const ICON_SCALE = 1.2;

export function icon(name, size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const px = Math.round((size || 16) * ICON_SCALE);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', px);
  svg.setAttribute('height', px);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.classList.add('hse-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', PATHS[name] || PATHS.more);
  svg.appendChild(path);
  return svg;
}

export function iconButton(name, title, onclick, extra) {
  return h('button', {
    class: 'hse-ib' + (extra ? ' ' + extra : ''), title, type: 'button',
    onclick: (e) => { e.stopPropagation(); onclick(e); }
  }, icon(name));
}

/* ---- toast ---- */

let toastEl = null;
let toastTimer = 0;

export function toast(message, kind) {
  if (!toastEl) {
    toastEl = h('div', { class: 'hse hse-toast' });
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.dataset.kind = kind || '';
  toastEl.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), kind === 'error' ? 4500 : 2000);
}

/* ---- floating layers: one menu / popover open at a time ---- */

let floating = null;

export function closeFloating() {
  if (floating) {
    floating.remove();
    floating = null;
  }
}

addEventListener('pointerdown', (e) => {
  if (floating && !floating.contains(e.target)) closeFloating();
}, true);

function place(el, x, y, anchor) {
  document.body.appendChild(el);
  const r = el.getBoundingClientRect();
  let left = x;
  let top = y;
  if (anchor && anchor.center) {
    top = anchor.y;
  } else if (anchor) {
    left = anchor.left;
    top = anchor.bottom + 6;
    if (top + r.height > innerHeight - 8) top = Math.max(8, anchor.top - r.height - 6);
  }
  if (anchor && anchor.center) left = (innerWidth - r.width) / 2;
  left = Math.max(8, Math.min(left, innerWidth - r.width - 8));
  top = Math.max(8, Math.min(top, innerHeight - r.height - 8));
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

/* items: [{label, keys?, icon?, run, danger?, disabled?, checked?} | '-'] */
export function menu(items, at) {
  closeFloating();
  const el = h('div', { class: 'hse hse-menu', oncontextmenu: (e) => e.preventDefault() });
  for (const item of items) {
    if (!item) continue;
    if (item === '-') {
      el.appendChild(h('div', { class: 'hse-menu-sep' }));
      continue;
    }
    el.appendChild(h('button', {
      class: 'hse-menu-item' + (item.danger ? ' is-danger' : ''),
      type: 'button',
      disabled: !!item.disabled,
      onclick: () => {
        closeFloating();
        item.run();
      }
    },
      h('span', { class: 'hse-menu-icon' }, item.checked ? icon('check', 14) : item.icon ? icon(item.icon, 14) : null),
      h('span', { class: 'hse-menu-label', text: item.label }),
      item.keys ? h('kbd', { text: item.keys }) : null));
  }
  floating = el;
  if (at instanceof Element) place(el, 0, 0, at.getBoundingClientRect());
  else place(el, at.x, at.y);
  return el;
}

export function popover(content, at, className) {
  closeFloating();
  const el = h('div', { class: 'hse hse-popover' + (className ? ' ' + className : '') }, content);
  floating = el;
  if (at instanceof Element) place(el, 0, 0, at.getBoundingClientRect());
  else if (at && (at.left != null || at.center)) place(el, 0, 0, at);
  else place(el, at.x, at.y);
  return el;
}

export const isChrome = (target) =>
  !!(target && target.closest && target.closest('.hse'));

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl+';
