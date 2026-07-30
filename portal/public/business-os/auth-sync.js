/* BOS auth sync — fetches /api/auth/me on every BOS page load and
   replaces the sidebar's "user" widget with a real profile pill.
   Mirrors the marketing MarketingAuth widget so the same identity
   reads consistently across the marketing site, BOS, and the
   portal. */
(function () {
  function init() {
    var slot = document.querySelector('.bos-side-user');
    if (!slot) return;

    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var user = d && d.ok ? d.user : null;
        render(slot, user);
      })
      .catch(function () { render(slot, null); });
  }

  function initials(seed) {
    var s = (seed || '').trim();
    if (!s) return '?';
    var parts = s.split(/[\s@.]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }

  function render(slot, user) {
    if (!user) {
      // Signed-out — render a "Sign in" CTA where the profile pill was.
      slot.innerHTML = ''
        + '<a class="bos-side-signin" href="/login">'
        +   '<span class="bos-side-signin-icon">👤</span>'
        +   '<span><strong>Sign in</strong><br><span class="muted">or become a client</span></span>'
        + '</a>';
      return;
    }
    var display = (user.name && user.name.trim()) || user.email;
    var role = (user.role || '').replace(/-/g, ' ');
    var isClient = !!(user.agencyId || user.clientId);

    slot.innerHTML = ''
      + '<button type="button" class="bos-auth-trigger" aria-haspopup="menu" aria-expanded="false">'
      +   '<span class="av">' + initials(display) + '</span>'
      +   '<div>'
      +     '<div class="bos-side-user-name">' + display + '</div>'
      +     '<div class="bos-side-user-biz muted">' + role + '</div>'
      +   '</div>'
      + '</button>'
      + '<div class="bos-auth-pop" role="menu" hidden>'
      +   '<div class="bos-auth-pop-head">'
      +     '<div class="bos-auth-pop-name">' + display + '</div>'
      +     '<div class="bos-auth-pop-email">' + user.email + '</div>'
      +     '<div class="bos-auth-pop-role">' + role + '</div>'
      +   '</div>'
      +   '<div class="bos-auth-pop-list">'
      +     '<a href="/portal/account">👤 My profile</a>'
      +     (isClient
            ? '<a href="/portal" class="bos-auth-pop-portal">▣ Open my portal</a>'
            : '<a href="/#contact" class="bos-auth-pop-portal">★ Work with Milesymedia</a>')
      +     '<a href="/">↩ Back to website</a>'
      +   '</div>'
      +   '<form action="/api/auth/logout" method="post" class="bos-auth-pop-out">'
      +     '<button type="submit" class="bos-auth-pop-signout">↗ Sign out</button>'
      +   '</form>'
      + '</div>';

    var trigger = slot.querySelector('.bos-auth-trigger');
    var pop = slot.querySelector('.bos-auth-pop');
    function close() { pop.setAttribute('hidden', ''); trigger.setAttribute('aria-expanded', 'false'); }
    function open() { pop.removeAttribute('hidden'); trigger.setAttribute('aria-expanded', 'true'); }
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      pop.hasAttribute('hidden') ? open() : close();
    });
    document.addEventListener('click', function (e) {
      if (!slot.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else { init(); }
})();
