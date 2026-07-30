/* Activity log — unified `bos.activity[]` writer used by HC, Incubator,
   BOS, marketplace, and admin surfaces. Cap 200 entries (oldest
   dropped). Per chapter #66 schema; namespaced via R012 — each
   business owns its own activity timeline. */
(function () {
  var KEY = 'bos.activity';
  var CAP = 200;

  var KINDS = {
    'hc.completed':            { icon: '🩺', label: 'Health Check completed' },
    'hc.shared':               { icon: '📤', label: 'HC results shared' },
    'incubator.bridged':       { icon: '🏛', label: 'Continued from HC into the Incubator' },
    'incubator.welcomed':      { icon: '✨', label: 'Welcomed into the Incubator' },
    'incubator.welcome-dismissed': { icon: '✓', label: 'Welcome banner dismissed' },
    'incubator.phase-advanced': { icon: '🎉', label: 'Phase advanced' },
    'lesson.done':             { icon: '📚', label: 'Lesson marked done' },
    'lesson.undone':           { icon: '↩︎', label: 'Lesson un-marked' },
    'bos.section-visited':     { icon: '🧭', label: 'BOS section visited' },
    'marketplace.click':       { icon: '🛒', label: 'Marketplace add-on clicked' },
    'feedback.submitted':      { icon: '✍️', label: 'Feedback submitted' },
    'pro.trial-started':       { icon: '🟡', label: 'Pro trial started' },
    'pro-confirmed-demo':      { icon: '🟢', label: 'Pro confirmed (demo)' },
    'pro.trial-expired':       { icon: '⏳', label: 'Pro trial expired' },
    'event.created':           { icon: '📅', label: 'Calendar event created' },
    'event.completed':         { icon: '✅', label: 'Calendar event completed' },
    'prompt.clicked':          { icon: '💬', label: 'Aqua AI prompt clicked' },
    'settings.changed':        { icon: '⚙️', label: 'Settings changed' }
  };

  function read() { try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { return []; } }
  function write(a) {
    try { localStorage.setItem(KEY, JSON.stringify(a.slice(-CAP))); } catch (e) {}
    /* Mirror to per-business namespace if BOSStorage is loaded (R012). */
    if (window.BOSStorage && typeof window.BOSStorage.set === 'function') {
      try { window.BOSStorage.set(KEY, JSON.stringify(a.slice(-CAP))); } catch (e) {}
    }
  }
  function rid() { return 'a' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

  function log(kind, payload) {
    if (!kind) return null;
    var entry = {
      id: rid(),
      ts: new Date().toISOString(),
      kind: kind,
      payload: payload || null,
      business: (window.BOSStorage && window.BOSStorage.activeId && window.BOSStorage.activeId()) || null
    };
    var all = read();
    all.push(entry);
    write(all);
    /* Local broadcast so widgets can re-paint without polling. */
    try { document.dispatchEvent(new CustomEvent('activity:logged', { detail: entry })); } catch (e) {}
    return entry;
  }

  function list(filter) {
    filter = filter || {};
    var all = read().slice();
    if (filter.kind) {
      var prefix = filter.kind;
      all = all.filter(function (e) { return e.kind === prefix || e.kind.indexOf(prefix + '.') === 0; });
    }
    if (filter.kinds && filter.kinds.length) {
      all = all.filter(function (e) { return filter.kinds.indexOf(e.kind) !== -1; });
    }
    if (filter.sinceMs != null) {
      var cutoff = Date.now() - filter.sinceMs;
      all = all.filter(function (e) { return +new Date(e.ts) >= cutoff; });
    }
    if (filter.business) {
      all = all.filter(function (e) { return e.business === filter.business; });
    }
    /* Newest first for display surfaces. */
    return all.sort(function (a, b) { return +new Date(b.ts) - +new Date(a.ts); });
  }

  function byKind() {
    var counts = {};
    read().forEach(function (e) { counts[e.kind] = (counts[e.kind] || 0) + 1; });
    return counts;
  }

  function recent(n) { return list().slice(0, n || 5); }
  function clear() { write([]); }

  function metaFor(kind) { return KINDS[kind] || { icon: '◆', label: kind }; }

  window.Activity = {
    KINDS: KINDS, log: log, list: list, byKind: byKind,
    recent: recent, clear: clear, metaFor: metaFor
  };
})();
