/* Commands: everything the editor can do, in one registry that the
 * keyboard, the toolbar, the context menu and the command palette all
 * draw from. Also the things commands need: snippets, clipboard,
 * image upload, entering and leaving presentation. */

import { HS, ed, isFree, fromHTML, indentFor, place } from './core.js';
import { h, menu, popover, closeFloating, toast, isChrome, MOD } from './ui.js';
import {
  mutate, undo, redo, save, cleanClone, serialize, upload,
  insertSlide, duplicateSlide, deleteSlide, setTheme, setDeckAttr, currentTheme
} from './sync.js';
import {
  select, pick, startText, commitText, removeSelected, duplicateSelected, reorder, nudge,
  selectParent, selectChild, selectSibling, toggleFree, align, distribute,
  setTool, openNoteEditor, resetZoom, zoomBy, isInlineEl, canEditText
} from './stage.js';

/* ================= snippets ================= */

const CHART_TABLE = (rows) => '\n  <table>\n' + rows.map((r) =>
  '    <tr>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('\n') + '\n  </table>\n';

export const BLOCKS = [
  { id: 'p', label: '本文', html: '<p>本文を入力</p>', edit: true },
  { id: 'h3', label: '小見出し', html: '<h3>小見出し</h3>', edit: true },
  { id: 'ul', label: '箇条書き', html: '<ul>\n  <li>項目</li>\n  <li>項目</li>\n  <li>項目</li>\n</ul>' },
  { id: 'ol', label: '番号付きリスト', html: '<ol>\n  <li>手順</li>\n  <li>手順</li>\n  <li>手順</li>\n</ol>' },
  { id: 'checklist', label: 'チェックリスト', html: '<ul class="checklist">\n  <li>できること</li>\n  <li>できること</li>\n  <li class="is-no">できないこと</li>\n</ul>' },
  { id: 'cols2', label: '2カラム', html: '<div class="cols grow">\n  <div>\n    <p>左のカラム</p>\n  </div>\n  <div>\n    <p>右のカラム</p>\n  </div>\n</div>' },
  { id: 'cards', label: 'カード 3枚', html: '<div class="cols is-stretch" data-cols="3">\n  <div class="card">\n    <h3>見出し</h3>\n    <p>説明文</p>\n  </div>\n  <div class="card is-accent">\n    <h3>見出し</h3>\n    <p>説明文</p>\n  </div>\n  <div class="card">\n    <h3>見出し</h3>\n    <p>説明文</p>\n  </div>\n</div>' },
  { id: 'card', label: 'カード', html: '<div class="card">\n  <h3>見出し</h3>\n  <p>説明文</p>\n</div>' },
  { id: 'callout', label: 'コールアウト', html: '<div class="callout">覚えて帰ってほしい一文</div>', edit: true },
  { id: 'takeaway', label: '結論の帯', html: '<div class="takeaway">このスライドの結論</div>', edit: true },
  { id: 'stat', label: '大きな数字', html: '<div class="stat"><hs-count>42%</hs-count><span>何の数字か</span></div>' },
  { id: 'quote', label: '引用', html: '<blockquote>引用文</blockquote>', edit: true },
  { id: 'tag', label: 'タグ', html: '<span class="tag">TAG</span>', edit: true },
  { id: 'table', label: '表', html: '<table>\n  <thead>\n    <tr><th>項目</th><th class="num">A</th><th class="num">B</th></tr>\n  </thead>\n  <tbody>\n    <tr><th>行 1</th><td class="num">10</td><td class="num">20</td></tr>\n    <tr><th>行 2</th><td class="num">30</td><td class="num">40</td></tr>\n  </tbody>\n</table>' },
  { id: 'code', label: 'コード', html: '<pre><code class="lang-py">def hello(name):\n    return f"hello, {name}"</code></pre>', raw: true },
  { id: 'chart-bar', label: 'グラフ: 棒', html: '<hs-chart type="bar">' + CHART_TABLE([['A', 12], ['B', 19], ['C', 15], ['D', 24]]) + '</hs-chart>' },
  { id: 'chart-hbar', label: 'グラフ: 横棒', html: '<hs-chart type="hbar">' + CHART_TABLE([['項目 A', 24], ['項目 B', 18], ['項目 C', 11]]) + '</hs-chart>' },
  { id: 'chart-line', label: 'グラフ: 折れ線', html: '<hs-chart type="line">\n  <table>\n    <tr><th></th><th>1月</th><th>2月</th><th>3月</th><th>4月</th></tr>\n    <tr><th>系列 A</th><td>12</td><td>18</td><td>22</td><td>31</td></tr>\n    <tr><th>系列 B</th><td>10</td><td>12</td><td>15</td><td>17</td></tr>\n  </table>\n</hs-chart>' },
  { id: 'chart-donut', label: 'グラフ: ドーナツ', html: '<hs-chart type="donut">' + CHART_TABLE([['A', 45], ['B', 30], ['C', 25]]) + '</hs-chart>' },
  { id: 'chart-scatter', label: 'グラフ: 散布図', html: '<hs-chart type="scatter" trend>\n  <table>\n    <tr><th>名前</th><th>x</th><th>y</th></tr>\n    <tr><td>a</td><td>1</td><td>1.4</td></tr>\n    <tr><td>b</td><td>2</td><td>2.1</td></tr>\n    <tr><td>c</td><td>3</td><td>2.7</td></tr>\n    <tr><td>d</td><td>4</td><td>4.2</td></tr>\n  </table>\n</hs-chart>' },
  { id: 'steps', label: '手順（矢印）', html: '<ol class="steps">\n  <li><b>手順 1</b><span>説明</span></li>\n  <li><b>手順 2</b><span>説明</span></li>\n  <li><b>手順 3</b><span>説明</span></li>\n</ol>' },
  { id: 'timeline', label: 'タイムライン', html: '<ol class="timeline">\n  <li><time>2026 Q1</time><b>節目</b><span>説明</span></li>\n  <li class="is-now"><time>2026 Q2</time><b>節目</b><span>説明</span></li>\n  <li><time>2026 Q3</time><b>節目</b><span>説明</span></li>\n</ol>' },
  { id: 'meter', label: 'メーター', html: '<div class="meter" style="--value: 60;"></div>' },
  { id: 'hr', label: '区切り線', html: '<hr>' }
];

export const OBJECTS = [
  { id: 'text', label: 'テキスト', key: 'T', icon: 'text', html: '<p class="free" style="width: 520px;">テキスト</p>', edit: true },
  { id: 'label', label: 'ラベル', icon: 'note', html: '<div class="free label">ラベル</div>', edit: true },
  { id: 'rect', label: '四角形', key: 'R', icon: 'rect', html: '<div class="free shape" style="width: 320px; height: 200px;"></div>' },
  { id: 'ellipse', label: '楕円', key: 'O', icon: 'ellipse', html: '<div class="free shape is-ellipse" style="width: 240px; height: 240px;"></div>' },
  { id: 'arrow', label: '矢印', key: 'A', icon: 'arrow', html: '<div class="free arrow" style="width: 300px;"></div>' },
  { id: 'line', label: '線', key: 'L', icon: 'line', html: '<div class="free arrow is-line" style="width: 300px;"></div>' }
];

const HEAD = (kicker, title) =>
  '  <header>\n    <p class="kicker">' + kicker + '</p>\n    <h2>' + title + '</h2>\n  </header>\n';
const SLIDE = (attrs, body) => '<section class="slide"' + attrs + '>\n' + body + '</section>';

export const LAYOUTS = [
  { id: 'std', label: '標準', html: SLIDE('', HEAD('Kicker', '見出しには主張を書く') + '  <p>本文を入力</p>\n  <ul>\n    <li>要点</li>\n    <li>要点</li>\n  </ul>\n') },
  { id: 'cover', label: '表紙', html: SLIDE(' data-layout="cover"', '  <p class="kicker">Kicker</p>\n  <h1>タイトル</h1>\n  <p class="lede">サブタイトル</p>\n  <p class="meta"><span><strong>Your Name</strong></span><span>所属</span><span>日付</span></p>\n') },
  { id: 'section', label: '章扉', html: SLIDE(' data-layout="section" data-tone="invert"', '  <span class="chapter">01</span>\n  <h2>章のタイトル</h2>\n  <p class="lede">この章で話すこと</p>\n') },
  { id: 'statement', label: '一文', html: SLIDE(' data-layout="statement"', '  <h2>伝えたい<mark>ひとこと</mark>を、大きく。</h2>\n  <p class="lede">補足の一文</p>\n') },
  { id: 'cols', label: '2カラム', html: SLIDE('', HEAD('Kicker', '2つを並べる') + '  <div class="cols grow">\n    <div>\n      <p>左のカラム</p>\n    </div>\n    <div>\n      <p>右のカラム</p>\n    </div>\n  </div>\n') },
  { id: 'cards', label: 'カード', html: SLIDE('', HEAD('Kicker', '並列の3点') + '  <div class="cols is-stretch grow" data-cols="3">\n    <div class="card">\n      <h3>1つ目</h3>\n      <p>説明文</p>\n    </div>\n    <div class="card is-accent">\n      <h3>2つ目</h3>\n      <p>説明文</p>\n    </div>\n    <div class="card">\n      <h3>3つ目</h3>\n      <p>説明文</p>\n    </div>\n  </div>\n') },
  { id: 'chart', label: 'グラフ + 説明', html: SLIDE('', HEAD('Data', 'グラフが言っていること') + '  <div class="cols is-2-1 grow is-stretch">\n    <hs-chart type="bar" style="height: 100%;">\n      <table>\n        <tr><td>A</td><td>12</td></tr>\n        <tr><td>B</td><td>19</td></tr>\n        <tr><td>C</td><td>15</td></tr>\n        <tr><td>D</td><td>24</td></tr>\n      </table>\n    </hs-chart>\n    <div style="justify-content: center;">\n      <p>どこを見てほしいか。</p>\n      <p class="small muted">補足</p>\n    </div>\n  </div>\n') },
  { id: 'stats', label: '数字 3つ', html: SLIDE('', HEAD('Numbers', '数字で語る') + '  <div class="cols grow is-center" data-cols="3">\n    <div class="stat"><hs-count>42%</hs-count><span>説明</span></div>\n    <div class="stat"><hs-count>3.4×</hs-count><span>説明</span></div>\n    <div class="stat"><hs-count>1,200</hs-count><span>説明</span></div>\n  </div>\n') },
  { id: 'split', label: '画像 + 文章', html: SLIDE(' data-layout="split"', '  <div class="media"></div>\n  <div class="text">\n    <p class="kicker">Kicker</p>\n    <h2>見出し</h2>\n    <p>本文。左の枠を選んで画像を入れます。</p>\n  </div>\n') },
  { id: 'steps', label: '手順', html: SLIDE('', HEAD('Process', '進め方') + '  <ol class="steps grow">\n    <li><b>手順 1</b><span>説明</span></li>\n    <li><b>手順 2</b><span>説明</span></li>\n    <li><b>手順 3</b><span>説明</span></li>\n  </ol>\n  <div class="takeaway">結論</div>\n') },
  { id: 'timeline', label: 'タイムライン', html: SLIDE('', HEAD('Roadmap', 'これまでとこれから') + '  <ol class="timeline" style="margin-top: 80px;">\n    <li><time>2026 Q1</time><b>節目</b><span>説明</span></li>\n    <li class="is-now"><time>2026 Q2</time><b>節目</b><span>説明</span></li>\n    <li><time>2026 Q3</time><b>節目</b><span>説明</span></li>\n  </ol>\n') },
  { id: 'table', label: '表', html: SLIDE('', HEAD('Table', '比較する') + '  <table>\n    <thead>\n      <tr><th>項目</th><th class="num">A</th><th class="num">B</th></tr>\n    </thead>\n    <tbody>\n      <tr><th>行 1</th><td class="num">10</td><td class="num is-hl">20</td></tr>\n      <tr><th>行 2</th><td class="num">30</td><td class="num is-hl">40</td></tr>\n    </tbody>\n  </table>\n') },
  { id: 'code', label: 'コード', html: SLIDE('', HEAD('Code', 'コードを見せる') + '  <div class="window" data-title="example.py">\n<pre><code class="lang-py">def hello(name):\n    return f"hello, {name}"</code></pre>\n  </div>\n') },
  { id: 'quote', label: '引用', html: SLIDE(' data-layout="quote" data-tone="soft"', '  <blockquote>引用文をここに。</blockquote>\n  <cite>— 出典</cite>\n') },
  { id: 'center', label: '中央', html: SLIDE(' data-layout="center"', '  <p class="kicker">Kicker</p>\n  <h2>中央に置く</h2>\n') },
  { id: 'end', label: '締め', html: SLIDE(' data-layout="end"', '  <p class="kicker">Thank you</p>\n  <h2>ありがとうございました</h2>\n  <p class="lede">質問・コメントをお待ちしています。</p>\n') },
  { id: 'blank', label: '白紙', html: SLIDE('', '') }
];

/* ================= inserting ================= */

let pointer = null;
addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY }; }, true);

export function insertObject(def, at) {
  const slide = ed.slide;
  const node = typeof def === 'string' ? fromHTML(def) : fromHTML(def.html);
  const R = slide.getBoundingClientRect();
  const s = HS.view.scale;
  mutate(() => {
    slide.append(document.createTextNode('  '), node, document.createTextNode('\n'));
    const w = node.offsetWidth;
    const hgt = node.offsetHeight;
    let cx = HS.W / 2;
    let cy = HS.H / 2;
    const p = at || null;
    if (p && p.x > R.left && p.x < R.right && p.y > R.top && p.y < R.bottom) {
      cx = (p.x - R.left) / s;
      cy = (p.y - R.top) / s;
    }
    node.style.left = Math.round(cx - w / 2) + 'px';
    node.style.top = Math.round(cy - hgt / 2) + 'px';
  });
  select([node]);
  if (def.edit) startText(node);
  return node;
}

function flowTarget() {
  const slide = ed.slide;
  let anchor = ed.sel.length === 1 && !isFree(ed.sel[0]) ? ed.sel[0] : null;
  if (anchor) {
    while (anchor.parentElement !== slide && anchor.matches('li, td, th, tr, tbody, thead')) {
      anchor = anchor.parentElement;
    }
    return { parent: anchor.parentElement, before: anchor.nextElementSibling };
  }
  let parent = slide;
  if (slide.getAttribute('data-layout') === 'split') parent = slide.querySelector(':scope > .text') || slide;
  let before = null;
  const kids = Array.from(parent.children);
  for (let i = kids.length - 1; i >= 0; i--) {
    if (kids[i].matches('footer, .notes, .free, .takeaway')) before = kids[i];
    else break;
  }
  return { parent, before };
}

export function insertBlock(def) {
  const { parent, before } = flowTarget();
  const indent = indentFor(parent, ed.slide);
  const node = fromHTML(def.raw ? def.html : def.html.replace(/\n/g, indent));
  mutate(() => place(parent, node, before, ed.slide));
  select([node]);
  if (def.edit && canEditText(node)) startText(node);
  return node;
}

function imageSize(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 640, h: 360 });
    img.src = url;
  });
}

/* Upload an image into the deck's assets/ and place it: into the
 * selected image or media frame if there is one, otherwise as a free
 * object. */
export async function insertImage(file, at) {
  let url;
  try {
    url = await upload(file, file.name || 'pasted.png');
  } catch (err) {
    return toast('画像を保存できません: ' + err.message, 'error');
  }
  const target = ed.sel.length === 1 ? ed.sel[0] : null;
  if (target && target.tagName === 'IMG' && !at) {
    mutate(() => target.setAttribute('src', url));
    return;
  }
  if (target && target.matches('.media, figure') && !at) {
    mutate(() => {
      const existing = target.querySelector('img');
      if (existing) existing.setAttribute('src', url);
      else target.prepend(h('img', { src: url, alt: '' }));
    });
    return;
  }
  const size = await imageSize(url);
  const w = Math.min(size.w, 880, Math.round(620 * size.w / size.h));
  insertObject('<img class="free" src="' + url + '" alt="" style="width: ' + Math.max(80, w) + 'px;">', at);
}

export function chooseImage() {
  const input = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  input.addEventListener('change', () => {
    if (input.files[0]) insertImage(input.files[0]);
    input.remove();
  });
  document.body.appendChild(input);
  input.click();
}

/* ================= clipboard ================= */

const typing = (target) =>
  !!ed.textEl || (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)));

function onCopy(e, cut) {
  if (HS.state.mode !== 'edit' || typing(e.target)) return;
  const html = ed.sel.length
    ? ed.sel.map((el) => cleanClone(el).outerHTML).join('\n')
    : serialize(ed.slide);
  e.clipboardData.setData('text/plain', html);
  e.preventDefault();
  if (cut && ed.sel.length) removeSelected();
  else toast(ed.sel.length ? '要素をコピーしました' : 'スライドをコピーしました');
}

function pasteMarkup(text) {
  const tpl = document.createElement('template');
  tpl.innerHTML = text.trim();
  const nodes = Array.from(tpl.content.children);
  if (!nodes.length || !/^\s*</.test(text)) {
    const node = insertObject('<p class="free" style="width: 640px;"></p>');
    node.textContent = text.trim();
    return;
  }
  if (nodes[0].matches('section.slide')) {
    nodes.forEach((n) => insertSlide(n.outerHTML));
    return;
  }
  const { parent, before } = flowTarget();
  const added = [];
  mutate(() => nodes.forEach((n) => {
    if (isFree(n)) {
      ed.slide.append(document.createTextNode('  '), n, document.createTextNode('\n'));
      n.style.left = (parseFloat(n.style.left) || 0) + 28 + 'px';
      n.style.top = (parseFloat(n.style.top) || 0) + 28 + 'px';
    } else {
      place(parent, n, before, ed.slide);
    }
    added.push(n);
  }));
  select(added);
}

function onPaste(e) {
  if (HS.state.mode !== 'edit' || typing(e.target)) return;
  const data = e.clipboardData;
  const file = Array.from(data.files || []).find((f) => f.type.startsWith('image/'));
  e.preventDefault();
  if (file) {
    insertImage(file, pointer);
    return;
  }
  const text = data.getData('text/plain');
  if (text.trim()) pasteMarkup(text);
}

/* ================= present / edit ================= */

let cameFromEditor = false;

export function present(fullscreen) {
  commitText();
  select([]);
  setTool('select');
  closeFloating();
  save();
  resetZoom();
  cameFromEditor = true;
  HS.setMode('present');
  if (fullscreen !== false) document.documentElement.requestFullscreen().catch(() => {});
}

export function edit() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  HS.setMode('edit');
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && HS.state.mode === 'present' && cameFromEditor) edit();
});

/* ================= new-slide gallery ================= */

export function openGallery(afterIndex, anchor) {
  const grid = h('div', { class: 'hse-gallery' });
  LAYOUTS.forEach((layout) => {
    const node = fromHTML(layout.html);
    node.setAttribute('data-hs-n', '');
    grid.appendChild(h('button', {
      class: 'hse-gallery-item', type: 'button',
      onclick: () => {
        closeFloating();
        insertSlide(layout.html, afterIndex);
      }
    }, HS.thumb(node), h('span', { text: layout.label })));
  });
  popover(h('div', null, h('div', { class: 'hse-pop-title', text: '新しいスライド' }), grid),
    anchor || { center: true, y: 90 }, 'is-wide');
}

/* ================= command registry ================= */

const commands = [];

function add(id, group, title, run, opts) {
  commands.push(Object.assign({ id, group, title, run }, opts || {}));
}

const hasSel = () => ed.sel.length > 0;

add('undo', '編集', '元に戻す', undo, { keys: MOD + 'Z' });
add('redo', '編集', 'やり直す', redo, { keys: '⇧' + MOD + 'Z' });
add('duplicate', '編集', '複製', () => (hasSel() ? duplicateSelected() : duplicateSlide(HS.state.index)), { keys: MOD + 'D' });
add('delete', '編集', '選択した要素を削除', removeSelected, { keys: '⌫', when: hasSel });
add('edit-text', '編集', 'テキストを編集', () => selectChild(), { keys: 'Enter', when: hasSel });
add('forward', '編集', '後ろへ送る（順序を後に）', () => reorder(1), { keys: MOD + ']', when: hasSel });
add('backward', '編集', '前へ送る（順序を前に）', () => reorder(-1), { keys: MOD + '[', when: hasSel });
add('toggle-free', '編集', '自由配置 ⇄ フロー配置', toggleFree, { when: hasSel });
add('align-left', '整列', '左揃え', () => align('left'), { when: hasSel });
add('align-center', '整列', '左右中央', () => align('center'), { when: hasSel });
add('align-right', '整列', '右揃え', () => align('right'), { when: hasSel });
add('align-top', '整列', '上揃え', () => align('top'), { when: hasSel });
add('align-middle', '整列', '上下中央', () => align('middle'), { when: hasSel });
add('align-bottom', '整列', '下揃え', () => align('bottom'), { when: hasSel });
add('dist-x', '整列', '左右に等間隔', () => distribute('x'), { when: hasSel });
add('dist-y', '整列', '上下に等間隔', () => distribute('y'), { when: hasSel });
add('note', 'レビュー', '@fix コメントを置く', () => {
  if (ed.sel.length === 1) openNoteEditor(ed.sel[0], null, ed.sel[0].getBoundingClientRect());
  else setTool(ed.tool === 'note' ? 'select' : 'note');
}, { keys: 'C' });
add('new-slide', 'スライド', '新しいスライド…', () => openGallery(), { keys: 'N' });
add('dup-slide', 'スライド', 'スライドを複製', () => duplicateSlide(HS.state.index));
add('del-slide', 'スライド', 'スライドを削除', () => deleteSlide(HS.state.index));
add('present', '表示', '発表する', () => present(), { keys: MOD + '↵' });
add('present-here', '表示', '発表する（ウィンドウのまま）', () => present(false));
add('presenter', '表示', '発表者ビューを開く', () => HS.present.openPresenter());
add('zoom-fit', '表示', '全体を表示', resetZoom, { keys: MOD + '0' });
add('zoom-in', '表示', '拡大', () => zoomBy(1.25), { keys: MOD + '+' });
add('zoom-out', '表示', '縮小', () => zoomBy(0.8), { keys: MOD + '−' });
add('save', 'デッキ', '今すぐ保存', () => { save(); toast('保存しました'); }, { keys: MOD + 'S' });
add('image', '挿入', '画像…', chooseImage, { keys: 'I' });
OBJECTS.forEach((o) => add('obj-' + o.id, '挿入', o.label, () => insertObject(o, pointer), { keys: o.key }));
BLOCKS.forEach((b) => add('block-' + b.id, '挿入', b.label, () => insertBlock(b)));
LAYOUTS.forEach((l) => add('slide-' + l.id, 'スライド', '新しいスライド: ' + l.label, () => insertSlide(l.html)));
['標準:', '反転:invert', 'アクセント:accent', 'ソフト:soft'].forEach((pair) => {
  const [label, value] = pair.split(':');
  add('tone-' + (value || 'none'), 'スライド', 'トーン: ' + label, () => mutate(() => {
    if (value) ed.slide.setAttribute('data-tone', value);
    else ed.slide.removeAttribute('data-tone');
  }));
});
['morph', 'fade', 'slide', 'zoom', 'none'].forEach((t) => {
  add('transition-' + t, 'デッキ', '既定の切り替え: ' + t, () => setDeckAttr('data-transition', t === 'morph' ? null : t));
});

export const run = (id) => {
  const c = commands.find((x) => x.id === id);
  if (c) c.run();
};

export const command = (id) => commands.find((x) => x.id === id);

let themes = [];
export function setThemes(list) { themes = list || []; }
export const getThemes = () => themes;

function allCommands() {
  const dynamic = [];
  themes.forEach((t) => dynamic.push({
    group: 'デッキ', title: 'テーマ: ' + t + (t === currentTheme() ? '（現在）' : ''), run: () => setTheme(t)
  }));
  HS.slides.forEach((slide, i) => dynamic.push({
    group: '移動', title: (i + 1) + '  ' + (HS.titleOf(slide) || '（無題）'), run: () => HS.go(i, 0)
  }));
  return commands.filter((c) => !c.when || c.when()).concat(dynamic);
}

/* ================= command palette ================= */

export function openPalette() {
  const all = allCommands();
  const input = h('input', { class: 'hse-palette-input', placeholder: 'コマンド・挿入・スライドを検索', spellcheck: false });
  const list = h('div', { class: 'hse-palette-list' });
  let shown = [];
  let cursor = 0;

  function render() {
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    shown = all.filter((c) => {
      const hay = (c.group + ' ' + c.title + ' ' + (c.id || '')).toLowerCase();
      return words.every((w) => hay.includes(w));
    }).slice(0, 60);
    cursor = Math.min(cursor, Math.max(0, shown.length - 1));
    list.replaceChildren(...shown.map((c, i) => h('button', {
      class: 'hse-palette-item' + (i === cursor ? ' is-on' : ''), type: 'button',
      onclick: () => choose(i),
      onpointermove: () => { if (cursor !== i) { cursor = i; mark(); } }
    },
      h('span', { class: 'hse-palette-group', text: c.group }),
      h('span', { class: 'hse-palette-title', text: c.title }),
      c.keys ? h('kbd', { text: c.keys }) : null)));
    if (!shown.length) list.appendChild(h('div', { class: 'hse-empty', text: '一致するコマンドがありません' }));
  }
  function mark() {
    Array.from(list.children).forEach((el, i) => el.classList.toggle('is-on', i === cursor));
    if (list.children[cursor]) list.children[cursor].scrollIntoView({ block: 'nearest' });
  }
  function choose(i) {
    const c = shown[i];
    closeFloating();
    if (c) c.run();
  }
  input.addEventListener('input', () => { cursor = 0; render(); });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(shown.length - 1, cursor + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(0, cursor - 1); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(cursor); }
    else if (e.key === 'Escape') closeFloating();
  });
  render();
  popover(h('div', { class: 'hse-palette' }, input, list),
    { center: true, y: Math.max(60, innerHeight * 0.16) }, 'is-palette');
  input.focus();
}

/* ================= context menu ================= */

function onContextMenu(e) {
  if (HS.state.mode !== 'edit' || isChrome(e.target)) return;
  e.preventDefault();
  commitText();
  const el = pick(e.clientX, e.clientY);
  if (el && !ed.sel.includes(el)) select([el]);
  if (!el) select([]);
  const at = { x: e.clientX, y: e.clientY };
  const item = (id, label, extra) => {
    const c = command(id);
    return Object.assign({ label: label || c.title, keys: c.keys, run: c.run }, extra || {});
  };
  if (el) {
    const one = ed.sel.length === 1;
    menu([
      one && canEditText(el) ? { label: 'テキストを編集', keys: 'Enter', run: () => startText(el) } : null,
      item('duplicate', '複製'),
      { label: 'HTML をコピー', run: () => navigator.clipboard.writeText(ed.sel.map((x) => cleanClone(x).outerHTML).join('\n')).then(() => toast('HTML をコピーしました')) },
      '-',
      item('backward', '順序を前へ'),
      item('forward', '順序を後ろへ'),
      { label: isFree(el) ? 'フロー配置に戻す' : '自由配置にする', run: toggleFree },
      ed.sel.some(isFree) ? '-' : null,
      ed.sel.some(isFree) ? item('align-center', '左右中央に揃える') : null,
      ed.sel.some(isFree) ? item('align-middle', '上下中央に揃える') : null,
      '-',
      one ? { label: '@fix コメントを置く', keys: 'C', run: () => openNoteEditor(el, null, at) } : null,
      one ? { label: '親を選択', keys: 'Esc', run: selectParent } : null,
      '-',
      item('delete', '削除', { danger: true })
    ], at);
  } else {
    menu([
      item('new-slide', '新しいスライド…'),
      item('dup-slide'),
      '-',
      { label: 'テキストを置く', keys: 'T', run: () => insertObject(OBJECTS[0], at) },
      { label: '画像を置く…', keys: 'I', run: chooseImage },
      { label: 'スライド全体に @fix コメント', run: () => openNoteEditor(ed.slide, null, at) },
      '-',
      item('present', '発表する'),
      '-',
      item('del-slide', 'スライドを削除', { danger: true })
    ], at);
  }
}

/* ================= help ================= */

const SHORTCUTS = [
  ['クリック / ⇧クリック', '選択 / 追加選択'], ['ダブルクリック', 'テキスト編集'],
  ['ドラッグ', '並べ替え（フロー）・移動（自由配置）'], ['⌥ドラッグ', '自由配置にして動かす'],
  ['矢印（⇧で10px）', '位置の微調整'], ['Esc / Enter / Tab', '親・子・隣の要素へ'],
  [MOD + 'K', 'コマンドパレット'], [MOD + 'Z', '元に戻す'], [MOD + 'D', '複製'],
  ['T R O A L I', 'テキスト・四角・楕円・矢印・線・画像'], ['C', '@fix コメント'],
  ['N', '新しいスライド'], [MOD + '↵', '発表する'], [MOD + 'ホイール', '拡大縮小'], ['Space + ドラッグ', '表示位置を動かす']
];

export function openHelp() {
  popover(h('div', { class: 'hse-help' },
    h('div', { class: 'hse-pop-title', text: 'ショートカット' }),
    h('dl', null, SHORTCUTS.map(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]))),
    { center: true, y: 90 });
}

/* ================= keyboard ================= */

function onKey(e) {
  if (e.isComposing) return;
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (HS.state.mode !== 'edit') {
    if (HS.state.mode === 'present' && !mod && !typing(e.target) &&
        (key === 'e' || (key === 'Escape' && cameFromEditor && !document.fullscreenElement))) {
      e.preventDefault();
      edit();
    }
    return;
  }

  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  if (mod && key === 's') { stop(); commitText(); run('save'); return; }
  if (mod && key === 'k') { stop(); openPalette(); return; }
  if (typing(e.target)) return;
  if (mod && key === 'Enter') { stop(); present(); return; }

  if (mod) {
    if (key === 'z') { stop(); if (e.shiftKey) redo(); else undo(); }
    else if (key === 'y') { stop(); redo(); }
    else if (key === 'd') { stop(); run('duplicate'); }
    else if (key === 'a') {
      stop();
      select(Array.from(ed.slide.children).filter((c) => !c.matches('.notes') && !isInlineEl(c)));
    }
    else if (key === ']') { stop(); reorder(1); }
    else if (key === '[') { stop(); reorder(-1); }
    else if (key === '0') { stop(); resetZoom(); }
    else if (key === '=' || key === '+') { stop(); zoomBy(1.25); }
    else if (key === '-') { stop(); zoomBy(0.8); }
    return;
  }
  if (e.altKey) return;

  const step = e.shiftKey ? 10 : 1;
  switch (key) {
    case 'Escape':
      stop();
      if (ed.tool !== 'select') setTool('select');
      else selectParent();
      break;
    case 'Enter': if (hasSel()) { stop(); selectChild(); } break;
    case 'Tab': stop(); selectSibling(e.shiftKey ? -1 : 1); break;
    case 'Backspace': case 'Delete': if (hasSel()) { stop(); removeSelected(); } break;
    case 'ArrowLeft': stop(); if (hasSel()) nudge(-step, 0); else HS.prev(); break;
    case 'ArrowRight': stop(); if (hasSel()) nudge(step, 0); else HS.next(); break;
    case 'ArrowUp': stop(); if (hasSel()) nudge(0, -step); else HS.prev(); break;
    case 'ArrowDown': stop(); if (hasSel()) nudge(0, step); else HS.next(); break;
    case 'PageUp': stop(); HS.prev(); break;
    case 'PageDown': stop(); HS.next(); break;
    case 'Home': stop(); HS.go(0, 0); break;
    case 'End': stop(); HS.go(HS.slides.length - 1, 0); break;
    case 't': stop(); insertObject(OBJECTS[0], pointer); break;
    case 'r': stop(); insertObject(OBJECTS[2], pointer); break;
    case 'o': stop(); insertObject(OBJECTS[3], pointer); break;
    case 'a': stop(); insertObject(OBJECTS[4], pointer); break;
    case 'l': stop(); insertObject(OBJECTS[5], pointer); break;
    case 'i': stop(); chooseImage(); break;
    case 'c': stop(); run('note'); break;
    case 'n': stop(); openGallery(); break;
    case 'v': stop(); setTool('select'); break;
    case '?': stop(); openHelp(); break;
  }
}

export function initCommands() {
  addEventListener('keydown', onKey, true);
  addEventListener('contextmenu', onContextMenu, true);
  document.addEventListener('copy', (e) => onCopy(e, false));
  document.addEventListener('cut', (e) => onCopy(e, true));
  document.addEventListener('paste', onPaste);
  addEventListener('dragover', (e) => {
    if (HS.state.mode === 'edit' && e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault();
    }
  });
  addEventListener('drop', (e) => {
    if (HS.state.mode !== 'edit' || !e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
      .forEach((f) => insertImage(f, { x: e.clientX, y: e.clientY }));
  });
}
