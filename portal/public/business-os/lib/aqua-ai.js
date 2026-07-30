/* AquaAI — scripted companion (no API). Single source of truth for the
   replies + suggested actions, loaded by both the Incubator surface and
   BOS (`../business-os/lib/aqua-ai.js`). Real Claude API wires later
   via T6.

   Public:
     window.AquaAI.respondTo(message, context?) → { reply, suggestedActions[] }
     window.AquaAI.disclaimer  // string shown by surfaces
     window.AquaAI.starters    // array of suggested opening prompts
     window.AquaAI.context()   // best-effort context probe (hc, niche, phase, page)

   `suggestedActions[i] = { label, href, kind?: 'lesson'|'phase'|'human'|'open' }`. */

(function () {

  /* ─── Canonical replies — 35 patterns ─────────────────────────────
     Each entry: keywords (lowercase substrings, OR-matched), reply
     (function or string), suggestedActions (function or array). The
     function form receives ctx; static form ignores it. */
  var REPLIES = [

    /* PHASE QUESTIONS (10) */
    { kw: ['what phase', 'which phase', 'current phase', 'phase am i'],
      reply: function (ctx) {
        return 'You\'re currently on <strong>' + (ctx.phaseLabel || 'Epic Intro') + '</strong>. Open the phase page to see the checklist.';
      },
      actions: function (ctx) { return [phaseAction(ctx.phase)]; } },

    { kw: ['epic intro', 'intro phase', 'orientation'],
      reply: 'Epic Intro is the orientation. Watch the welcome video, set your intention, reply to your onboarder. Three boxes — done.',
      actions: [{ label: 'Open Epic Intro', href: 'phase-1-epic-intro.html', kind: 'phase' }] },

    { kw: ['blueprint phase', 'blueprint setup', 'foundation phase'],
      reply: 'Blueprint Setup fills in the bones — About my business, the worksheets, the Q&A. Two-week pass; don\'t rush it.',
      actions: [{ label: 'Open Blueprint', href: 'phase-2-blueprint.html', kind: 'phase' }] },

    { kw: ['diagnostics phase', 'health check phase'],
      reply: 'Diagnostics is where the Health Check + the strategy review session land. Honest mirror — what\'s actually leaking.',
      actions: [
        { label: 'Open Diagnostics', href: 'phase-3-diagnostics.html', kind: 'phase' },
        { label: 'Run the Health Check', href: '../health-check/index.html', kind: 'open' }
      ] },

    { kw: ['brand builder', 'brand phase'],
      reply: 'Brand Builder turns the Diagnostics priorities into a brand kit + launch-ready assets. Last templated phase before your Live portal.',
      actions: [{ label: 'Open Brand Builder', href: 'phase-4-brand-builder.html', kind: 'phase' }] },

    { kw: ['advance', 'next phase', 'finish phase', 'move to next'],
      reply: 'Each phase advances when you tick its checklist OR mark it complete from its lessons-progress block. Self-report — operator stays in control.',
      actions: function (ctx) { return [phaseAction(ctx.phase)]; } },

    { kw: ['live portal', 'custom portal', 'when do i get'],
      reply: 'Live custom portal materialises after Brand Builder is approved. Your strategist hands off; T1 / T5 build it.',
      actions: [{ label: 'See the bridge page', href: 'portal-bridge.html', kind: 'phase' }] },

    { kw: ['skip phase'],
      reply: 'You can\'t skip phases — but you can move at your own pace. Phases are designed to compound: doing #2 before #1 leaves money on the table.',
      actions: function (ctx) { return [phaseAction(ctx.phase)]; } },

    { kw: ['how long', 'how many weeks', 'duration'],
      reply: 'Roughly: Epic Intro = 1–3 days · Blueprint = 2 weeks · Diagnostics = 1 week + the strategy session · Brand Builder = 2–3 weeks. Most clients ship in 6–8 weeks.',
      actions: [] },

    { kw: ['phase order', 'phase sequence'],
      reply: 'Order: Epic Intro → Blueprint Setup → Diagnostics & Foundations → Brand Builder. Then Live custom portal.',
      actions: [{ label: 'See the Phase Path', href: 'index.html', kind: 'open' }] },

    /* STUCK (3) */
    { kw: ['stuck', 'frozen', 'i don\'t know', 'don\'t know what', 'help me'],
      reply: 'Most "stuck" lands in one of three places: HC not run, About-my-business empty, or no first lesson opened. Pick whichever applies and the next step is obvious.',
      actions: [
        { label: 'Run the Health Check', href: '../health-check/index.html', kind: 'open' },
        { label: 'Open About my business', href: '../business-os/company.html', kind: 'open' },
        { label: 'Open Core Principles', href: '../business-os/quick-wins.html', kind: 'lesson' }
      ] },

    { kw: ['overwhelmed', 'too much'],
      reply: 'It\'s a lot on purpose — but you only do one thing at a time. Pick the smallest box you can tick today; don\'t plan the week.',
      actions: function (ctx) { return [phaseAction(ctx.phase)]; } },

    { kw: ['where to start', 'start here', 'first step', 'beginning'],
      reply: 'Start with the Health Check — it takes 12 minutes and lights up the rest of the portal with what you actually need.',
      actions: [{ label: 'Run the Health Check', href: '../health-check/index.html', kind: 'open' }] },

    /* WHAT NEXT (3) */
    { kw: ['what next', 'whats next', 'next move', 'next action'],
      reply: function (ctx) {
        if (!ctx.hc) return 'No Health Check on file yet — that\'s the next move. It calibrates the rest.';
        if (ctx.hcLowest) return 'Based on your HC, your weakest area is <strong>' + ctx.hcLowest + '</strong>. The HC strip on the Incubator root has the targeted lesson.';
        return 'Open the Incubator root — your HC-driven recommendations strip shows the top three.';
      },
      actions: function (ctx) {
        if (!ctx.hc) return [{ label: 'Run the Health Check', href: '../health-check/index.html', kind: 'open' }];
        return [{ label: 'See your recommendations', href: 'index.html', kind: 'open' }];
      } },

    { kw: ['done with', 'finished my'],
      reply: 'Nice. Mark the lesson done in Quick Wins — it counts toward the phase advance.',
      actions: [{ label: 'Browse modules', href: '../business-os/tools.html', kind: 'open' }] },

    { kw: ['what should i do today', 'today'],
      reply: 'One thing today. Pick the smallest open checkbox on your current phase page and do it. Tomorrow picks itself.',
      actions: function (ctx) { return [phaseAction(ctx.phase)]; } },

    /* HC INTERPRETATION (5) */
    { kw: ['biggest leak', 'worst score', 'lowest score'],
      reply: function (ctx) {
        if (!ctx.hc) return 'No Health Check on file — once you run it, your weakest area surfaces here automatically.';
        return 'Your weakest topic is <strong>' + (ctx.hcLowest || 'unknown') + '</strong> at ' + (ctx.hcLowestScore != null ? ctx.hcLowestScore + '/100' : 'an answered score') + '. That\'s where the next 30 days pay back fastest.';
      },
      actions: function (ctx) { return ctx.hc ? [{ label: 'See your top-3 next moves', href: 'index.html', kind: 'open' }] : [{ label: 'Run the Health Check', href: '../health-check/index.html', kind: 'open' }]; } },

    { kw: ['health check', 'hc result', 'my hc', 'my score'],
      reply: function (ctx) {
        return ctx.hc ? 'You\'ve completed the HC. The leak strip on the Incubator root sorts by severity — biggest leak first.' : 'No Health Check on file yet. It\'s 12 minutes and personalises everything else.';
      },
      actions: function (ctx) { return ctx.hc ? [{ label: 'See your recommendations', href: 'index.html', kind: 'open' }] : [{ label: 'Run the Health Check', href: '../health-check/index.html', kind: 'open' }]; } },

    { kw: ['rerun', 're-run', 'do again', 'redo health'],
      reply: 'You can re-run the HC any time. The Incubator strip refreshes on the next page load — newest scores win.',
      actions: [{ label: 'Re-run the Health Check', href: '../health-check/index.html', kind: 'open' }] },

    { kw: ['leak estimate', 'money leak', 'how much', 'estimate'],
      reply: 'The HC shows a leak estimate based on what you reported. Honesty contract (#68): no fabricated numbers — only what you answered. The figure is a range, not a promise.',
      actions: [] },

    { kw: ['low score', 'i scored low', 'red flag'],
      reply: 'Low scores are good news — they\'re where the easiest wins live. Open the worst topic\'s recommended action and start there.',
      actions: [{ label: 'See your top-3 next moves', href: 'index.html', kind: 'open' }] },

    /* LESSON RECOMMENDATIONS (5) */
    { kw: ['which module', 'which lesson', 'recommend module', 'first lesson'],
      reply: 'Start with <strong>Core Principles</strong> — it\'s the lesson everything else compounds on. After that, pick the lesson that targets your weakest HC topic.',
      actions: [
        { label: 'Open Core Principles', href: '../business-os/quick-wins.html', kind: 'lesson' },
        { label: 'Browse all modules', href: '../business-os/tools.html', kind: 'open' }
      ] },

    { kw: ['core principles'],
      reply: 'Core Principles covers the fundamental lever: positioning. Read it slowly — most clients re-read after Diagnostics.',
      actions: [{ label: 'Open Core Principles', href: '../business-os/quick-wins.html', kind: 'lesson' }] },

    { kw: ['super sales', 'sales lesson', 'website conversion'],
      reply: 'Super Sales is the page-by-page audit — turn lookers into leads without paid traffic. Best after Core Principles.',
      actions: [{ label: 'Open Super Sales', href: '../business-os/quick-wins.html', kind: 'lesson' }] },

    { kw: ['referral', 'word of mouth'],
      reply: 'Referral Alchemy: turn one happy client into three. Cheapest distribution there is — and the only one that compounds.',
      actions: [{ label: 'Open Referral Alchemy', href: '../business-os/quick-wins.html', kind: 'lesson' }] },

    { kw: ['ops', 'sustainability', 'systems', 'delegate'],
      reply: 'Ops & Sustainability is the "you, but not in the room" lesson. Read it before you hire — most owners hire too early.',
      actions: [{ label: 'Open Ops & Sustainability', href: '../business-os/quick-wins.html', kind: 'lesson' }] },

    /* TALK TO A HUMAN (3) */
    { kw: ['talk to', 'human', 'real person', 'speak to', 'someone'],
      reply: 'Yes — easiest path is a 30-min strategy call. We\'ll walk through your live data and leave you with a costed plan, even if you don\'t hire us.',
      actions: [
        { label: 'WhatsApp us', href: 'https://wa.me/', kind: 'human' },
        { label: 'Email hello@milesymedia.co', href: 'mailto:hello@milesymedia.co', kind: 'human' }
      ] },

    { kw: ['call', 'phone', 'whatsapp'],
      reply: 'Tap the WhatsApp link below — your strategist will answer same-day during UK hours.',
      actions: [{ label: 'WhatsApp us', href: 'https://wa.me/', kind: 'human' }] },

    { kw: ['emergency', 'urgent', 'now'],
      reply: 'Real emergencies → WhatsApp your strategist directly. The portal is async; humans aren\'t.',
      actions: [{ label: 'WhatsApp us', href: 'https://wa.me/', kind: 'human' }] },

    /* META / DISCLAIMER (3) */
    { kw: ['are you ai', 'are you real', 'are you human', 'is this ai'],
      reply: 'I\'m a scripted companion right now — keyword-matched canned replies. Full AI (Claude) wires in once you upgrade to Pro / once T6 ships the API plumbing.',
      actions: [] },

    { kw: ['upgrade', 'pro', 'paid'],
      reply: 'Pro unlocks the full Claude-powered Aqua AI + the unlocked sidebar. Start the conversation via WhatsApp — pricing is per cohort.',
      actions: [{ label: 'WhatsApp us', href: 'https://wa.me/', kind: 'human' }] },

    { kw: ['hello', 'hi', 'hey'],
      reply: 'Hello. Ask me anything about your phase, your Health Check, or which lesson to open next.',
      actions: function (ctx) { return [{ label: 'What\'s my biggest leak?', href: '#ai:What\'s my biggest leak?', kind: 'open' }, { label: 'Which lesson should I open?', href: '#ai:Which lesson should I open first?', kind: 'open' }]; } }
  ];

  /* ─── Helpers ───────────────────────────────────────────── */
  function phaseAction(phaseId) {
    var map = {
      'epic-intro':    { label: 'Open Epic Intro',    href: 'phase-1-epic-intro.html' },
      'blueprint':     { label: 'Open Blueprint',     href: 'phase-2-blueprint.html' },
      'diagnostics':   { label: 'Open Diagnostics',   href: 'phase-3-diagnostics.html' },
      'brand-builder': { label: 'Open Brand Builder', href: 'phase-4-brand-builder.html' }
    };
    var a = map[phaseId] || map['epic-intro'];
    return { label: a.label, href: a.href, kind: 'phase' };
  }

  function probeContext() {
    var ctx = { hc: null, niche: 'agency', phase: 'epic-intro', phaseLabel: 'Epic Intro', mode: 'free', hcLowest: null, hcLowestScore: null };
    try {
      ctx.hc = JSON.parse(localStorage.getItem('bos.healthCheck') || 'null');
      var b = JSON.parse(localStorage.getItem('bos.brand') || 'null');
      var u = JSON.parse(localStorage.getItem('bos.user') || 'null');
      ctx.niche = (b && b.niche) || (u && u.niche) || 'agency';
      ctx.phase = localStorage.getItem('incubator.phase') || 'epic-intro';
      ctx.mode = localStorage.getItem('bos.mode') || 'free';
    } catch (e) {}
    var labels = { 'epic-intro':'Epic Intro','blueprint':'Blueprint Setup','diagnostics':'Diagnostics & Foundations','brand-builder':'Brand Builder' };
    ctx.phaseLabel = labels[ctx.phase] || 'Epic Intro';
    if (ctx.hc && Array.isArray(ctx.hc.topics)) {
      var answered = ctx.hc.topics.filter(function (t) { return t && typeof t.score === 'number'; }).slice().sort(function (a, b) { return a.score - b.score; });
      if (answered[0]) { ctx.hcLowest = answered[0].name; ctx.hcLowestScore = answered[0].score; }
    }
    return ctx;
  }

  var FALLBACK = {
    reply: 'I\'m a scripted companion right now — I might not have a canned answer for that. Try asking about your phase, your Health Check, or which lesson to open next. (Real AI lands when you upgrade.)',
    actions: function (ctx) {
      return [
        { label: 'What\'s my biggest leak?', href: '#ai:What\'s my biggest leak?', kind: 'open' },
        { label: 'What should I do today?',   href: '#ai:What should I do today?',  kind: 'open' },
        { label: 'Talk to a human',           href: 'https://wa.me/',                kind: 'human' }
      ];
    }
  };

  function respondTo(message, ctx) {
    ctx = ctx || probeContext();
    var msg = String(message || '').toLowerCase();
    var hit = REPLIES.find(function (r) { return r.kw.some(function (k) { return msg.indexOf(k) !== -1; }); });
    var entry = hit || FALLBACK;
    var reply = typeof entry.reply === 'function' ? entry.reply(ctx) : entry.reply;
    var actions = typeof entry.actions === 'function' ? entry.actions(ctx) : (entry.actions || []);
    return { reply: reply, suggestedActions: actions };
  }

  window.AquaAI = {
    respondTo: respondTo,
    context: probeContext,
    disclaimer: 'Aqua AI is currently scripted — full AI lands when you upgrade to Pro.',
    starters: [
      'What\'s my biggest leak?',
      'Which lesson should I open first?',
      'What phase am I on?',
      'I\'m stuck — what now?',
      'Talk to a human'
    ],
    REPLIES: REPLIES
  };
})();
