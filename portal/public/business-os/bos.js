/* Shared Business OS helpers — included on every in-app page.
   Single source of truth for: user info, mode (free/customer),
   niche, XP/level/streak progression, health-check ingestion,
   sidebar adaptation, dev bar, achievements, Aqua AI widget. */

(function () {
  if (!document.querySelector('script[data-aqua-business-os]')) {
    var aquaTag = document.createElement('script');
    aquaTag.src = '/aqua-tag.js';
    aquaTag.defer = true;
    aquaTag.dataset.siteKey = 'aqua_public_aquacrm_v1';
    aquaTag.dataset.property = 'business-os';
    aquaTag.dataset.aquaBusinessOs = 'true';
    document.head.appendChild(aquaTag);
  }

  var KEY_USER = 'bos.user';
  var KEY_MODE = 'bos.mode';        // 'free' | 'customer'
  var KEY_PROGRESS = 'bos.progress'; // XP / streak / achievements
  var KEY_HEALTH = 'bos.healthCheck';
  var KEY_AI = 'bos.ai';            // free-tier message counter

  /* ─── Niches ─────────────────────────────── */
  var NICHES = [
    { slug: 'therapist',  label: 'Therapist OS',     icon: '🌿', tagline: 'Built for private-practice therapists.' },
    { slug: 'roofer',     label: 'Roofer OS',        icon: '🏠', tagline: 'Built for roofers and trades.' },
    { slug: 'salon',      label: 'Salon OS',         icon: '💇', tagline: 'Built for salons, barbers and stylists.' },
    { slug: 'coach',      label: 'Coach OS',         icon: '🎯', tagline: 'Built for coaches and consultants.' },
    { slug: 'restaurant', label: 'Restaurant OS',    icon: '🍽',  tagline: 'Built for restaurants and cafés.' },
    { slug: 'retailer',   label: 'Retailer OS',      icon: '🛍', tagline: 'Built for product brands.' },
    { slug: 'agency',     label: 'Agency OS',        icon: '💼', tagline: 'Built for agencies and studios.' },
    { slug: 'generic',    label: 'Business OS',      icon: '◆',  tagline: 'A solid generic operating system.' }
  ];

  /* ─── Level ladder ───────────────────────── */
  var LEVELS = [
    { n: 1, name: 'Apprentice', from:    0 },
    { n: 2, name: 'Owner',      from:  250 },
    { n: 3, name: 'Operator',   from:  700 },
    { n: 4, name: 'Captain',    from: 1500 },
    { n: 5, name: 'Founder',    from: 3000 },
    { n: 6, name: 'Legend',     from: 6000 }
  ];

  /* ─── Add-ons (also rendered in marketplace + sidebar) ── */
  var ADDONS = [
    { id: 'inbox',     name: 'All-in-One Inbox',     icon: '📥', cat: 'comms',  price: 49, blurb: 'Email, SMS, WhatsApp, Instagram DMs — one queue, one team.' },
    { id: 'website',   name: 'Website Editor',       icon: '🪄', cat: 'site',   price: 79, blurb: 'Drag-and-drop pages with the conversion blocks already built.' },
    { id: 'ecom',      name: 'Ecommerce',            icon: '🛒', cat: 'sell',   price: 89, blurb: 'Storefront, cart, checkout, subscriptions. Stripe-ready.' },
    { id: 'fulfil',    name: 'Fulfilment',           icon: '📦', cat: 'sell',   price: 39, blurb: 'Pick, pack, ship and track from the same place you sell.' },
    { id: 'members',   name: 'Memberships',          icon: '🎟', cat: 'retain', price: 39, blurb: 'Tiers, drip content, gated areas. No second login for customers.' },
    { id: 'affil',     name: 'Affiliates',           icon: '🤝', cat: 'grow',   price: 29, blurb: 'Referral links, payouts, fraud checks — turn fans into a salesforce.' },
    { id: 'crm',       name: 'Client CRM',           icon: '🗂', cat: 'comms',  price: 49, blurb: 'Pipelines, notes, tasks, automated follow-ups.' },
    { id: 'marketing', name: 'Marketing Suite',      icon: '📣', cat: 'grow',   price: 59, blurb: 'Email, SMS, broadcast, segmentation, automation flows.' },
    { id: 'finance',   name: 'Finance',              icon: '💷', cat: 'ops',    price: 39, blurb: 'Invoicing, reconciliation, tax-ready reports for your accountant.' }
  ];

  /* ─── Achievements catalogue ─────────────── */
  var ACHIEVEMENTS = [
    { id: 'first-step',   icon: '🌟', label: 'First step',          desc: 'You created your Business OS.' },
    { id: 'self-aware',   icon: '🪞', label: 'Self-aware',          desc: 'Completed your first Health Check.' },
    { id: 'student',      icon: '📚', label: 'Student',             desc: 'Opened your first module.' },
    { id: 'builder',      icon: '🔧', label: 'Builder',             desc: 'Installed your first add-on.' },
    { id: 'on-fire-3',    icon: '🔥', label: '3-day streak',        desc: 'Three days in a row. Keep it up.' },
    { id: 'on-fire-7',    icon: '🔥', label: '7-day streak',        desc: 'A whole week. Habit-forming.' },
    { id: 'first-call',   icon: '📞', label: 'Bridge built',        desc: 'You booked your first strategy call.' },
    { id: 'niche-locked', icon: '🎯', label: 'Niche-locked',        desc: 'Picked a niche-specific OS.' }
  ];

  /* ─── Storage helpers ────────────────────── */
  function getJSON(k, d) { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(d)); } catch (e) { return d; } }
  function setJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function getUser() { return getJSON(KEY_USER, null); }
  function setUser(u) { setJSON(KEY_USER, u); }
  function getMode() { try { return localStorage.getItem(KEY_MODE) || 'free'; } catch (e) { return 'free'; } }
  function setMode(m) { try { localStorage.setItem(KEY_MODE, m); } catch (e) {} }

  /* R011 — Pro entitlement source of truth.
     `bos.entitlement = { tier:'free'|'pro-trial'|'pro', startedAt, expiresAt? }`
     Pro lockups should read `isPro()` (not bos.mode directly). Back-compat:
     legacy `bos.mode === 'customer'` still counts as Pro so existing
     installs unlock correctly. Expiry: pro-trial with `expiresAt < now`
     auto-rolls back to `free` on the next read (data preserved). */
  var KEY_ENT = 'bos.entitlement';
  function getEntitlement() {
    try {
      var raw = localStorage.getItem(KEY_ENT);
      if (!raw) return null;
      var e = JSON.parse(raw);
      if (e && e.tier === 'pro-trial' && e.expiresAt && +new Date(e.expiresAt) < Date.now()) {
        // Trial expired — flip back to free, preserve data.
        try {
          localStorage.setItem(KEY_ENT, JSON.stringify({ tier: 'free', startedAt: e.startedAt, expiredAt: new Date().toISOString() }));
          localStorage.setItem(KEY_MODE, 'free');
        } catch (er) {}
        return { tier: 'free', startedAt: e.startedAt, expiredAt: new Date().toISOString() };
      }
      return e;
    } catch (e) { return null; }
  }
  function isPro() {
    var e = getEntitlement();
    if (e && (e.tier === 'pro' || e.tier === 'pro-trial')) return true;
    return getMode() === 'customer';
  }

  function getProgress() {
    return getJSON(KEY_PROGRESS, {
      xp: 0, timeSavedHrs: 0, streak: 0, lastActive: null,
      completed: {}, achievements: []
    });
  }
  function setProgress(p) { setJSON(KEY_PROGRESS, p); }

  function hydrateHealthCheckFromServer() {
    fetch('/api/public/business-os/context', { credentials: 'same-origin' })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (result) {
        var slot = result && result.ok && result.context ? result.context.hcSlot : null;
        var summary = slot && slot.summary;
        if (!summary || typeof summary !== 'object') return;
        setJSON(KEY_HEALTH, summary);
        var progress = getProgress();
        if (!progress.completed.healthCheck) {
          progress.completed.healthCheck = true;
          progress.xp += 250;
          progress.timeSavedHrs += 8;
          if (progress.achievements.indexOf('self-aware') === -1) progress.achievements.push('self-aware');
          setProgress(progress);
        }
        paintHealthCheck();
        paintProgress();
      })
      .catch(function () {
        /* Signed-out/browser-only BOS remains fully usable from local state. */
      });
  }

  function getNiche() {
    var u = getUser();
    return (u && u.niche) || 'generic';
  }
  function nicheMeta() {
    var slug = getNiche();
    return NICHES.find(function (n) { return n.slug === slug; }) || NICHES[NICHES.length - 1];
  }

  function levelInfo(xp) {
    var cur = LEVELS[0], nxt = LEVELS[1];
    for (var i = 0; i < LEVELS.length; i++) {
      if (xp >= LEVELS[i].from) { cur = LEVELS[i]; nxt = LEVELS[i + 1] || null; }
    }
    var floor = cur.from;
    var ceil  = nxt ? nxt.from : floor;
    var pct   = nxt ? Math.min(100, Math.round(((xp - floor) / (ceil - floor)) * 100)) : 100;
    return { current: cur, next: nxt, pct: pct, into: xp - floor, span: ceil - floor };
  }

  function gainXP(amount, reason, timeSavedHrs) {
    var p = getProgress();
    var prevLevel = levelInfo(p.xp).current.n;
    p.xp += amount;
    if (timeSavedHrs) p.timeSavedHrs += timeSavedHrs;
    setProgress(p);
    var newLevel = levelInfo(p.xp).current.n;
    toast('+' + amount + ' XP · ' + reason, 'xp');
    if (newLevel > prevLevel) {
      setTimeout(function () { toast('Level up — you\'re now a ' + LEVELS[newLevel - 1].name + '.', 'level'); }, 1200);
    }
    paintProgress();
  }

  function unlockAchievement(id) {
    var p = getProgress();
    if (p.achievements.indexOf(id) !== -1) return;
    p.achievements.push(id);
    setProgress(p);
    var a = ACHIEVEMENTS.find(function (x) { return x.id === id; });
    if (a) toast(a.icon + ' ' + a.label + ' — unlocked.', 'achievement');
    paintProgress();
  }

  function tickStreak() {
    var p = getProgress();
    var today = new Date().toISOString().slice(0, 10);
    if (p.lastActive === today) return; // already counted
    var yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    if (p.lastActive === yesterday) p.streak += 1;
    else p.streak = 1;
    p.lastActive = today;
    setProgress(p);
    if (p.streak === 3) unlockAchievement('on-fire-3');
    if (p.streak === 7) unlockAchievement('on-fire-7');
  }

  /* ─── Toast ──────────────────────────────── */
  function ensureToastHost() {
    var h = document.querySelector('.bos-toast-host');
    if (h) return h;
    h = document.createElement('div');
    h.className = 'bos-toast-host';
    document.body.appendChild(h);
    return h;
  }
  function toast(text, kind) {
    var h = ensureToastHost();
    var t = document.createElement('div');
    t.className = 'bos-toast bos-toast-' + (kind || 'xp');
    t.textContent = text;
    h.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('is-on'); });
    setTimeout(function () { t.classList.remove('is-on'); setTimeout(function () { t.remove(); }, 300); }, 2800);
  }

  /* ─── Paint XP / level / streak everywhere ── */
  function paintProgress() {
    var p = getProgress();
    var lvl = levelInfo(p.xp);
    document.querySelectorAll('[data-bos-xp]').forEach(function (e) { e.textContent = p.xp.toLocaleString() + ' XP'; });
    document.querySelectorAll('[data-bos-level-num]').forEach(function (e) { e.textContent = lvl.current.n; });
    document.querySelectorAll('[data-bos-level-name]').forEach(function (e) { e.textContent = lvl.current.name; });
    document.querySelectorAll('[data-bos-level-bar]').forEach(function (e) { e.style.width = lvl.pct + '%'; });
    document.querySelectorAll('[data-bos-level-pct]').forEach(function (e) {
      e.textContent = lvl.next ? (lvl.span - lvl.into) + ' XP to ' + lvl.next.name : 'Maxed';
    });
    document.querySelectorAll('[data-bos-streak]').forEach(function (e) { e.textContent = p.streak; });
    document.querySelectorAll('[data-bos-time-saved]').forEach(function (e) { e.textContent = (p.timeSavedHrs || 0).toFixed(1) + 'h'; });
    /* Achievements grid */
    var grid = document.querySelector('[data-bos-achievements]');
    if (grid) {
      grid.innerHTML = ACHIEVEMENTS.map(function (a) {
        var got = p.achievements.indexOf(a.id) !== -1;
        return '<div class="ach-card' + (got ? ' is-on' : '') + '">'
          + '<div class="ach-icon">' + a.icon + '</div>'
          + '<div class="ach-meta"><div class="ach-label">' + a.label + '</div>'
          +   '<div class="ach-desc">' + (got ? a.desc : 'Locked — ' + a.desc.toLowerCase()) + '</div></div>'
          + '</div>';
      }).join('');
    }
  }

  /* ─── Branding (logo / colours / company name) ── */
  var KEY_BRAND = 'bos.brand';
  function getBrand() { return getJSON(KEY_BRAND, null); }
  function setBrand(b) { setJSON(KEY_BRAND, b); }

  function applyBranding() {
    var b = getBrand();
    if (!b) return;
    if (b.primary)   document.documentElement.style.setProperty('--accent', b.primary);
    if (b.secondary) document.documentElement.style.setProperty('--accent-2', b.secondary);
    if (b.companyName) {
      document.querySelectorAll('[data-bos-niche-label]').forEach(function (el) { el.textContent = b.companyName; });
    }
    if (b.logo) {
      document.querySelectorAll('[data-bos-niche-icon]').forEach(function (el) {
        el.innerHTML = '<img src="' + b.logo + '" alt="" class="bos-logo-img" />';
      });
    }
  }

  /* First-visit branding nudge */
  function maybeBrandNudge() {
    if (getBrand()) return;
    if (location.pathname.indexOf('app.html') === -1) return;
    var seen = false;
    try { seen = localStorage.getItem('bos.brandNudgeShown') === '1'; } catch (e) {}
    if (seen) return;
    try { localStorage.setItem('bos.brandNudgeShown', '1'); } catch (e) {}
    setTimeout(showBrandModal, 800);
  }

  function showBrandModal() {
    var existing = document.querySelector('.bos-brand-modal');
    if (existing) { existing.remove(); }
    var b = getBrand() || {};
    var modal = document.createElement('div');
    modal.className = 'bos-brand-modal';
    modal.innerHTML = ''
      + '<div class="bos-brand-modal-card">'
      +   '<button class="bos-brand-close" aria-label="Close">✕</button>'
      +   '<div class="bos-brand-icon">✨</div>'
      +   '<h2>Make it yours.</h2>'
      +   '<p class="muted">Drop your logo, your colours, your business name. Three minutes — and the whole OS rebrands. (Skip if you\'d rather get straight in.)</p>'
      +   '<form class="bos-brand-form" data-bos-brand-form>'
      +     '<label>Business name <input type="text" name="companyName" placeholder="e.g. Northbeam Apparel OS" value="' + (b.companyName || '') + '" /></label>'
      +     '<label>Logo <input type="file" accept="image/*" data-bos-brand-logo-file /></label>'
      +     '<input type="hidden" name="logo" value="' + (b.logo || '') + '" data-bos-brand-logo-hidden />'
      +     (b.logo ? '<div class="bos-brand-logo-preview"><img src="' + b.logo + '" alt="" /><button type="button" data-bos-brand-logo-clear>Remove</button></div>' : '')
      +     '<div class="bos-brand-no-logo">No logo yet? <a href="mailto:hello@milesymedia.co?subject=Logo%20design">We\'ll design one →</a></div>'
      +     '<div class="bos-brand-colours">'
      +       '<label>Primary colour <input type="color" name="primary" value="' + (b.primary || '#FF6B35') + '" /></label>'
      +       '<label>Secondary colour <input type="color" name="secondary" value="' + (b.secondary || '#FFB800') + '" /></label>'
      +     '</div>'
      +     '<div class="bos-brand-actions">'
      +       '<button type="button" class="btn btn-ghost" data-bos-brand-skip>Skip</button>'
      +       '<button type="submit" class="btn btn-primary">Save &amp; rebrand →</button>'
      +     '</div>'
      +   '</form>'
      + '</div>';
    document.body.appendChild(modal);
    var close = function () { modal.remove(); };
    modal.querySelector('.bos-brand-close').addEventListener('click', close);
    modal.querySelector('[data-bos-brand-skip]').addEventListener('click', close);
    modal.addEventListener('click', function (ev) { if (ev.target === modal) close(); });
    var fileInput = modal.querySelector('[data-bos-brand-logo-file]');
    var hiddenInput = modal.querySelector('[data-bos-brand-logo-hidden]');
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        if (f.size > 1024 * 1024) {
          alert('Logo must be under 1MB. Try a smaller PNG or SVG.');
          fileInput.value = ''; return;
        }
        var reader = new FileReader();
        reader.onload = function (e) {
          hiddenInput.value = e.target.result;
          /* live preview */
          var existing = modal.querySelector('.bos-brand-logo-preview');
          if (existing) existing.remove();
          var prev = document.createElement('div');
          prev.className = 'bos-brand-logo-preview';
          prev.innerHTML = '<img src="' + e.target.result + '" alt="" /><button type="button" data-bos-brand-logo-clear>Remove</button>';
          fileInput.closest('label').after(prev);
          prev.querySelector('[data-bos-brand-logo-clear]').addEventListener('click', function () {
            hiddenInput.value = ''; prev.remove(); fileInput.value = '';
          });
        };
        reader.readAsDataURL(f);
      });
    }
    /* Existing remove button (when modal opens with a stored logo) */
    var preExistingClear = modal.querySelector('[data-bos-brand-logo-clear]');
    if (preExistingClear) {
      preExistingClear.addEventListener('click', function () {
        hiddenInput.value = '';
        var prev = modal.querySelector('.bos-brand-logo-preview');
        if (prev) prev.remove();
      });
    }
    modal.querySelector('[data-bos-brand-form]').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var fd = new FormData(ev.target);
      setBrand({
        companyName: (fd.get('companyName') || '').trim(),
        logo:        (fd.get('logo') || '').trim(),
        primary:     fd.get('primary'),
        secondary:   fd.get('secondary')
      });
      close();
      window.location.reload();
    });
  }

  /* Expose a button hook so home page can re-open the modal */
  document.addEventListener('click', function (ev) {
    if (ev.target.closest('[data-bos-brand-open]')) { ev.preventDefault(); showBrandModal(); }
  });

  /* ─── User hydration ─────────────────────── */
  function hydrateUser() {
    var u = getUser() || { name: 'Friend', business: 'Your Business', email: '', niche: 'generic' };
    var first = (u.name || 'Friend').split(' ')[0];
    var initials = (u.name || 'F L').split(/\s+/).slice(0, 2).map(function (x) { return x[0]; }).join('').toUpperCase();
    var hr = new Date().getHours();
    var greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    document.querySelectorAll('[data-bos-name]').forEach(function (el) { el.textContent = u.name || 'Friend'; });
    document.querySelectorAll('[data-bos-business]').forEach(function (el) { el.textContent = u.business || ''; });
    document.querySelectorAll('[data-bos-initial]').forEach(function (el) { el.textContent = initials || 'YOU'; });
    document.querySelectorAll('[data-bos-greet]').forEach(function (el) { el.textContent = greet + ', ' + first + '.'; });
    /* Niche-aware brand label */
    var nm = nicheMeta();
    document.querySelectorAll('[data-bos-niche-label]').forEach(function (el) { el.textContent = nm.label; });
    document.querySelectorAll('[data-bos-niche-icon]').forEach(function (el) { el.textContent = nm.icon; });
    document.querySelectorAll('[data-bos-niche-tagline]').forEach(function (el) { el.textContent = nm.tagline; });
  }

  /* (Removed 2026-05-09) — Incubator phase tracking deleted. Incubator
     is now a client-only feature, archived under /_archived/incubator-public/.
     Stub functions kept as no-ops so any straggler callers can't crash. */
  function isIncubatorComplete() { return false; }
  function setIncubatorComplete() {}
  function isPhaseDone() { return false; }

  /* ─── Auto sidebar nav (Setup / Run / Learn / Premium / Add-ons / Help / Aqua) ─── */
  function buildSidebarNav(activePath) {
    var page = activePath || (location.pathname.split('/').pop() || 'app.html');
    function link(href, icon, label, extra) {
      var act = href === page ? ' class="active"' : '';
      return '<a href="' + href + '"' + act + '><span class="ico">' + icon + '</span> ' + label + (extra || '') + '</a>';
    }
    var html = '';
    var mode = getMode();
    var isPro = mode === 'customer';

    /* Simplified Business OS — lead-nurture flow only.
       Health Check → Quick Wins (filtered videos) → Become a client.
       Everything else archived to /_archived/business-os-extras/. */
    html += '<div class="bos-side-section">'
         +    link('app.html',         '🏠', 'Home')
         +    link('tools.html',       '🛠', 'Tools')
         +    link('quick-wins.html',  '⚡', 'Quick Wins')
         +    link('diagnostic.html',  '🩺', 'My Diagnostic')
         + '</div>';

    html += '<div class="bos-side-section bos-side-cta-section">'
         +    '<a href="/milesymedia/contact" class="bos-side-become-client">'
         +      '<span class="ico">★</span> Become a client'
         +      '<span class="bos-side-become-sub">Hand it to us</span>'
         +    '</a>'
         +    '<a href="tel:+447707020250" class="bos-side-tiny-link">'
         +      '<span class="ico">📞</span> Book a free call'
         +    '</a>'
         + '</div>';
    return html;
  }

  function mountAutoSidebar() {
    var slots = document.querySelectorAll('[data-bos-auto-nav]');
    slots.forEach(function (slot) {
      var active = slot.getAttribute('data-bos-active');
      slot.innerHTML = buildSidebarNav(active);
    });
  }

  /* ─── Sidebar adapts to mode ─────────────── */
  function applyMode() {
    var mode = getMode();
    document.body.setAttribute('data-bos-mode', mode);
    document.querySelectorAll('[data-bos-os-label]').forEach(function (el) {
      el.textContent = mode === 'customer' ? 'Resources' : 'Workspace';
    });
    document.querySelectorAll('[data-bos-aqua]').forEach(function (el) {
      if (mode === 'customer') {
        el.classList.remove('bos-aqua-locked'); el.classList.add('bos-aqua-unlocked');
        var a = el.querySelector('a');
        if (a) {
          a.classList.remove('bos-locked');
          a.innerHTML = '<span class="ico">▣</span> Aqua agency portal <span class="bos-installed-tag">Active</span>';
        }
        var foot = el.querySelector('p'); if (foot) foot.textContent = 'Your full agency portal — campaigns, finance, team, the lot.';
      }
    });
    var slot = document.querySelector('[data-bos-tools-slot]');
    if (slot) {
      if (mode === 'customer') {
        slot.innerHTML = '<div class="bos-side-label">Your tools</div>'
          + ADDONS.map(function (a) {
              return '<a href="#" class="bos-installed"><span class="ico">' + a.icon + '</span> ' + a.name
                + '<span class="bos-installed-tag">Installed</span></a>';
            }).join('');
      } else {
        slot.innerHTML = '<div class="bos-side-label">Add-ons</div>'
          + '<a href="tools.html"><span class="ico">✨</span> Tools</a>'
          + '<p class="bos-side-foot">Pick &amp; mix the tools your business needs.</p>';
      }
    }
  }

  /* ─── Health-check summary on dashboard ──── */
  function paintHealthCheck() {
    var slot = document.querySelector('[data-bos-healthcheck]');
    if (!slot) return;
    var hc = getJSON(KEY_HEALTH, null);
    if (!hc) {
      slot.innerHTML = ''
        + '<div class="hc-summary-empty">'
        +   '<div class="hc-summary-empty-icon">⌕</div>'
        +   '<div>'
        +     '<h3>You haven\'t taken your Health Check yet.</h3>'
        +     '<p class="muted">It\'s 12 minutes, free, and unlocks +250 XP plus your personalised quick wins.</p>'
        +     '<a href="../health-check/index.html?from=bos" class="btn btn-primary">Take it now → +250 XP</a>'
        +   '</div>'
        + '</div>';
      return;
    }
    var leak = hc.leakEstimate ? '£' + hc.leakEstimate.toLocaleString() : '£—';
    var topics = (hc.topics || []).map(function (t) {
      return '<div class="hc-summary-pill hc-summary-pill-' + t.status + '">'
        + '<span class="hc-summary-pill-icon">' + (t.icon || '◆') + '</span>'
        + '<span>' + t.name + '</span>'
        + '<strong>' + t.score + '</strong>'
        + '</div>';
    }).join('');
    slot.innerHTML = ''
      + '<div class="hc-summary-card">'
      +   '<div class="hc-summary-card-head">'
      +     '<div><span class="eyebrow">Your Health Check</span><h3>' + (hc.headline || 'You\'re leaving money on the table.') + '</h3></div>'
      +     '<div class="hc-summary-money">' + leak + '<span>/mo</span></div>'
      +   '</div>'
      +   '<div class="hc-summary-pills">' + topics + '</div>'
      +   '<div class="hc-summary-actions">'
      +     '<a href="../health-check/index.html?from=bos" class="btn btn-secondary">Refine your answers</a>'
      +     '<a href="tel:+447707020250" class="btn btn-primary">Book a strategy call →</a>'
      +   '</div>'
      + '</div>';
  }

  /* ─── Aqua AI floating widget ────────────── */
  function getAi() { return getJSON(KEY_AI, { remaining: 5, cap: 5, history: [] }); }
  function setAi(a) { setJSON(KEY_AI, a); }

  /* Lazy-load the shared AquaAI scripted-companion library (R007).
     Lives at `../business-os/lib/aqua-ai.js`. Injected once; askAi
     gracefully falls back to the legacy router if it never resolves. */
  function ensureAquaAILoaded() {
    if (window.AquaAI) return;
    if (document.querySelector('script[data-bos-aqua-ai]')) return;
    var s = document.createElement('script');
    s.setAttribute('data-bos-aqua-ai', '');
    s.src = '../business-os/lib/aqua-ai.js';
    s.async = true;
    document.head.appendChild(s);
  }

  /* R022 — lazy-load Notify lib + mount bell icon top-right when
     bos.notifications has unread entries. Mirror-pattern of cart icon. */
  function ensureNotifyLoaded() {
    if (document.querySelector('script[data-bos-notify]')) return;
    var s = document.createElement('script');
    s.setAttribute('data-bos-notify', '');
    s.src = '../business-os/lib/notify.js';
    document.head.appendChild(s);
  }
  function mountBellIcon() {
    if (/inbox\.html$/.test(location.pathname)) return; // not on inbox itself
    if (document.querySelector('[data-bos-bell]')) return;
    /* Re-render whenever the count could have changed. */
    function paint() {
      var n = (window.Notify && window.Notify.unreadCount && window.Notify.unreadCount()) || 0;
      var existing = document.querySelector('[data-bos-bell]');
      if (n <= 0) { if (existing) existing.remove(); return; }
      var pill = existing || document.createElement('a');
      pill.setAttribute('data-bos-bell', '');
      pill.href = (location.pathname.indexOf('/marketplace/') !== -1 ? '../inbox.html' : 'inbox.html');
      /* Stack to the LEFT of the cart icon when both visible. */
      pill.style.cssText = 'position:fixed;top:14px;right:' + (document.querySelector('[data-bos-cart-icon]') ? 130 : 18) + 'px;z-index:9988;background:#0F0F0F;color:#D4B888;border:1px solid #C9A76A;padding:8px 14px;border-radius:999px;font-weight:700;font-size:13px;text-decoration:none;box-shadow:0 6px 16px rgba(0,0,0,0.3);';
      pill.innerHTML = '🔔 ' + n + ' unread →';
      if (!existing) document.body.appendChild(pill);
    }
    /* Wait briefly for Notify to load if not present yet. */
    if (!window.Notify) { setTimeout(mountBellIcon, 120); return; }
    paint();
    document.addEventListener('notify:new', paint);
    document.addEventListener('notify:read', paint);
  }

  /* R012 — Lazy-load multi-business storage shim + switcher UI.
     Both live under the Incubator's lib/ folder (single source of truth
     across BOS + Incubator). Switcher auto-mounts into `.bos-sidebar`. */
  function ensureSwitcherLoaded() {
    if (document.querySelector('script[data-bos-storage]')) return;
    var s = document.createElement('script');
    s.setAttribute('data-bos-storage', '');
    s.src = '../business-os/lib/storage.js';
    document.head.appendChild(s);
    var sw = document.createElement('script');
    sw.src = '../business-os/lib/business-switcher.js';
    sw.defer = true;
    document.head.appendChild(sw);
  }

  function mountAi() {
    ensureAquaAILoaded();
    if (document.querySelector('.bos-ai-launcher')) return;
    var btn = document.createElement('button');
    btn.className = 'bos-ai-launcher';
    btn.setAttribute('aria-label', 'Open Aqua AI');
    btn.innerHTML = '<span class="bos-ai-launcher-orb"></span><span class="bos-ai-launcher-label">Aqua AI</span>';
    document.body.appendChild(btn);

    var panel = document.createElement('div');
    panel.className = 'bos-ai-panel';
    panel.innerHTML = ''
      + '<div class="bos-ai-head">'
      +   '<div><div class="bos-ai-title">Aqua AI</div>'
      +   '<div class="bos-ai-sub">Currently scripted — full AI lands when you upgrade · <span data-bos-ai-remaining>5</span>/<span data-bos-ai-cap>5</span> free messages</div></div>'
      +   '<button class="bos-ai-close" aria-label="Close">✕</button>'
      + '</div>'
      + '<div class="bos-ai-body" data-bos-ai-body></div>'
      + '<form class="bos-ai-form" data-bos-ai-form>'
      +   '<input type="text" placeholder="Ask anything about your business…" data-bos-ai-input />'
      +   '<button type="submit" class="btn btn-primary">Ask</button>'
      + '</form>'
      + '<div class="bos-ai-foot">Limited to your portal context. <a href="mailto:hello@milesymedia.co?subject=Aqua%20AI%20upgrade">Upgrade for unlimited →</a></div>';
    document.body.appendChild(panel);

    btn.addEventListener('click', function () { panel.classList.toggle('is-open'); paintAi(); });
    document.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-bos-open-ai]')) {
        ev.preventDefault();
        panel.classList.add('is-open'); paintAi();
      }
    });
    panel.querySelector('.bos-ai-close').addEventListener('click', function () { panel.classList.remove('is-open'); });
    panel.querySelector('[data-bos-ai-form]').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var input = panel.querySelector('[data-bos-ai-input]');
      var q = (input.value || '').trim();
      if (!q) return;
      input.value = '';
      askAi(q);
    });

    paintAi();
  }
  function paintAi() {
    var a = getAi();
    document.querySelectorAll('[data-bos-ai-remaining]').forEach(function (e) { e.textContent = a.remaining; });
    document.querySelectorAll('[data-bos-ai-cap]').forEach(function (e) { e.textContent = a.cap; });
    var body = document.querySelector('[data-bos-ai-body]');
    if (!body) return;
    if (!a.history.length) {
      body.innerHTML = '<div class="bos-ai-empty">'
        + '<p><strong>Hi — I\'m Aqua.</strong> I can see your Health Check, your modules and your add-ons. Ask me anything about your business.</p>'
        + '<div class="bos-ai-suggest">'
        +   '<button data-bos-ai-pick="What\'s my biggest leak?">What\'s my biggest leak?</button>'
        +   '<button data-bos-ai-pick="Which module should I do first?">Which module should I do first?</button>'
        +   '<button data-bos-ai-pick="What\'s the cheapest win for me?">What\'s the cheapest win for me?</button>'
        + '</div></div>';
      body.querySelectorAll('[data-bos-ai-pick]').forEach(function (b) {
        b.addEventListener('click', function () { askAi(b.getAttribute('data-bos-ai-pick')); });
      });
      return;
    }
    function safeAttribute(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
        return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
      });
    }
    body.innerHTML = a.history.map(function (m) {
      var actions = Array.isArray(m.actions) && m.actions.length
        ? '<div class="bos-ai-actions">' + m.actions.map(function (action) {
            var external = /^https?:|^mailto:|^tel:/.test(action.href || '') ? ' target="_blank" rel="noopener"' : '';
            return '<a href="' + safeAttribute(action.href) + '"' + external + '>' + safeAttribute(action.label) + ' →</a>';
          }).join('') + '</div>'
        : '';
      return '<div class="bos-ai-msg bos-ai-msg-' + m.role + '">' + m.text + actions + '</div>';
    }).join('');
    body.scrollTop = body.scrollHeight;
  }
  function askAi(q) {
    var a = getAi();
    if (a.remaining <= 0) {
      a.history.push({ role: 'user', text: q });
      a.history.push({ role: 'bot',  text: 'You\'re out of free messages for this session. <a href="mailto:hello@milesymedia.co?subject=Aqua%20AI%20upgrade">Upgrade for unlimited →</a>' });
      setAi(a); paintAi(); return;
    }
    a.history.push({ role: 'user', text: q });
    a.remaining -= 1;
    setAi(a); paintAi();
    setTimeout(function () {
      var reply;
      var suggestedActions = [];
      /* Prefer the shared AquaAI scripted companion (R007). Falls back
         to the legacy keyword-router below when AquaAI hasn't loaded
         (e.g. tests or stale cached HTML). */
      if (window.AquaAI && typeof window.AquaAI.respondTo === 'function') {
        var res = window.AquaAI.respondTo(q);
        reply = res.reply;
        suggestedActions = res.suggestedActions || [];
      } else {
        var hc = getJSON(KEY_HEALTH, null);
        var nm = nicheMeta();
        var lower = q.toLowerCase();
        if (lower.indexOf('leak') !== -1 || lower.indexOf('biggest') !== -1) {
          reply = hc
            ? "Based on your Health Check, your weakest topic is <strong>" + (hc.topics?.[0]?.name || 'Visibility') + "</strong>. That's where the next 30 days will pay back fastest."
            : "I can\'t see a Health Check on file yet. Run it first — it takes 12 minutes and lights up the rest of your portal.";
        } else if (lower.indexOf('module') !== -1 || lower.indexOf('first') !== -1) {
          reply = "For " + nm.label + ", I'd start with <strong>Get found on Google in 30 days</strong>. It's the foundation everything else compounds on.";
        } else if (lower.indexOf('cheap') !== -1 || lower.indexOf('quick') !== -1) {
          reply = "Cheapest win: claim and optimise your Google Business Profile. Free, ~15 minutes, biggest local-search lever there is.";
        } else if (lower.indexOf('add-on') !== -1 || lower.indexOf('plugin') !== -1) {
          reply = "Given you're a " + nm.label.replace(' OS', '') + ", the add-ons that move the needle first are usually <strong>All-in-One Inbox</strong> and <strong>Client CRM</strong>.";
        } else {
          reply = "Good question. I'm running on a limited offline preview right now — once we wire the live model it'll pull from your Health Check, your modules and your add-ons to answer this in detail. Until then: try \"What's my biggest leak?\" or \"Which module should I do first?\"";
        }
      }
      a = getAi();
      a.history.push({ role: 'bot', text: reply, actions: suggestedActions });
      setAi(a); paintAi();
    }, 700);
  }

  /* ─── Dev bar ────────────────────────────── */
  function mountDevBar() {
    if (document.querySelector('.bos-dev-bar')) return;
    /* Only show dev bar when explicitly enabled via ?dev=1 (sticky) or
       when a previous page already set it. Keeps the user-facing app
       clean — engineers add ?dev=1 once and the flag persists. */
    try {
      var qs = new URLSearchParams(location.search);
      if (qs.get('dev') === '1') localStorage.setItem('bos.dev', '1');
      if (qs.get('dev') === '0') localStorage.removeItem('bos.dev');
      if (localStorage.getItem('bos.dev') !== '1') return;
    } catch (e) { return; }
    var bar = document.createElement('div');
    bar.className = 'bos-dev-bar';
    var mode = getMode();
    bar.innerHTML = ''
      + '<span class="bos-dev-tag">DEV</span>'
      + '<a href="app.html">Dashboard</a>'
      + '<a href="quick-wins.html">Quick wins</a>'
      + '<a href="diagnostic.html">Health history</a>'
      + '<a href="tools.html">Tools</a>'
      + '<a href="../health-check/index.html?from=bos">Health check</a>'
      + '<button data-bos-mode-toggle>' + (mode === 'customer' ? 'Customer' : 'Free') + ' →</button>'
      + '<button data-bos-xp-test>+50 XP</button>'
      + '<button data-bos-reset>Reset</button>';
    document.body.appendChild(bar);
    bar.querySelector('[data-bos-mode-toggle]').addEventListener('click', function () {
      setMode(getMode() === 'customer' ? 'free' : 'customer');
      window.location.reload();
    });
    bar.querySelector('[data-bos-xp-test]').addEventListener('click', function () { gainXP(50, 'dev test'); });
    bar.querySelector('[data-bos-reset]').addEventListener('click', function () {
      [KEY_USER, KEY_MODE, KEY_PROGRESS, KEY_HEALTH, KEY_AI].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
      window.location.href = 'index.html';
    });
  }

  /* ─── Marketplace tile rendering ─────────── */
  function renderMarketplace(targetSel, opts) {
    var target = document.querySelector(targetSel);
    if (!target) return;
    var mode = getMode();
    var filter = (opts && opts.filter) || 'all';
    target.innerHTML = ADDONS
      .filter(function (a) { return filter === 'all' || a.cat === filter; })
      .map(function (a) {
        var owned = mode === 'customer';
        return '<article class="addon-card' + (owned ? ' is-owned' : '') + '" data-mp-addon="' + a.id + '">'
          + '<div class="addon-head">'
          +   '<div class="addon-icon">' + a.icon + '</div>'
          +   '<div><h3>' + a.name + '</h3><div class="addon-cat">' + categoryLabel(a.cat) + '</div></div>'
          + '</div>'
          + '<p>' + a.blurb + '</p>'
          + '<div class="addon-foot">'
          +   '<div class="addon-price">' + (owned ? '<span class="bos-installed-tag">Installed</span>' : '<strong>£' + a.price + '</strong><span>/mo</span>') + '</div>'
          +   (owned
              ? '<a href="#" class="btn btn-secondary">Open</a>'
              : '<a href="marketplace/' + a.id + '.html" class="btn btn-primary">View details →</a>')
          + '</div>'
          + '</article>';
      }).join('');
  }
  function categoryLabel(c) {
    return ({ comms: 'Communications', site: 'Website', sell: 'Sell', retain: 'Retain', grow: 'Grow', ops: 'Operations' })[c] || c;
  }

  /* ─── Mobile drawer ──────────────────────── */
  function mountMobileNav() {
    var sidebar = document.querySelector('.bos-sidebar');
    if (!sidebar || document.querySelector('.bos-mobile-nav-btn')) return;
    var btn = document.createElement('button');
    btn.className = 'bos-mobile-nav-btn';
    btn.innerHTML = '☰ Menu';
    sidebar.appendChild(btn);

    var drawer = document.createElement('div');
    drawer.className = 'bos-mobile-drawer';
    var nav = sidebar.querySelector('.bos-side-nav');
    var navClone = nav ? nav.cloneNode(true) : null;
    drawer.innerHTML = '<button class="bos-mobile-drawer-close" aria-label="Close">✕</button>';
    if (navClone) drawer.appendChild(navClone);
    document.body.appendChild(drawer);

    function open()  { drawer.classList.add('is-open');  document.body.classList.add('bos-drawer-open'); }
    function close() { drawer.classList.remove('is-open'); document.body.classList.remove('bos-drawer-open'); }
    btn.addEventListener('click', open);
    drawer.querySelector('.bos-mobile-drawer-close').addEventListener('click', close);
    drawer.addEventListener('click', function (ev) { if (ev.target === drawer) close(); });
    drawer.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', close); });
  }

  /* ─── Pro-only page guard ────────────────── */
  /* Pages listed here render a clean "this is a Pro feature" lockup
     when the user is on the free tier, hiding the real content. */
  var PRO_ONLY = ['leads.html', 'trackers.html', 'tasks.html', 'docs.html'];
  function maybeProLock() {
    /* R011: source of truth is now `isPro()` (covers both `bos.entitlement`
       tier in pro|pro-trial AND legacy `bos.mode === 'customer'`). */
    if (isPro()) return;
    var page = (location.pathname.split('/').pop() || '').toLowerCase();
    if (PRO_ONLY.indexOf(page) === -1) return;
    var main = document.querySelector('.bos-main');
    if (!main) return;
    var titles = {
      'leads.html':    { icon: '👥', name: 'My customers',  blurb: 'A full sales pipeline — every lead, every stage, every quid in flight.' },
      'trackers.html': { icon: '📈', name: 'My numbers',    blurb: 'Live KPI tracking, time tracker, and connectors to QuickBooks / Stripe / Sheets.' },
      'tasks.html':    { icon: '✓',  name: 'My to-dos',     blurb: 'Kanban tasks with assignees, due dates, recurring rules and automation triggers.' },
      'docs.html':     { icon: '📁', name: 'My files',      blurb: 'Searchable SOPs, contracts, brand assets and the full SOP Hub library.' }
    };
    var t = titles[page];
    main.innerHTML = ''
      + '<div class="bos-pro-lock">'
      +   '<div class="bos-pro-lock-icon">' + t.icon + '</div>'
      +   '<span class="eyebrow">Pro feature</span>'
      +   '<h1>' + t.name + '</h1>'
      +   '<p>' + t.blurb + '</p>'
      +   '<p class="muted">This isn\'t in your free tier yet — but if you\'d find it useful, we can switch it on for you. Most requests we already have built.</p>'
      +   '<div class="hc-actions" style="justify-content:center">'
      +     '<a href="/milesymedia/contact" class="btn btn-primary">Request access →</a>'
      +     '<a href="tools.html" class="btn btn-secondary">See all tools</a>'
      +   '</div>'
      + '</div>';
  }

  /* ─── Free-tier badge + upgrade footer ───── */
  function mountTierUI() {
    var mode = getMode();
    /* Topbar tier pill */
    var topbar = document.querySelector('.bos-topbar');
    if (topbar && !topbar.querySelector('.bos-tier-pill')) {
      var pill = document.createElement('a');
      pill.className = 'bos-tier-pill bos-tier-pill-' + mode;
      pill.href = mode === 'customer' ? 'app.html' : 'tools.html';
      pill.innerHTML = mode === 'customer'
        ? '<span class="bos-tier-dot"></span> Pro · all add-ons active'
        : '<span class="bos-tier-dot"></span> Free tier · upgrade →';
      topbar.appendChild(pill);
    }
    /* Slim "what you can add" footer link — every page, free only */
    if (mode !== 'customer' && document.querySelector('.bos-main') && !document.querySelector('.bos-upgrade-foot')) {
      var foot = document.createElement('div');
      foot.className = 'bos-upgrade-foot';
      foot.innerHTML = 'You\'re on the free tier — <a href="tools.html">see the available tools →</a>';
      document.querySelector('.bos-main').appendChild(foot);
    }
  }

  /* ─── Boot ───────────────────────────────── */
  /* (Removed 2026-05-09) — Back-to-Incubator strip removed along with
     the rest of the Incubator integration. mountIncubatorStrip is a
     no-op now so any straggler caller doesn't crash. */
  function mountIncubatorStrip() {}
  function consumeBosDeepLink() {
    var raw = null;
    try { raw = localStorage.getItem('bos.deepLink'); } catch (e) { return; }
    if (!raw) return;
    var data; try { data = JSON.parse(raw); } catch (e) { data = null; }
    try { localStorage.removeItem('bos.deepLink'); } catch (e) {}
    if (!data || !data.section) return;
    if (Date.now() - (data.ts || 0) > 30000) return; // stale, ignore
    var target = document.getElementById('bos-' + data.section);
    if (!target) return;
    setTimeout(function () {
      try { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
    }, 80);
  }

  /* R011 — trial-expiry banner. Renders when on a Pro trial with ≤2 days
     remaining, and a final "trial expired — back on free" notice once
     auto-rollback fires. Dismissable per-banner-day via `bos.trialBanner.lastDismissedDay`. */
  function mountTrialBanner() {
    var e = getEntitlement();
    if (!e) return;
    var msg = null, kind = 'warn';
    if (e.tier === 'pro-trial' && e.expiresAt) {
      var rem = Math.max(0, Math.round((+new Date(e.expiresAt) - Date.now()) / 86400000));
      if (rem <= 2 && rem > 0) {
        msg = 'Pro trial ends in ' + rem + ' day' + (rem === 1 ? '' : 's') + '. Confirm Pro to keep the unlock shelf live.';
      } else if (rem === 0) {
        msg = 'Pro trial ends today. Confirm Pro to keep the unlock shelf live.';
      }
    } else if (e.expiredAt && e.tier === 'free') {
      var dayDiff = Math.round((Date.now() - +new Date(e.expiredAt)) / 86400000);
      if (dayDiff <= 7) {
        msg = 'Your Pro trial ended. You\'re on Free again — your data is preserved. Re-upgrade any time.';
        kind = 'info';
      }
    }
    if (!msg) return;
    if (document.querySelector('[data-bos-trial-banner]')) return;
    var bar = document.createElement('div');
    bar.setAttribute('data-bos-trial-banner', '');
    bar.style.cssText = 'background:' + (kind === 'warn' ? '#3a2a14' : '#0F1420') + ';color:#D4B888;border-bottom:1px solid #2A2A2A;padding:10px 16px;font-size:13px;text-align:center;letter-spacing:0.02em;';
    bar.innerHTML = msg + ' <a href="/milesymedia/contact" style="color:#D4B888;font-weight:700;margin-left:8px">Talk to Milesymedia →</a>';
    document.body.insertBefore(bar, document.body.firstChild);
  }

  /* R020 — Preview-as-client banner. Reads `bos.previewAs`, validates
     expiry (auto-clears + switches back to originalBusinessId if past),
     renders sticky violet banner top-of-body w/ leadName + remaining
     time + "Exit preview" button. Same code path mirrored on Incubator
     pages via incubator.js — single source of truth would be ideal but
     surface markup differs slightly so duplication is small + clear. */
  function readPreviewAs() {
    try { return JSON.parse(localStorage.getItem('bos.previewAs') || 'null'); }
    catch (e) { return null; }
  }
  function writePreviewAs(v) {
    if (v == null) { try { localStorage.removeItem('bos.previewAs'); } catch (e) {} ; return; }
    try { localStorage.setItem('bos.previewAs', JSON.stringify(v)); } catch (e) {}
  }
  function exitPreview(p) {
    writePreviewAs(null);
    if (p && p.originalBusinessId && window.BOSStorage && window.BOSStorage.switch) {
      window.BOSStorage.switch(p.originalBusinessId);
    }
    location.reload();
  }
  function mountPreviewBanner() {
    var p = readPreviewAs();
    if (!p) return;
    var now = Date.now();
    if (!p.expiresAt || +new Date(p.expiresAt) < now) {
      // Auto-expire — silent flip back, no banner.
      exitPreview(p); return;
    }
    if (document.querySelector('[data-bos-preview-banner]')) return;
    var remMs = +new Date(p.expiresAt) - now;
    var remMin = Math.max(1, Math.round(remMs / 60000));
    var bar = document.createElement('div');
    bar.setAttribute('data-bos-preview-banner', '');
    bar.style.cssText = 'background:#3b2c52;color:#d4c1f0;border-bottom:1px solid #5c4880;padding:10px 16px;font-size:13px;text-align:center;letter-spacing:0.02em;';
    bar.innerHTML = '👁 Previewing as <strong>' + (p.leadName || 'client') + '</strong> · expires in ~' + remMin + ' min · <a href="#" data-bos-preview-exit style="color:#a48ed1;font-weight:700;margin-left:6px">Exit preview</a>';
    document.body.insertBefore(bar, document.body.firstChild);
    bar.querySelector('[data-bos-preview-exit]').addEventListener('click', function (ev) {
      ev.preventDefault();
      exitPreview(p);
    });
  }

  /* R016 — cart icon top-right when bos.cart.addons.length > 0.
     Renders a small floating pill linking to cart.html. */
  function mountCartIcon() {
    if (document.querySelector('[data-bos-cart-icon]')) return;
    var cart = null;
    try { cart = JSON.parse(localStorage.getItem('bos.cart') || 'null'); } catch (e) {}
    if (!cart || !Array.isArray(cart.addons) || !cart.addons.length) return;
    /* Don't render on cart page itself (would be redundant). */
    if (/cart\.html$/.test(location.pathname)) return;
    var pill = document.createElement('a');
    pill.setAttribute('data-bos-cart-icon', '');
    pill.href = (location.pathname.indexOf('/marketplace/') !== -1 ? '../cart.html' : 'cart.html');
    pill.style.cssText = 'position:fixed;top:14px;right:18px;z-index:9989;background:#C9A76A;color:#1a1208;padding:8px 14px;border-radius:999px;font-weight:700;font-size:13px;text-decoration:none;box-shadow:0 6px 16px rgba(0,0,0,0.3);';
    pill.innerHTML = '🛒 ' + cart.addons.length + ' add-on' + (cart.addons.length === 1 ? '' : 's') + ' →';
    document.body.appendChild(pill);
  }

  document.addEventListener('DOMContentLoaded', function () {
    ensureSwitcherLoaded();
    ensureNotifyLoaded();
    mountPreviewBanner();
    mountIncubatorStrip();
    mountTrialBanner();
    mountCartIcon();
    mountBellIcon();
    mountAutoSidebar();
    hydrateUser();
    applyBranding();
    applyMode();
    maybeProLock();
    maybeBrandNudge();
    tickStreak();
    paintProgress();
    paintHealthCheck();
    hydrateHealthCheckFromServer();
    mountMobileNav();
    mountTierUI();
    mountDevBar();
    mountAi();
  });

  /* Expose */
  window.BOS = {
    NICHES: NICHES, ADDONS: ADDONS, ACHIEVEMENTS: ACHIEVEMENTS, LEVELS: LEVELS,
    getUser: getUser, setUser: setUser, getMode: getMode, setMode: setMode,
    getEntitlement: getEntitlement, isPro: isPro,
    getNiche: getNiche, nicheMeta: nicheMeta,
    getProgress: getProgress, gainXP: gainXP, unlockAchievement: unlockAchievement,
    renderMarketplace: renderMarketplace,
    isIncubatorComplete: isIncubatorComplete,
    setIncubatorComplete: setIncubatorComplete,
    isPhaseDone: isPhaseDone
  };
})();
