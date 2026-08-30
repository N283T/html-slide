/* Overview mode: `o` toggles a clickable grid of every slide.
 * Slides are wrapped in fixed-size .hs-thumb cells and scaled with a
 * transform, so the live DOM is the thumbnail — no captures needed.
 *
 * With the dev server connected the grid becomes a slide manager:
 * drag thumbnails to reorder, ⧉ duplicates, ✕ deletes, + inserts a
 * new slide from the layout gallery. Every operation edits the HTML
 * source and reloads back into the overview (#overview hash). */
(function () {
  'use strict';

  const deck = document.getElementById('deck');
  const D = window.HSDeck;
  if (!deck || !D) return;

  let open = false;
  let canManage = false;
  let dragFrom = null;

  if (window.HSServer) {
    window.HSServer.then(function (info) { canManage = !!(info && info.ok); });
  }

  function runOp(payload, focusIndex) {
    window.HSOps(payload)
      .then(function () {
        const params = new URLSearchParams(location.search);
        if (focusIndex != null) params.set('s', focusIndex + 1);
        params.delete('f');
        history.replaceState(null, '',
          location.pathname + '?' + params.toString() + '#overview');
        location.reload();
      })
      .catch(function (err) { alert('操作に失敗: ' + err.message); });
  }

  /* ---- layout gallery ---- */

  function openGallery(afterIndex) {
    const snippets = window.HSSnippets || [];
    const overlay = document.createElement('div');
    overlay.id = 'hs-gallery';
    const box = document.createElement('div');
    box.className = 'hs-gallery-box';
    const h = document.createElement('h3');
    h.textContent = '新しいスライド — レイアウトを選択（スライド ' + (afterIndex + 1) + ' の後に挿入）';
    box.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'hs-gallery-grid';
    snippets.forEach(function (snippet) {
      const item = document.createElement('div');
      item.className = 'hs-gallery-item';
      item.innerHTML = '<div class="hs-g-name"></div><div class="hs-g-desc"></div>';
      item.querySelector('.hs-g-name').textContent = snippet.name;
      item.querySelector('.hs-g-desc').textContent = snippet.desc;
      item.addEventListener('click', function () {
        overlay.remove();
        runOp({ op: 'insert', index: afterIndex, html: snippet.html }, afterIndex + 1);
      });
      grid.appendChild(item);
    });
    box.appendChild(grid);
    overlay.appendChild(box);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  window.HSGallery = openGallery;

  /* ---- grid construction ---- */

  function thumbActions(i) {
    const bar = document.createElement('div');
    bar.className = 'hs-thumb-actions';
    const add = document.createElement('button');
    add.textContent = '+';
    add.title = 'この後に新規スライドを挿入';
    add.addEventListener('click', function (e) { e.stopPropagation(); openGallery(i); });
    const dup = document.createElement('button');
    dup.textContent = '⧉';
    dup.title = 'スライドを複製';
    dup.addEventListener('click', function (e) {
      e.stopPropagation();
      runOp({ op: 'duplicate', index: i }, i + 1);
    });
    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = 'スライドを削除';
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      if (confirm('スライド ' + (i + 1) + '「' + D.titleOf(i) + '」を削除しますか？')) {
        runOp({ op: 'delete', index: i }, Math.max(0, i - 1));
      }
    });
    bar.append(add, dup, del);
    return bar;
  }

  function wireDrag(cell, i) {
    cell.draggable = true;
    cell.addEventListener('dragstart', function (e) {
      dragFrom = i;
      cell.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    cell.addEventListener('dragend', function () {
      cell.classList.remove('is-dragging');
      deck.querySelectorAll('.hs-thumb.is-drop-target').forEach(function (c) {
        c.classList.remove('is-drop-target');
      });
    });
    cell.addEventListener('dragover', function (e) {
      if (dragFrom === null || dragFrom === i) return;
      e.preventDefault();
      cell.classList.add('is-drop-target');
    });
    cell.addEventListener('dragleave', function () {
      cell.classList.remove('is-drop-target');
    });
    cell.addEventListener('drop', function (e) {
      e.preventDefault();
      if (dragFrom === null || dragFrom === i) return;
      const order = D.slides.map(function (_, k) { return k; });
      order.splice(i, 0, order.splice(dragFrom, 1)[0]);
      dragFrom = null;
      runOp({ op: 'reorder', order: order }, i);
    });
  }

  function enter() {
    open = true;
    document.body.dataset.mode = 'overview';
    D.state.mode = 'overview';
    D.slides.forEach(function (slide, i) {
      const cell = document.createElement('div');
      cell.className = 'hs-thumb' + (i === D.state.index ? ' is-current' : '');
      deck.insertBefore(cell, slide);
      cell.appendChild(slide);
      const label = document.createElement('div');
      label.className = 'hs-thumb-label';
      label.textContent = (i + 1) + ' · ' + D.titleOf(i);
      cell.appendChild(label);
      if (canManage) {
        cell.appendChild(thumbActions(i));
        wireDrag(cell, i);
      }
      cell.addEventListener('click', function () {
        exit();
        D.goto(i, 0);
      });
    });
    if (canManage) {
      const addTile = document.createElement('div');
      addTile.className = 'hs-thumb hs-add-tile';
      addTile.textContent = '+';
      addTile.title = '末尾にスライドを追加';
      addTile.addEventListener('click', function () {
        openGallery(D.state.total - 1);
      });
      deck.appendChild(addTile);
    }
    const current = deck.querySelector('.hs-thumb.is-current');
    if (current) current.scrollIntoView({ block: 'center' });
  }

  function exit() {
    open = false;
    delete document.body.dataset.mode;
    D.state.mode = 'slide';
    if (location.hash === '#overview') history.replaceState(null, '', location.pathname + location.search);
    Array.from(deck.querySelectorAll(':scope > .hs-thumb')).forEach(function (cell) {
      const slide = cell.querySelector('.slide');
      if (slide) deck.insertBefore(slide, cell);
      cell.remove();
    });
    D.rescale();
  }

  addEventListener('keydown', function (e) {
    if (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'o') { open ? exit() : enter(); }
    else if (e.key === 'Escape' && open) exit();
  });

  /* Reopen after a structural edit reloaded the page. Wait for the
   * server ping so the management controls come back too. */
  if (location.hash === '#overview') {
    (window.HSServer || Promise.resolve(null)).then(function () {
      setTimeout(enter, 0);
    });
  }

  window.HSOverview = {
    toggle: function () { open ? exit() : enter(); },
    isOpen: function () { return open; }
  };
})();
