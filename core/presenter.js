/* Presenter console logic. Lives in presenter.html, talks to the deck
 * over a BroadcastChannel. Shows current/next titles, speaker notes,
 * an elapsed clock (starts on first slide change, r resets) and a
 * clickable list of slides. */
(function () {
  'use strict';

  const el = function (id) { return document.getElementById(id); };
  const channel = new BroadcastChannel('html-slide');

  let startedAt = null;
  let titles = [];
  let currentIndex = 0;

  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  setInterval(function () {
    el('clock').textContent = startedAt ? fmt(Date.now() - startedAt) : '00:00';
  }, 500);

  function renderList() {
    const list = el('list');
    list.innerHTML = '';
    titles.forEach(function (title, i) {
      const li = document.createElement('li');
      li.textContent = (i + 1) + '. ' + title;
      li.className = i === currentIndex ? 'is-current' : '';
      li.addEventListener('click', function () {
        channel.postMessage({ type: 'goto', index: i });
      });
      list.appendChild(li);
    });
  }

  channel.onmessage = function (e) {
    const msg = e.data || {};
    if (msg.type !== 'state') return;
    if (startedAt === null && msg.index > 0) startedAt = Date.now();
    currentIndex = msg.index;
    titles = msg.titles || titles;
    el('position').textContent = (msg.index + 1) + ' / ' + msg.total;
    el('current-title').textContent = msg.title || '';
    el('next-title').textContent = msg.nextTitle || '— end —';
    el('notes').innerHTML = msg.notes || '<em>No notes for this slide.</em>';
    renderList();
  };

  addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      channel.postMessage({ type: 'goto', index: currentIndex + 1 });
    } else if (e.key === 'ArrowLeft') {
      channel.postMessage({ type: 'goto', index: Math.max(0, currentIndex - 1) });
    } else if (e.key === 'r') {
      startedAt = Date.now();
    }
  });

  channel.postMessage({ type: 'hello' });
})();
