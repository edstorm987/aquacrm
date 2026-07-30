/* Business switcher UI — renders into elements with `[data-bos-switcher]`.
   On Incubator pages: mounted into `.inc-toprail` automatically.
   On BOS pages: mounted into `.bos-sidebar` (top of nav) automatically.

   Requires `BOSStorage` (lib/storage.js) loaded first. */
(function () {
  if (!window.BOSStorage) return;

  function escape(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }

  function renderSwitcher(host, opts) {
    opts = opts || {};
    var active = window.BOSStorage.getActive();
    var list = window.BOSStorage.list();
    if (!active || !list.length) return;
    host.innerHTML =
      '<div class="bos-switcher" data-bos-switcher-root>' +
        '<button type="button" class="bos-switcher-btn" data-bos-switcher-toggle aria-haspopup="menu" aria-expanded="false">' +
          '<span class="bos-switcher-icon">◆</span>' +
          '<span class="bos-switcher-label">' + escape(active.name) + '</span>' +
          '<span class="bos-switcher-chev">▾</span>' +
        '</button>' +
        '<ul class="bos-switcher-menu" role="menu" hidden>' +
          list.map(function (b) {
            return '<li role="menuitem"><button type="button" data-bos-switcher-pick="' + escape(b.id) +
                '"' + (b.id === active.id ? ' class="is-active"' : '') + '>' +
                escape(b.name) + (b.id === active.id ? ' ✓' : '') +
                '</button></li>';
          }).join('') +
          '<li class="bos-switcher-sep"></li>' +
          '<li role="menuitem"><button type="button" data-bos-switcher-add>+ Add new business</button></li>' +
        '</ul>' +
      '</div>';
  }

  function ensureMounted() {
    var hosts = document.querySelectorAll('[data-bos-switcher]');
    hosts.forEach(function (h) { renderSwitcher(h); });
  }

  function autoMount() {
    /* Incubator: insert into the toprail strip on the right side. */
    var topRail = document.querySelector('.inc-toprail');
    if (topRail && !topRail.querySelector('[data-bos-switcher]')) {
      var slot = document.createElement('span');
      slot.setAttribute('data-bos-switcher', '');
      slot.style.marginLeft = '12px';
      // Insert before the existing "milesymedia.co ↗" link if present.
      var lastA = topRail.querySelector('a:last-child');
      if (lastA) topRail.insertBefore(slot, lastA);
      else topRail.appendChild(slot);
    }
    /* BOS: insert into the sidebar above the auto-nav. */
    var sidebar = document.querySelector('.bos-sidebar');
    if (sidebar && !sidebar.querySelector('[data-bos-switcher]')) {
      var nav = sidebar.querySelector('.bos-side-nav');
      var sslot = document.createElement('div');
      sslot.setAttribute('data-bos-switcher', '');
      sslot.style.padding = '8px 12px 4px';
      if (nav) sidebar.insertBefore(sslot, nav);
      else sidebar.appendChild(sslot);
    }
    ensureMounted();
  }

  /* Click delegation. */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-bos-switcher-toggle]');
    if (t) {
      var menu = t.parentElement.querySelector('.bos-switcher-menu');
      var open = !menu.hidden;
      // Close any other open menus.
      document.querySelectorAll('.bos-switcher-menu').forEach(function (m) { m.hidden = true; });
      document.querySelectorAll('[data-bos-switcher-toggle]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
      if (!open) { menu.hidden = false; t.setAttribute('aria-expanded', 'true'); }
      return;
    }
    var pick = ev.target.closest('[data-bos-switcher-pick]');
    if (pick) {
      var id = pick.getAttribute('data-bos-switcher-pick');
      window.BOSStorage.switch(id);
      location.reload();
      return;
    }
    var add = ev.target.closest('[data-bos-switcher-add]');
    if (add) {
      var name = prompt('Business name (e.g. "Northbeam Apparel"):');
      if (!name) return;
      window.BOSStorage.add(name);
      location.reload();
      return;
    }
    /* Click outside any open menu closes them. */
    if (!ev.target.closest('.bos-switcher')) {
      document.querySelectorAll('.bos-switcher-menu').forEach(function (m) { m.hidden = true; });
      document.querySelectorAll('[data-bos-switcher-toggle]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    }
  });

  document.addEventListener('DOMContentLoaded', autoMount);

  window.BOSSwitcher = { mount: autoMount, render: renderSwitcher };
})();
