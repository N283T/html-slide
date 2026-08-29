/* Live reload client. The dev server exposes an SSE stream at
 * /__hs/events and emits `reload` when a file in the deck changes.
 * The editor calls HSLiveReload.suppress() right before saving so its
 * own write does not bounce the page and lose edit-mode state.
 * Does nothing when the deck is opened without the dev server. */
(function () {
  'use strict';

  let suppressUntil = 0;

  window.HSLiveReload = {
    suppress: function () { suppressUntil = Date.now() + 2000; }
  };

  /* Editing UIs await this to know whether write-back is available.
   * Resolves to {ok, themes} when the dev server answers, else null. */
  window.HSServer = fetch('/__hs/ping')
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; });

  /* Shared helper for structural deck operations. */
  window.HSOps = function (payload) {
    payload.path = location.pathname;
    window.HSLiveReload.suppress();
    return fetch('/__hs/ops', { method: 'POST', body: JSON.stringify(payload) })
      .then(function (res) {
        if (!res.ok) return res.text().then(function (t) { throw new Error(t); });
        return true;
      });
  };

  /* Exports load the page with ?capture=1; an open SSE stream would
   * stall Chrome's virtual clock there, so skip live reload entirely. */
  if (new URLSearchParams(location.search).has('capture')) return;

  let source;
  try {
    source = new EventSource('/__hs/events');
  } catch (_) {
    return;
  }

  source.addEventListener('reload', function () {
    if (Date.now() < suppressUntil) return;
    location.reload();
  });

  source.onerror = function () {
    /* No dev server (static hosting) or it went away; stay quiet. */
    source.close();
  };
})();
