/* IncubatorRecommend — HC → top-3 next-action recommendations.
   Pure function `fromHC(hc)` + DOM mount `mount()` against
   `[data-hc-recommend]`. Honesty contract (chapter #68): only
   answered topics surface; empty / partial states are explicit. */
(function () {

  /* HC area name → recommendation row. Per chapter #74 mapping.
     `severity` is filled in at sort time from the topic's score. */
  var TOPIC_MAP = {
    'Visibility & Search': {
      leakHeadline: 'You\'re hard to find when people search.',
      suggestedAction: 'Read Core Principles — visibility comes first; everything else compounds on top.',
      deepLinkTo: { kind: 'lesson', label: 'Open Core Principles', href: '../business-os/quick-wins.html' }
    },
    'Your Website': {
      leakHeadline: 'Visitors are landing but not converting.',
      suggestedAction: 'Read Super Sales — the page-by-page audit that turns lookers into leads.',
      deepLinkTo: { kind: 'lesson', label: 'Open Super Sales', href: '../business-os/quick-wins.html' }
    },
    'Where Customers Come From': {
      leakHeadline: 'You\'re channel-dependent — too much from one place.',
      suggestedAction: 'Open the Diagnostics phase to map every channel and rate the leak.',
      deepLinkTo: { kind: 'phase', label: 'Open Diagnostics phase', href: 'phase-3-diagnostics.html' }
    },
    'My Business': {
      leakHeadline: 'Your foundations need shoring up before scale.',
      suggestedAction: 'Open the Blueprint phase to fill in the structure first.',
      deepLinkTo: { kind: 'phase', label: 'Open Blueprint phase', href: 'phase-2-blueprint.html' }
    },
    'Keeping Them': {
      leakHeadline: 'Customers leave after the first sale.',
      suggestedAction: 'Read Referral Alchemy — turn one happy client into three.',
      deepLinkTo: { kind: 'lesson', label: 'Open Referral Alchemy', href: '../business-os/quick-wins.html' }
    }
  };

  var TALK_TO_HUMAN = {
    topic: '_human',
    leakHeadline: 'A leak that bad is worth a 30-minute call.',
    suggestedAction: 'Book a free strategy call — we\'ll walk through your live data and leave you with a costed plan.',
    deepLinkTo: { kind: 'human', label: 'Talk to a human', href: 'https://wa.me/' },
    severity: 'critical',
    score: null
  };

  function fromHC(hc) {
    if (!hc || !Array.isArray(hc.topics)) return [];
    var answered = hc.topics.filter(function (t) { return t && typeof t.score === 'number'; });
    if (!answered.length) return [];
    answered.sort(function (a, b) { return a.score - b.score; });
    var top = answered.slice(0, 3).map(function (t) {
      var map = TOPIC_MAP[t.name];
      if (!map) return null;
      return {
        topic: t.name,
        icon: t.icon || '◆',
        score: t.score,
        severity: t.score < 30 ? 'critical' : (t.score < 55 ? 'warn' : 'mild'),
        leakHeadline: map.leakHeadline,
        suggestedAction: map.suggestedAction,
        deepLinkTo: map.deepLinkTo
      };
    }).filter(Boolean);
    if (top[0] && top[0].score < 30) top.push(TALK_TO_HUMAN);
    return top;
  }

  function readHC() {
    try { return JSON.parse(localStorage.getItem('bos.healthCheck') || 'null'); }
    catch (e) { return null; }
  }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  function renderEmpty(host) {
    host.innerHTML =
      '<div class="inc-hc-strip-empty">' +
        '<div class="inc-hc-strip-icon">🩺</div>' +
        '<div>' +
          '<strong>No Health Check on file yet.</strong>' +
          '<p class="inc-hc-strip-sub">Run the 12-minute Health Check — it surfaces the real leaks and your next moves land here automatically.</p>' +
          '<a class="inc-btn" href="../health-check/index.html">Run the Health Check →</a>' +
        '</div>' +
      '</div>';
  }

  function renderRecs(host, recs, hc) {
    var rows = recs.map(function (r) {
      var sevLbl = r.severity === 'critical' ? 'Biggest leak'
                  : r.severity === 'warn'    ? 'Worth fixing soon'
                  : r.score == null          ? ''
                  : 'Mild — improve later';
      var sevClass = 'inc-hc-rec inc-hc-rec--' + r.severity;
      var scorePill = (r.score == null)
        ? ''
        : '<span class="inc-hc-score">' + r.score + '/100</span>';
      var topicLine = (r.topic === '_human')
        ? ''
        : '<div class="inc-hc-rec-topic"><span class="inc-hc-rec-icon">' + escape(r.icon) + '</span>' + escape(r.topic) + ' ' + scorePill + ' <span class="inc-hc-sev-pill">' + sevLbl + '</span></div>';
      var external = r.deepLinkTo.kind === 'human' ? ' target="_blank" rel="noopener"' : '';
      return (
        '<div class="' + sevClass + '">' +
          topicLine +
          '<div class="inc-hc-rec-headline">' + escape(r.leakHeadline) + '</div>' +
          '<div class="inc-hc-rec-action">' + escape(r.suggestedAction) + '</div>' +
          '<a class="inc-hc-rec-cta" href="' + escape(r.deepLinkTo.href) + '"' + external + '>' + escape(r.deepLinkTo.label) + ' →</a>' +
        '</div>'
      );
    }).join('');
    var unanswered = (hc && hc.topics) ? hc.topics.filter(function (t) { return t.score == null; }).length : 0;
    var partial = unanswered > 0
      ? '<p class="inc-hc-strip-sub">' + unanswered + ' topic' + (unanswered === 1 ? ' is' : 's are') + ' still unanswered. Recommendations only cover what you answered — that\'s the honesty contract.</p>'
      : '';
    host.innerHTML =
      '<div class="inc-hc-strip-head">' +
        '<div>' +
          '<span class="inc-grid-label" style="margin:0">Your next move — based on your Health Check</span>' +
          partial +
        '</div>' +
        '<a class="inc-hc-relink" href="../health-check/index.html">Re-run the HC ↗</a>' +
      '</div>' +
      '<div class="inc-hc-recs">' + rows + '</div>';
  }

  function mount() {
    var host = document.querySelector('[data-hc-recommend]');
    if (!host) return;
    var hc = readHC();
    var recs = fromHC(hc);
    if (!hc || !recs.length) { renderEmpty(host); return; }
    renderRecs(host, recs, hc);
  }

  document.addEventListener('DOMContentLoaded', mount);

  window.IncubatorRecommend = {
    fromHC: fromHC,
    mount: mount,
    TOPIC_MAP: TOPIC_MAP
  };
})();
