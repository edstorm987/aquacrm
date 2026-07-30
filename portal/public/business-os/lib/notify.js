/* In-app notifications (BOS inbox).
   Single source of truth `bos.notifications[]` capped 100.
   Used by phase-advance / marketplace / admin-broadcast surfaces.

   Public:
     window.Notify.push(kind, title, body, opts?) → entry
     window.Notify.list(filter?) → entries (newest first)
     window.Notify.markRead(id)
     window.Notify.markAllRead()
     window.Notify.unreadCount()
     window.Notify.KINDS — registry (icon + label)
*/
(function () {
  var KEY = 'bos.notifications';
  var CAP = 100;

  var KINDS = {
    'phase':       { icon: '🎉', label: 'Phase' },
    'lesson':      { icon: '📚', label: 'Lesson' },
    'marketplace': { icon: '🛒', label: 'Marketplace' },
    'founder':     { icon: '✨', label: 'Founder' },
    'system':      { icon: '🛠', label: 'System' }
  };

  function read() { try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { return []; } }
  function write(a) {
    var clipped = a.slice(-CAP);
    try { localStorage.setItem(KEY, JSON.stringify(clipped)); } catch (e) {}
    if (window.BOSStorage && typeof window.BOSStorage.set === 'function') {
      try { window.BOSStorage.set(KEY, JSON.stringify(clipped)); } catch (e) {}
    }
  }
  function rid() { return 'n' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }

  function push(kind, title, body, opts) {
    if (!kind || !title) return null;
    /* R024 — respect bos.notifyPrefs[kind].enabled (defaults to true). */
    try {
      var prefs = JSON.parse(localStorage.getItem('bos.notifyPrefs') || '{}') || {};
      if (prefs[kind] && prefs[kind].enabled === false) return null;
    } catch (e) {}
    opts = opts || {};
    var entry = {
      id: rid(),
      ts: new Date().toISOString(),
      kind: kind, title: title, body: body || '',
      ctaHref: opts.ctaHref || null,
      from: opts.from || null,
      read: false
    };
    var all = read(); all.push(entry); write(all);
    try { document.dispatchEvent(new CustomEvent('notify:new', { detail: entry })); } catch (e) {}
    return entry;
  }

  function list(filter) {
    filter = filter || {};
    var all = read().slice();
    if (filter.kind) all = all.filter(function (e) { return e.kind === filter.kind; });
    if (filter.unreadOnly) all = all.filter(function (e) { return !e.read; });
    return all.sort(function (a, b) { return +new Date(b.ts) - +new Date(a.ts); });
  }

  function markRead(id) {
    var all = read();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) all[i].read = true;
    write(all);
    try { document.dispatchEvent(new CustomEvent('notify:read', { detail: { id: id } })); } catch (e) {}
  }
  function markAllRead() {
    var all = read();
    for (var i = 0; i < all.length; i++) all[i].read = true;
    write(all);
    try { document.dispatchEvent(new CustomEvent('notify:read', { detail: { all: true } })); } catch (e) {}
  }
  function unreadCount() {
    return read().filter(function (e) { return !e.read; }).length;
  }
  function metaFor(kind) { return KINDS[kind] || { icon: '◆', label: kind }; }

  window.Notify = {
    KINDS: KINDS, push: push, list: list,
    markRead: markRead, markAllRead: markAllRead,
    unreadCount: unreadCount, metaFor: metaFor
  };
})();
