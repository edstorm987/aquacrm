/* BOSStorage — multi-business localStorage namespace.

   Switch-by-mirror approach (R012):
   - Each business's data lives under `businesses.<id>.<key>` for the
     12 namespaced keys.
   - The "active" business's data is also mirrored into the flat `<key>`
     localStorage slots so existing readers (bos.js, incubator.js,
     admin, lead-magnet) need no changes.
   - On switch / add / remove, BOSStorage rewrites the flat slots from
     the new active business's namespace.
   - On any write through `BOSStorage.set(key, value)`, both the
     namespaced slot AND the flat slot are written so they stay in
     sync.

   Auto-migration on first load:
   - If no `businesses.*` keys exist, snapshot current flat keys into
     `businesses.default.*` and set `activeBusinessId = 'default'`.

   Real cross-device sync, sharing, and permissions are out of scope
   per the round prompt (T6 wires real persistence via plugin
   handoff per chapter #67). */
(function () {
  var KEY_LIST    = 'bos.businesses';            // [{ id, name }]
  var KEY_ACTIVE  = 'bos.activeBusinessId';      // string id
  var NS_PREFIX   = 'businesses.';

  /* Top-12 keys per chapter #66 — anything else stays per-device.
     If you add a key here, also add a sync-on-add migration step. */
  var NAMESPACED_KEYS = [
    'bos.user',
    'bos.brand',
    'bos.healthCheck',
    'bos.progress',
    'bos.lessonProgress',
    'bos.tasks',
    'bos.leads',
    'bos.activity',
    'bos.entitlement',
    'bos.company',
    'incubator.phase',
    'incubator.phaseProgress',
    'incubator.phaseAdvanced',
    'incubator.lastVisitedPhasePage',
    'bos.aiHistory'                  // R029 — per-business AI conversation memory
  ];

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) {
    if (v == null) { try { localStorage.removeItem(k); } catch (e) {} ; return; }
    try { localStorage.setItem(k, v); } catch (e) {}
  }
  function getJSON(k, d) {
    var raw = get(k);
    if (raw == null) return d;
    try { return JSON.parse(raw); } catch (e) { return d; }
  }
  function setJSON(k, v) {
    if (v == null) { set(k, null); return; }
    try { set(k, JSON.stringify(v)); } catch (e) {}
  }

  function listBusinesses() {
    var l = getJSON(KEY_LIST, null);
    if (Array.isArray(l) && l.length) return l;
    return [];
  }
  function activeId() {
    return get(KEY_ACTIVE) || null;
  }
  function getActive() {
    var id = activeId();
    if (!id) return null;
    return listBusinesses().filter(function (b) { return b.id === id; })[0] || null;
  }

  function nsKey(id, k) { return NS_PREFIX + id + '.' + k; }

  /* Snapshot current flat keys into a business namespace. */
  function snapshotInto(id) {
    NAMESPACED_KEYS.forEach(function (k) {
      var v = get(k);
      if (v == null) { try { localStorage.removeItem(nsKey(id, k)); } catch (e) {} ; return; }
      try { localStorage.setItem(nsKey(id, k), v); } catch (e) {}
    });
  }

  /* Mirror a business's namespace down into the flat slots so existing
     readers (bos.js etc) see the right data. */
  function mirrorOut(id) {
    NAMESPACED_KEYS.forEach(function (k) {
      var v = get(nsKey(id, k));
      if (v == null) { try { localStorage.removeItem(k); } catch (e) {} ; return; }
      try { localStorage.setItem(k, v); } catch (e) {}
    });
  }

  function setActiveId(id) { set(KEY_ACTIVE, id); }

  /* Public — write a key. Stores both at namespaced + flat slot. */
  function setKey(k, v) {
    set(k, v);
    var id = activeId();
    if (id && NAMESPACED_KEYS.indexOf(k) !== -1) {
      if (v == null) { try { localStorage.removeItem(nsKey(id, k)); } catch (e) {} }
      else { try { localStorage.setItem(nsKey(id, k), v); } catch (e) {} }
    }
  }

  function slugify(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'business';
  }
  function uniqueId(base, taken) {
    if (taken.indexOf(base) === -1) return base;
    var n = 2;
    while (taken.indexOf(base + '-' + n) !== -1) n++;
    return base + '-' + n;
  }

  /* Add a new business — snapshots current flat keys into the new
     namespace and switches to it. Existing flat keys are NOT cleared
     (they become the new business's starting state — operator can
     wipe in admin if they want a blank slate). */
  function addBusiness(name) {
    var list = listBusinesses();
    var id = uniqueId(slugify(name), list.map(function (b) { return b.id; }));
    list.push({ id: id, name: name || 'Untitled' });
    setJSON(KEY_LIST, list);
    snapshotInto(id);
    setActiveId(id);
    return { id: id, name: name || 'Untitled' };
  }

  /* Switch to an existing business — mirrors that namespace down. */
  function switchTo(id) {
    if (!listBusinesses().some(function (b) { return b.id === id; })) return false;
    /* Snapshot the current active first so unsaved flat-slot writes
       (e.g. mid-session changes) don't get lost on switch. */
    var prev = activeId();
    if (prev) snapshotInto(prev);
    setActiveId(id);
    mirrorOut(id);
    return true;
  }

  /* Remove a business; if it was active, switches to first remaining
     (or clears active if none). */
  function removeBusiness(id) {
    var list = listBusinesses().filter(function (b) { return b.id !== id; });
    setJSON(KEY_LIST, list);
    NAMESPACED_KEYS.forEach(function (k) { try { localStorage.removeItem(nsKey(id, k)); } catch (e) {} });
    if (activeId() === id) {
      if (list.length) switchTo(list[0].id);
      else setActiveId('');
    }
  }

  /* Rename a business in the list (id stays the same — namespaces
     wouldn't survive a rename). */
  function renameBusiness(id, name) {
    var list = listBusinesses().map(function (b) { return b.id === id ? { id: b.id, name: name || b.name } : b; });
    setJSON(KEY_LIST, list);
  }

  /* One-time auto-migration. */
  function migrate() {
    var list = listBusinesses();
    if (list.length) return; // already migrated
    /* Best-effort name from existing bos.user.business / bos.brand.companyName. */
    var name = 'My business';
    var u = getJSON('bos.user', null);
    if (u && u.business) name = u.business;
    var b = getJSON('bos.brand', null);
    if (b && b.companyName) name = b.companyName;
    list = [{ id: 'default', name: name }];
    setJSON(KEY_LIST, list);
    setActiveId('default');
    snapshotInto('default');
  }
  migrate();

  window.BOSStorage = {
    NAMESPACED_KEYS: NAMESPACED_KEYS,
    list: listBusinesses,
    activeId: activeId,
    getActive: getActive,
    add: addBusiness,
    switch: switchTo,
    remove: removeBusiness,
    rename: renameBusiness,
    set: setKey,
    snapshot: snapshotInto,
    mirror: mirrorOut
  };
})();
