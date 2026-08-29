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
