/* Script-generated markup: what a deck's own scripts add to a slide
 * must never be written back to the source.
 *
 * A deck can fill an empty container, append a canvas or set an SVG
 * path's `d` from an inline script. Those nodes exist in the live DOM
 * only; the file already says how to rebuild them (the script). If the
 * editor serialized them, the next load would run the script on top of
 * the saved copy and duplicate everything.
 *
 * Each slide keeps `ref`, the authored markup as of the last editor
 * change (first: the slide's source). Before the editor changes a
 * slide, `align` compares the live slide with that reference. At that
 * moment the two differ only by what scripts did, so every difference
 * is recorded:
 *
 *   gen    nodes the live slide has and the reference does not
 *   attrs  attributes a script changed, with their authored value
 *   kids   elements whose authored children a script replaced
 *
 * `cleanClone` consults those records and writes the authored side.
 * A script can also mark a node it creates with `data-hs-generated`,
 * which always wins and needs no comparison. */

const gen = new WeakSet();
const attrs = new WeakMap();
const kids = new WeakMap();

const isRuntimeClass = (c) => c.startsWith('hs-');
const isRuntimeAttr = (n) => n.startsWith('data-hs-') || n === 'contenteditable' || n === 'spellcheck';
const blank = (n) => n.nodeType === 3 && !n.data.trim();

/* Could `a` (live) be the same node as `b` (reference)? Tag and id,
 * not attributes: a script may change those on a node it did not make. */
function same(a, b) {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType === 1) {
    return a.nodeName === b.nodeName && a.getAttribute('id') === b.getAttribute('id');
  }
  if (a.nodeType === 3) return blank(a) ? blank(b) : a.data.trim() === b.data.trim();
  return a.nodeType === 8 && a.data === b.data;
}

/* Longest common subsequence of two child lists, as index pairs. */
function match(live, ref) {
  const n = live.length;
  const m = ref.length;
  const pairs = [];
  if (!n || !m) return pairs;
  if (n * m > 4e6) {
    /* Too big to compare exhaustively: pair up the matching prefix. */
    for (let i = 0; i < Math.min(n, m) && same(live[i], ref[i]); i++) pairs.push([i, i]);
    return pairs;
  }
  const w = m + 1;
  const len = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      len[i * w + j] = same(live[i], ref[j])
        ? len[(i + 1) * w + j + 1] + 1
        : Math.max(len[(i + 1) * w + j], len[i * w + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (same(live[i], ref[j])) pairs.push([i++, j++]);
    else if (len[(i + 1) * w + j] >= len[i * w + j + 1]) i++;
    else j++;
  }
  return pairs;
}

const authoredAttr = (name, value) => (name === 'class'
  ? value.split(/\s+/).filter((c) => c && !isRuntimeClass(c)).join(' ')
  : value);

function alignAttrs(live, ref) {
  const names = new Set([...live.getAttributeNames(), ...ref.getAttributeNames()]);
  let found = null;
  for (const name of names) {
    if (isRuntimeAttr(name)) continue;
    const now = live.getAttribute(name);
    const was = ref.getAttribute(name);
    if (now != null && was != null ? authoredAttr(name, now) === authoredAttr(name, was) : now === was) continue;
    found = found || new Map();
    found.set(name, { was, seen: now });
  }
  if (found) attrs.set(live, found);
  else attrs.delete(live);
}

function alignNode(live, ref, skip) {
  if (live === skip) return;
  alignAttrs(live, ref);
  const a = Array.from(live.childNodes);
  const b = Array.from(ref.childNodes);
  const pairs = match(a, b);
  const taken = new Set(pairs.map((p) => p[0]));
  if (pairs.length < b.length) {
    /* A script removed or rewrote authored children: write the
     * authored ones back as they were. */
    kids.set(live, b.map((n) => n.cloneNode(true)));
    return;
  }
  kids.delete(live);
  a.forEach((n, i) => { if (!taken.has(i)) gen.add(n); });
  pairs.forEach(([i, j]) => {
    if (a[i].nodeType === 1) alignNode(a[i], b[j], skip);
  });
}

/* Record what scripts changed in `slide` relative to its reference.
 * `skip` is an element the editor is changing right now (text being
 * typed); its subtree is left alone. */
export function align(slide, ref, skip) {
  if (ref) alignNode(slide, ref, skip || null);
}

/* ---- serialization ---- */

const marked = (n) => n.nodeType === 1 && n.hasAttribute('data-hs-generated');

function restore(live, clone) {
  const fix = attrs.get(live);
  if (fix) {
    fix.forEach(({ was }, name) => {
      if (was == null) clone.removeAttribute(name);
      else clone.setAttribute(name, was);
    });
  }
  const own = kids.get(live);
  if (own) {
    clone.replaceChildren(...own.map((n) => n.cloneNode(true)));
    return;
  }
  const a = live.childNodes;
  const b = clone.childNodes;
  for (let i = a.length - 1; i >= 0; i--) {
    if (gen.has(a[i]) || marked(a[i])) b[i].remove();
    else if (a[i].nodeType === 1) restore(a[i], b[i]);
  }
}

/* A deep copy of `node` with script-generated content removed. */
export function authored(node) {
  const clone = node.cloneNode(true);
  restore(node, clone);
  return clone;
}

/* The editor changed an attribute a script had also changed: it is
 * the editor's now, so stop restoring the authored value. Call after
 * an editor change, never while a script may be running. */
export function claim(slide) {
  for (const el of [slide, ...slide.querySelectorAll('*')]) {
    const fix = attrs.get(el);
    if (!fix) continue;
    fix.forEach((v, name) => {
      if (el.getAttribute(name) !== v.seen) fix.delete(name);
    });
  }
}
