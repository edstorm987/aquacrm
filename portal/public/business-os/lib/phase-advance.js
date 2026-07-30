/* IncubatorPhaseAdvance — BOS lesson completion → "Mark phase complete?" CTA.
   Self-report progression (per round prompt: no auto-advance). Honesty
   contract: only show advance when the requirement is genuinely met. */
(function () {

  /* phaseId → required BOS lesson ids. Five lessons currently shipped
     per chapter #74 (chrome-profile, core-principles, super-sales,
     ops-sustainability, referral-alchemy). Distribution by phase:
     - Epic Intro      : no lessons (orientation only)
     - Blueprint       : core-principles
     - Diagnostics     : chrome-profile + super-sales
     - Brand Builder   : ops-sustainability + referral-alchemy */
  var PHASE_LESSON_REQUIREMENTS = {
    'epic-intro':    [],
    'blueprint':     ['core-principles'],
    'diagnostics':   ['chrome-profile', 'super-sales'],
    'brand-builder': ['ops-sustainability', 'referral-alchemy']
  };
  var PHASES = [
    { id: 'epic-intro',    label: 'Epic Intro' },
    { id: 'blueprint',     label: 'Blueprint Setup' },
    { id: 'diagnostics',   label: 'Diagnostics & Foundations' },
    { id: 'brand-builder', label: 'Brand Builder' }
  ];

  function readLessons() {
    try { return JSON.parse(localStorage.getItem('bos.lessonProgress') || '{}') || {}; }
    catch (e) { return {}; }
  }
  function readAdvanced() {
    try { return JSON.parse(localStorage.getItem('incubator.phaseAdvanced') || '{}') || {}; }
    catch (e) { return {}; }
  }
  function writeAdvanced(map) {
    try { localStorage.setItem('incubator.phaseAdvanced', JSON.stringify(map)); } catch (e) {}
  }
  function getCurrentPhase() {
    try { return localStorage.getItem('incubator.phase') || 'epic-intro'; }
    catch (e) { return 'epic-intro'; }
  }
  function setCurrentPhase(p) {
    try { localStorage.setItem('incubator.phase', p); } catch (e) {}
  }
  function nextPhaseId(id) {
    var idx = PHASES.findIndex(function (p) { return p.id === id; });
    if (idx < 0 || idx >= PHASES.length - 1) return null;
    return PHASES[idx + 1].id;
  }
  function phaseLabel(id) {
    var p = PHASES.filter(function (x) { return x.id === id; })[0];
    return p ? p.label : id;
  }

  function statusFor(phaseId) {
    var req = PHASE_LESSON_REQUIREMENTS[phaseId] || [];
    var lessons = readLessons();
    var done = req.filter(function (id) { return !!lessons[id]; });
    return { req: req, done: done.length, total: req.length, complete: req.length > 0 && done.length === req.length };
  }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  function renderProgress(host, phaseId) {
    var s = statusFor(phaseId);
    var advanced = readAdvanced()[phaseId];
    var pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
    var headline = s.total
      ? 'Lesson progress · ' + s.done + ' / ' + s.total + ' complete'
      : 'No lessons required for this phase.';
    var bar = s.total
      ? '<div class="inc-pa-bar"><span style="width:' + pct + '%"></span></div>'
      : '';
    var cta = '';
    if (advanced) {
      cta = '<div class="inc-pa-done">✓ Phase marked complete. You\'re on <strong>' + escape(phaseLabel(getCurrentPhase())) + '</strong>.</div>';
    } else if (s.complete) {
      cta = '<button type="button" class="inc-btn inc-pa-cta" data-pa-mark="' + escape(phaseId) + '">Ready to advance? Mark ' + escape(phaseLabel(phaseId)) + ' complete →</button>';
    } else if (s.total) {
      var missing = s.req.filter(function (id) { return !readLessons()[id]; });
      cta = '<div class="inc-pa-missing">Lessons still to complete: <strong>' + missing.map(escape).join(', ') + '</strong>.</div>';
    }
    host.innerHTML =
      '<div class="inc-pa-head">' + escape(headline) + '</div>' +
      bar + cta;
  }

  function fireConfetti() {
    var COLORS = ['#C9A76A', '#D4B888', '#8E7340', '#5a7a3a', '#9ec5e8'];
    var burst = document.createElement('div');
    burst.className = 'inc-pa-confetti';
    for (var i = 0; i < 32; i++) {
      var p = document.createElement('span');
      p.style.left = (10 + Math.random() * 80) + '%';
      p.style.background = COLORS[i % COLORS.length];
      p.style.animationDelay = (Math.random() * 0.4) + 's';
      p.style.animationDuration = (1.2 + Math.random() * 0.8) + 's';
      burst.appendChild(p);
    }
    document.body.appendChild(burst);
    setTimeout(function () { burst.remove(); }, 2400);
  }

  function showToast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0F0F0F;border:1px solid #C9A76A;color:#D4B888;padding:12px 20px;border-radius:10px;z-index:9999;font-size:14px;letter-spacing:0.02em;box-shadow:0 6px 20px rgba(0,0,0,0.5);';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3500);
  }

  function markComplete(phaseId) {
    var adv = readAdvanced();
    if (adv[phaseId]) return;
    adv[phaseId] = true;
    writeAdvanced(adv);
    var next = nextPhaseId(phaseId);
    var current = getCurrentPhase();
    var currentIdx = PHASES.findIndex(function (p) { return p.id === current; });
    var phaseIdx = PHASES.findIndex(function (p) { return p.id === phaseId; });
    if (next && phaseIdx >= currentIdx) setCurrentPhase(next);
    var detail = { phaseId: phaseId, nextPhaseId: next };
    document.dispatchEvent(new CustomEvent('incubator:phase-complete', { detail: detail }));
    if (window.Activity && typeof window.Activity.log === 'function') {
      window.Activity.log('incubator.phase-advanced', { from: phaseId, to: next });
    }
    if (window.Notify && typeof window.Notify.push === 'function') {
      var nextLbl = next ? phaseLabel(next) : 'completed all phases';
      window.Notify.push('phase',
        'You completed ' + phaseLabel(phaseId) + '!',
        next ? 'Onwards to ' + nextLbl + '. Check the new lessons available for this phase.' : 'All phases done. Onwards.',
        { ctaHref: next ? '../incubator/' + (function (id) { return ({'epic-intro':'phase-1-epic-intro.html','blueprint':'phase-2-blueprint.html','diagnostics':'phase-3-diagnostics.html','brand-builder':'phase-4-brand-builder.html'})[id]; })(next) : '../incubator/index.html' }
      );
    }
    fireConfetti();
    showToast(next ? 'Phase complete → ' + phaseLabel(next) : 'All phases complete. Onwards.');
  }

  function mount() {
    var hosts = document.querySelectorAll('[data-phase-advance]');
    for (var i = 0; i < hosts.length; i++) {
      (function (host) {
        var phaseId = host.getAttribute('data-phase-advance');
        renderProgress(host, phaseId);
        host.addEventListener('click', function (ev) {
          var btn = ev.target.closest('[data-pa-mark]');
          if (!btn) return;
          markComplete(btn.getAttribute('data-pa-mark'));
          renderProgress(host, phaseId);
        });
      })(hosts[i]);
    }
  }

  document.addEventListener('DOMContentLoaded', mount);

  window.IncubatorPhaseAdvance = {
    PHASE_LESSON_REQUIREMENTS: PHASE_LESSON_REQUIREMENTS,
    statusFor: statusFor,
    markComplete: markComplete,
    mount: mount
  };
})();
