/* Shared editor state and event bus.
 *
 * Events:
 *   select   the selection changed
 *   change   the active slide's DOM changed   {source, structural}
 *   slides   the slide list changed (added, removed, reordered, swapped)
 *   sync     the save status changed
 *   tool     the active tool changed
 *   issues   audit results were refreshed */

export const HS = window.HS;

const listeners = {};

export const ed = {
  sel: [],            /* selected elements, all inside the active slide */
  textEl: null,       /* element being edited as text */
  tool: 'select',     /* select | note */
  issues: new Map(),  /* slide element -> audit results */

  on(event, fn) {
    (listeners[event] = listeners[event] || []).push(fn);
  },

  emit(event, detail) {
    (listeners[event] || []).slice().forEach((fn) => fn(detail || {}));
  },

  get slide() { return HS.current; }
};

export const isFree = (el) => el.classList.contains('free');
export const isArrow = (el) => el.classList.contains('arrow');

/* Child-index path from the slide to an element, and back. Used to
 * carry a selection across undo, where the nodes are rebuilt. */
export function pathOf(el, slide) {
  const path = [];
  for (let n = el; n && n !== slide; n = n.parentElement) {
    path.unshift(Array.prototype.indexOf.call(n.parentElement.children, n));
  }
  return path;
}

export function fromPath(path, slide) {
  let n = slide;
  for (const i of path) {
    n = n && n.children[i];
  }
  return n && n !== slide ? n : null;
}

/* Indentation for a node inserted as a child of `parent`, so that
 * markup added by the editor stays readable in the source. */
export function indentFor(parent, slide) {
  let depth = 1;
  for (let n = parent; n && n !== slide; n = n.parentElement) depth++;
  return '\n' + '  '.repeat(depth);
}

export function fromHTML(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

/* Insert `el` into `parent` before `ref` (or at the end), keeping one
 * line per element in the source. */
export function place(parent, el, ref, slide) {
  const indent = document.createTextNode(indentFor(parent, slide));
  if (ref) {
    parent.insertBefore(el, ref);
    el.after(indent);
    return;
  }
  const last = parent.lastChild;
  const trailing = last && last.nodeType === 3 && !last.data.trim() ? last : null;
  parent.insertBefore(el, trailing);
  el.before(indent);
  if (!trailing) el.after(document.createTextNode(parent === slide ? '\n' : indentFor(parent.parentElement, slide)));
}
