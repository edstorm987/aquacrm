/* IncubatorWelcome — first-visit + returning-visitor banner on root.
   First visit (incubator.welcomedAt unset) → "Welcome, {name}. Based on
   your HC, you're starting at Epic Intro. Watch the welcome video to
   begin." Dismissable; logs to bos.activity[].
   Returning visit → "Pick up where you left off" with last-visited
   phase chip linking back to that phase page. */
(function () {
  var KEY_WELCOMED = 'incubator.welcomedAt';
  var KEY_LAST     = 'incubator.lastVisitedPhasePage';
  var KEY_ACTIVITY = 'bos.activity';

  function getStr(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function setStr(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function getJSON(k, d) { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(d)); } catch (e) { return d; } }
  function setJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function escape(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }

  function logActivity(msg, kind) {
    if (window.Activity && typeof window.Activity.log === 'function') {
      window.Activity.log(kind || 'incubator.welcomed', { msg: msg });
      return;
    }
    var a = getJSON(KEY_ACTIVITY, []) || [];
    a.push({ ts: new Date().toISOString(), kind: kind || 'incubator.welcomed', payload: { msg: msg } });
    setJSON(KEY_ACTIVITY, a);
  }

  function phaseLabel(id) {
    return ({ 'epic-intro':'Epic Intro','blueprint':'Blueprint Setup','diagnostics':'Diagnostics & Foundations','brand-builder':'Brand Builder' })[id] || 'Epic Intro';
  }
  function phaseFromPage(page) {
    var m = (page || '').match(/^phase-\d+-(.+)\.html$/);
    if (!m) return null;
    return m[1].replace(/^epic-intro$/, 'epic-intro');
  }

  function readName() {
    var n = getStr('incubator.userName');
    if (n) return n;
    var u = getJSON('bos.user', null);
    if (u && u.name) return u.name;
    var c = getJSON('hc.contact', null);
    if (c && c.name) return c.name;
    return null;
  }

  function render() {
    var host = document.querySelector('[data-inc-welcome]');
    if (!host) return;

    var welcomed = !!getStr(KEY_WELCOMED);
    var last = getStr(KEY_LAST);
    var name = readName();
    var bridged = getStr('incubator.bridgedFromHC') === '1';

    if (!welcomed) {
      // First visit — welcome banner
      var greet = name ? 'Welcome, ' + escape(name) + '.' : 'Welcome.';
      var lead = bridged
        ? 'Based on your Health Check, you\'re starting at <strong>Epic Intro</strong>. Watch the welcome video to begin.'
        : 'You\'re starting at <strong>Epic Intro</strong>. Watch the welcome video to begin — or jump into any phase from the Phase Path below.';
      host.hidden = false;
      host.innerHTML =
        '<div class="inc-welcome-card inc-welcome-card--first">' +
          '<div class="inc-welcome-icon">✨</div>' +
          '<div class="inc-welcome-body">' +
            '<div class="inc-welcome-greet">' + greet + '</div>' +
            '<p class="inc-welcome-lead">' + lead + '</p>' +
            '<div class="inc-welcome-actions">' +
              '<a class="inc-btn" href="phase-1-epic-intro.html">Open Epic Intro →</a>' +
              '<button type="button" class="inc-welcome-dismiss" data-inc-welcome-dismiss>Got it · don\'t show again</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      logActivity((name ? name + ' ' : '') + 'saw the Incubator welcome banner');
      return;
    }

    if (last) {
      var slug = phaseFromPage(last);
      var label = phaseLabel(slug || 'epic-intro');
      host.hidden = false;
      host.innerHTML =
        '<a class="inc-welcome-card inc-welcome-card--resume" href="' + escape(last) + '">' +
          '<div class="inc-welcome-icon">↩︎</div>' +
          '<div class="inc-welcome-body">' +
            '<div class="inc-welcome-greet">Pick up where you left off.</div>' +
            '<p class="inc-welcome-lead">Last visited: <span class="inc-chip inc-chip-resume">' + escape(label) + '</span></p>' +
          '</div>' +
          '<div class="inc-welcome-cta">Resume →</div>' +
        '</a>';
      return;
    }

    host.hidden = true;
  }

  document.addEventListener('click', function (ev) {
    var d = ev.target.closest('[data-inc-welcome-dismiss]');
    if (!d) return;
    setStr(KEY_WELCOMED, new Date().toISOString());
    var name = readName();
    logActivity((name ? name + ' ' : '') + 'dismissed the Incubator welcome banner', 'incubator.welcome-dismissed');
    render();
  });

  document.addEventListener('DOMContentLoaded', render);

  window.IncubatorWelcome = { render: render };
})();
