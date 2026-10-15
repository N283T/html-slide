/* Speaker-notes pane under the stage (M toggles it).
 *
 * Edits the active slide's <aside class="notes"> as rich text, so the
 * paragraphs, lists and rules a note is written with survive. The pane
 * height and the text size are remembered per browser. */

import { HS, ed } from './core.js';
import { h, icon, iconButton } from './ui.js';
import { mutate } from './sync.js';

const PREFS_KEY = 'hse-notes';
const prefs = { open: false, height: 220, size: 17 };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY)) || {}); } catch { /* private mode */ }

let pane, body, title, sizeLabel, toggleBtn;
let shownFor = null;

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
}

function asideOf(slide) {
  return slide && slide.querySelector(':scope > .notes');
}

/* Show the active slide's notes, unless the pane is being typed into
 * for that same slide (re-rendering would move the caret). */
function render(force) {
  if (!pane || pane.hidden) return;
  const slide = ed.slide;
  if (!force && slide === shownFor && pane.contains(document.activeElement)) return;
  shownFor = slide;
  const aside = asideOf(slide);
  body.innerHTML = aside ? aside.innerHTML.trim() : '';
  title.textContent = 'ノート · スライド ' + (HS.state.index + 1);
}

/* Chrome adds inline styles when text is merged or pasted; notes
 * should stay plain markup. */
function cleanHTML() {
  body.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'));
  body.querySelectorAll('span:not([class])').forEach((el) => el.replaceWith(...el.childNodes));
  const html = body.innerHTML.trim();
  return body.textContent.trim() || body.querySelector('hr, img') ? html : '';
}

function write() {
  const slide = shownFor;
  if (!slide || !slide.isConnected) return;
  const html = cleanHTML();
  mutate(() => {
    let aside = asideOf(slide);
    if (!html) {
      if (aside) {
        const before = aside.previousSibling;
        if (before && before.nodeType === 3 && !before.data.trim()) before.remove();
        aside.remove();
      }
      return;
    }
    if (!aside) {
      aside = h('aside', { class: 'notes' });
      slide.append(document.createTextNode('  '), aside, document.createTextNode('\n'));
    }
    aside.innerHTML = html;
  }, { key: 'slide:notes', source: 'notes', slide });
}

function setSize(px) {
  prefs.size = Math.max(12, Math.min(40, px));
  body.style.fontSize = prefs.size + 'px';
  sizeLabel.textContent = prefs.size + 'px';
  savePrefs();
}

function setHeight(px) {
  prefs.height = Math.max(90, Math.min(innerHeight * 0.7, px));
  pane.style.height = prefs.height + 'px';
  savePrefs();
  HS.layout();
}

export function notesOpen() {
  return !!pane && !pane.hidden;
}

export function toggleNotes(force) {
  if (!pane) return;
  const open = force != null ? force : pane.hidden;
  pane.hidden = !open;
  prefs.open = open;
  savePrefs();
  if (toggleBtn) toggleBtn.classList.toggle('is-on', open);
  HS.layout();
  ed.emit('notes');
  if (open) {
    render(true);
    body.focus();
  }
}

export function notesToggleButton() {
  toggleBtn = iconButton('notes', 'ノート欄 (M)', () => toggleNotes());
  toggleBtn.classList.toggle('is-on', prefs.open);
  return toggleBtn;
}

export function initNotes() {
  title = h('span', { class: 'hse-notes-title' });
  sizeLabel = h('span', { class: 'hse-notes-size' });
  body = h('div', {
    class: 'hse-notes-body', contentEditable: 'true', spellcheck: false,
    'data-placeholder': '話すこと。発表者ビューにだけ出ます'
  });
  const grip = h('div', { class: 'hse-notes-grip', title: 'ドラッグで高さを調整' });
  pane = h('div', { class: 'hse-notes', hidden: true },
    grip,
    h('div', { class: 'hse-notes-head' },
      icon('notes', 14), title, h('span', { class: 'hse-bar-space' }),
      h('button', { class: 'hse-notes-btn', type: 'button', title: '文字を小さく', text: 'A−', onclick: () => setSize(prefs.size - 1) }),
      sizeLabel,
      h('button', { class: 'hse-notes-btn', type: 'button', title: '文字を大きく', text: 'A＋', onclick: () => setSize(prefs.size + 1) }),
      iconButton('close', '閉じる (M)', () => toggleNotes(false))),
    body);

  /* New paragraphs as <p>, like the notes are written. */
  body.addEventListener('focus', () => document.execCommand('defaultParagraphSeparator', false, 'p'));
  body.addEventListener('input', write);
  body.addEventListener('paste', (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); body.blur(); }
  });

  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const bottom = pane.getBoundingClientRect().bottom;
    const move = (ev) => setHeight(bottom - ev.clientY);
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
  });

  HS.on('change', (e) => { if (e.slideChanged) render(true); });
  ed.on('slides', () => render(true));
  ed.on('change', (e) => { if (e.source !== 'notes') render(); });

  pane.style.height = prefs.height + 'px';
  setSize(prefs.size);
  pane.hidden = !prefs.open;
  return pane;
}
