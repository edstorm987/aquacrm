/* AquaAI — scripted companion (no API). Single source of truth for the
   replies + suggested actions mounted by Business OS.

   Public:
     window.AquaAI.respondTo(message, context?) → { reply, suggestedActions[] }
     window.AquaAI.disclaimer  // string shown by surfaces
     window.AquaAI.starters    // array of suggested opening prompts
     window.AquaAI.context()   // best-effort context probe (hc, niche, phase, page)

   `suggestedActions[i] = { label, href, kind?: 'lesson'|'phase'|'human'|'open' }`. */

(function () {

  var BOS_HOME = '/business-os/app.html';
  var BOS_TOOLS = '/business-os/tools.html';
  var BOS_QUICK_WINS = '/business-os/quick-wins.html';
  var BOS_DIAGNOSTIC = '/business-os/diagnostic.html';
  var HEALTH_CHECK = '/health-check';
  var SUPPORT_WHATSAPP = 'https://wa.me/447707020250';

  /* ─── Canonical replies — 35 patterns ─────────────────────────────
     Each entry: keywords (lowercase substrings, OR-matched), reply
     (function or string), suggestedActions (function or array). The
     function form receives ctx; static form ignores it. */
  var REPLIES = [

    /* PHASE QUESTIONS (10) */
    { kw: ['what phase', 'which phase', 'current phase', 'phase am i'],
      reply: 'The public Business OS now uses one simple path: Health Check → Quick Wins → ask Milesymedia for help when you want it. The old gated phase pages have been retired.',
      actions: function (ctx) { return [phaseAction(ctx.phase)]; } },

    { kw: ['epic intro', 'intro phase', 'orientation'],
      reply: 'Epic Intro has been replaced by the Business OS home. Start there for the current path and your next move.',
      actions: [{ label: 'Open Business OS home', href: BOS_HOME, kind: 'open' }] },

    { kw: ['blueprint phase', 'blueprint setup', 'foundation phase'],
      reply: 'Blueprint Setup is no longer a separate public phase. Use Quick Wins for the current practical guidance.',
      actions: [{ label: 'Open Quick Wins', href: BOS_QUICK_WINS, kind: 'lesson' }] },

    { kw: ['diagnostics phase', 'health check phase'],
      reply: 'Diagnostics is where the Health Check + the strategy review session land. Honest mirror — what\'s actually leaking.',
      actions: [
        { label: 'Open My Diagnostic', href: BOS_DIAGNOSTIC, kind: 'open' },
        { label: 'Run the Health Check', href: HEALTH_CHECK, kind: 'open' }
      ] },

    { kw: ['brand builder', 'brand phase'],
      reply: 'Brand Builder is no longer a separate public phase. Browse the current Business OS tools or talk to Milesymedia about hands-on brand work.',
      actions: [{ label: 'Browse current tools', href: BOS_TOOLS, kind: 'open' }] },

    { kw: ['advance', 'next phase', 'finish phase', 'move to next'],
      reply: 'The old gated phases have been retired. Your current path is Health Check → Quick Wins → ask Milesymedia for help when you want it.',
      actions: function (ctx) { return [phaseAction(ctx.phase)]; } },

    { kw: ['live portal', 'custom portal', 'when do i get'],
      reply: 'Client portals are handled through the current Client Centre and your Milesymedia relationship. Open the Client Centre for sign-in, recovery and support routes.',
      actions: [{ label: 'Open the Client Centre', href: '/client-centre', kind: 'open' }] },

    { kw: ['skip phase'],
      reply: 'There are no longer gated public phases to skip. You can move between the Health Check, Quick Wins and your diagnostic whenever you need.',
      actions: function (ctx) { return [phaseAction(ctx.phase)]; } },

    { kw: ['how long', 'how many weeks', 'duration'],
      reply: 'The Health Check takes about 12 minutes. Quick Wins are short and self-paced; hands-on client work is scoped with Milesymedia directly.',
      actions: [{ label: 'Run the Health Check', href: HEALTH_CHECK, kind: 'open' }] },

    { kw: ['phase order', 'phase sequence'],
      reply: 'The current order is simple: run the Health Check, review your diagnostic, then use Quick Wins. Contact Milesymedia when you want the work handled for you.',
      actions: [{ label: 'Open Business OS home', href: BOS_HOME, kind: 'open' }] },

    /* STUCK (3) */
    { kw: ['stuck', 'frozen', 'i don\'t know', 'don\'t know what', 'help me'],
      reply: 'Most “stuck” moments have one of two next moves: run the Health Check if you have not done it, or open Quick Wins for the weakest area it found.',
      actions: [
        { label: 'Run the Health Check', href: HEALTH_CHECK, kind: 'open' },
        { label: 'Open Business OS home', href: BOS_HOME, kind: 'open' },
        { label: 'Open Core Principles', href: BOS_QUICK_WINS, kind: 'lesson' }
      ] },

    { kw: ['overwhelmed', 'too much'],
      reply: 'It\'s a lot on purpose — but you only do one thing at a time. Pick the smallest box you can tick today; don\'t plan the week.',
      actions: function (ctx) { return [phaseAction(ctx.phase)]; } },

    { kw: ['where to start', 'start here', 'first step', 'beginning'],
      reply: 'Start with the Health Check — it takes 12 minutes and lights up the rest of the portal with what you actually need.',
      actions: [{ label: 'Run the Health Check', href: HEALTH_CHECK, kind: 'open' }] },

    /* WHAT NEXT (3) */
    { kw: ['what next', 'whats next', 'next move', 'next action'],
      reply: function (ctx) {
        if (!ctx.hc) return 'No Health Check on file yet — that\'s the next move. It calibrates the rest.';
        if (ctx.hcLowest) return 'Based on your HC, your weakest area is <strong>' + ctx.hcLowest + '</strong>. Open Business OS home for the current next move.';
        return 'Open Business OS home for your current Health Check-driven next move.';
      },
      actions: function (ctx) {
        if (!ctx.hc) return [{ label: 'Run the Health Check', href: HEALTH_CHECK, kind: 'open' }];
        return [{ label: 'See your recommendations', href: BOS_HOME, kind: 'open' }];
      } },

    { kw: ['done with', 'finished my'],
      reply: 'Nice. Keep going in Quick Wins, or return to the tools page for the other live options.',
      actions: [{ label: 'Browse current tools', href: BOS_TOOLS, kind: 'open' }] },

    { kw: ['what should i do today', 'today'],
      reply: 'One thing today: run the Health Check if it is unfinished, otherwise open Quick Wins and act on your weakest area.',
      actions: function (ctx) { return [phaseAction(ctx.phase)]; } },

    /* HC INTERPRETATION (5) */
    { kw: ['biggest leak', 'worst score', 'lowest score'],
      reply: function (ctx) {
        if (!ctx.hc) return 'No Health Check on file — once you run it, your weakest area surfaces here automatically.';
        return 'Your weakest topic is <strong>' + (ctx.hcLowest || 'unknown') + '</strong> at ' + (ctx.hcLowestScore != null ? ctx.hcLowestScore + '/100' : 'an answered score') + '. That\'s where the next 30 days pay back fastest.';
      },
      actions: function (ctx) { return ctx.hc ? [{ label: 'See your top-3 next moves', href: BOS_HOME, kind: 'open' }] : [{ label: 'Run the Health Check', href: HEALTH_CHECK, kind: 'open' }]; } },

    { kw: ['health check', 'hc result', 'my hc', 'my score'],
      reply: function (ctx) {
        return ctx.hc ? 'You\'ve completed the HC. Open My Diagnostic to review the saved result, then use Quick Wins for the next move.' : 'No Health Check on file yet. It\'s 12 minutes and personalises everything else.';
      },
      actions: function (ctx) { return ctx.hc ? [{ label: 'See your recommendations', href: BOS_HOME, kind: 'open' }] : [{ label: 'Run the Health Check', href: HEALTH_CHECK, kind: 'open' }]; } },

    { kw: ['rerun', 're-run', 'do again', 'redo health'],
      reply: 'You can re-run the HC any time. Business OS uses the latest saved result on the next page load.',
      actions: [{ label: 'Re-run the Health Check', href: HEALTH_CHECK, kind: 'open' }] },

    { kw: ['leak estimate', 'money leak', 'how much', 'estimate'],
      reply: 'The HC shows a leak estimate based on what you reported. Honesty contract (#68): no fabricated numbers — only what you answered. The figure is a range, not a promise.',
      actions: [] },

    { kw: ['low score', 'i scored low', 'red flag'],
      reply: 'Low scores are good news — they\'re where the easiest wins live. Open the worst topic\'s recommended action and start there.',
      actions: [{ label: 'See your top-3 next moves', href: BOS_HOME, kind: 'open' }] },

    /* LESSON RECOMMENDATIONS (5) */
    { kw: ['which module', 'which lesson', 'recommend module', 'first lesson'],
      reply: 'Start with <strong>Core Principles</strong> — it\'s the lesson everything else compounds on. After that, pick the lesson that targets your weakest HC topic.',
      actions: [
        { label: 'Open Core Principles', href: BOS_QUICK_WINS, kind: 'lesson' },
        { label: 'Browse current tools', href: BOS_TOOLS, kind: 'open' }
      ] },

    { kw: ['core principles'],
      reply: 'Core Principles covers the fundamental lever: positioning. Read it slowly — most clients re-read after Diagnostics.',
      actions: [{ label: 'Open Core Principles', href: BOS_QUICK_WINS, kind: 'lesson' }] },

    { kw: ['super sales', 'sales lesson', 'website conversion'],
      reply: 'Super Sales is the page-by-page audit — turn lookers into leads without paid traffic. Best after Core Principles.',
      actions: [{ label: 'Open Super Sales', href: BOS_QUICK_WINS, kind: 'lesson' }] },

    { kw: ['referral', 'word of mouth'],
      reply: 'Referral Alchemy: turn one happy client into three. Cheapest distribution there is — and the only one that compounds.',
      actions: [{ label: 'Open Referral Alchemy', href: BOS_QUICK_WINS, kind: 'lesson' }] },

    { kw: ['ops', 'sustainability', 'systems', 'delegate'],
      reply: 'Ops & Sustainability is the "you, but not in the room" lesson. Read it before you hire — most owners hire too early.',
      actions: [{ label: 'Open Ops & Sustainability', href: BOS_QUICK_WINS, kind: 'lesson' }] },

    /* TALK TO A HUMAN (3) */
    { kw: ['talk to', 'human', 'real person', 'speak to', 'someone'],
      reply: 'Yes — easiest path is a 30-min strategy call. We\'ll walk through your live data and leave you with a costed plan, even if you don\'t hire us.',
      actions: [
        { label: 'WhatsApp us', href: SUPPORT_WHATSAPP, kind: 'human' },
        { label: 'Email hello@milesymedia.co', href: 'mailto:hello@milesymedia.co', kind: 'human' }
      ] },

    { kw: ['call', 'phone', 'whatsapp'],
      reply: 'Tap the WhatsApp link below — your strategist will answer same-day during UK hours.',
      actions: [{ label: 'WhatsApp us', href: SUPPORT_WHATSAPP, kind: 'human' }] },

    { kw: ['emergency', 'urgent', 'now'],
      reply: 'Real emergencies → WhatsApp your strategist directly. The portal is async; humans aren\'t.',
      actions: [{ label: 'WhatsApp us', href: SUPPORT_WHATSAPP, kind: 'human' }] },

    /* META / DISCLAIMER (3) */
    { kw: ['are you ai', 'are you real', 'are you human', 'is this ai'],
      reply: 'I\'m a scripted companion right now — keyword-matched canned replies. Full AI (Claude) wires in once you upgrade to Pro / once T6 ships the API plumbing.',
      actions: [] },

    { kw: ['upgrade', 'pro', 'paid'],
      reply: 'Pro unlocks the full Claude-powered Aqua AI + the unlocked sidebar. Start the conversation via WhatsApp — pricing is per cohort.',
      actions: [{ label: 'WhatsApp us', href: SUPPORT_WHATSAPP, kind: 'human' }] },

    { kw: ['hello', 'hi', 'hey'],
      reply: 'Hello. Ask me anything about your phase, your Health Check, or which lesson to open next.',
      actions: function (ctx) { return [{ label: 'What\'s my biggest leak?', href: '#ai:What\'s my biggest leak?', kind: 'open' }, { label: 'Which lesson should I open?', href: '#ai:Which lesson should I open first?', kind: 'open' }]; } }
  ];

  /* ─── Helpers ───────────────────────────────────────────── */
  function phaseAction(phaseId) {
    var map = {
      'epic-intro':    { label: 'Open Business OS home', href: BOS_HOME },
      'blueprint':     { label: 'Open Quick Wins',       href: BOS_QUICK_WINS },
      'diagnostics':   { label: 'Open My Diagnostic',    href: BOS_DIAGNOSTIC },
      'brand-builder': { label: 'Browse current tools',  href: BOS_TOOLS }
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
        { label: 'Talk to a human',           href: SUPPORT_WHATSAPP,                kind: 'human' }
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
