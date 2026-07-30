/* AquaAI prompt library — visible preset prompts (R023).
   6 categories × ~5 prompts. Loaded before aqua-ai-ui.js so the
   empty state can render category chips + drill-down. */
(function () {
  var CATEGORIES = [
    {
      id: 'phase', label: 'Phase help', icon: '🏛',
      prompts: [
        { text: 'What phase am I on?',                                   kind: 'phase.where' },
        { text: 'How do I advance to the next phase?',                   kind: 'phase.advance' },
        { text: 'How long does Blueprint usually take?',                 kind: 'phase.duration' },
        { text: 'What happens in Diagnostics?',                          kind: 'phase.diagnostics' },
        { text: 'When do I get my Live custom portal?',                  kind: 'phase.live-portal' }
      ]
    },
    {
      id: 'strategy', label: 'Strategy', icon: '🎯',
      prompts: [
        { text: 'What\'s my biggest leak right now?',                    kind: 'strategy.biggest-leak' },
        { text: 'What should I do this week?',                           kind: 'strategy.this-week' },
        { text: 'What\'s the cheapest win for me?',                      kind: 'strategy.cheap-win' },
        { text: 'How do I price my flagship offer?',                     kind: 'strategy.pricing' },
        { text: 'I\'m channel-dependent. What now?',                     kind: 'strategy.channel-dep' }
      ]
    },
    {
      id: 'lessons', label: 'Lessons', icon: '📚',
      prompts: [
        { text: 'Which lesson should I open first?',                     kind: 'lessons.first' },
        { text: 'Tell me about Core Principles',                         kind: 'lessons.core-principles' },
        { text: 'How does Super Sales work?',                            kind: 'lessons.super-sales' },
        { text: 'What\'s in the Referral lesson?',                       kind: 'lessons.referral' },
        { text: 'Recommend a lesson based on my Health Check',           kind: 'lessons.recommend-hc' }
      ]
    },
    {
      id: 'marketing', label: 'Marketing', icon: '📣',
      prompts: [
        { text: 'How do I claim my Google Business Profile?',            kind: 'marketing.gbp' },
        { text: 'My website isn\'t converting — what changes first?',    kind: 'marketing.conversion' },
        { text: 'How do I grow without paid ads?',                       kind: 'marketing.organic' },
        { text: 'What\'s a referral system that actually works?',        kind: 'marketing.referral-system' }
      ]
    },
    {
      id: 'ops', label: 'Operations', icon: '⚙️',
      prompts: [
        { text: 'How do I document my sales process?',                   kind: 'ops.sops' },
        { text: 'Which 5 KPIs should I track weekly?',                   kind: 'ops.kpis' },
        { text: 'What workflows break first as I grow?',                 kind: 'ops.workflows' },
        { text: 'What add-ons should I install first?',                  kind: 'ops.addons' },
        { text: 'How do I stop being the bottleneck?',                   kind: 'ops.bottleneck' }
      ]
    },
    {
      id: 'stuck', label: "I'm stuck", icon: '🆘',
      prompts: [
        { text: 'I\'m stuck — what now?',                                kind: 'stuck.now' },
        { text: 'I feel overwhelmed.',                                   kind: 'stuck.overwhelmed' },
        { text: 'Where do I even start?',                                kind: 'stuck.start' },
        { text: 'Talk to a human, please.',                              kind: 'stuck.human' }
      ]
    }
  ];

  function all() {
    return CATEGORIES.reduce(function (acc, c) {
      c.prompts.forEach(function (p) { acc.push(Object.assign({ category: c.id }, p)); });
      return acc;
    }, []);
  }

  window.AquaAIPrompts = {
    CATEGORIES: CATEGORIES,
    all: all,
    byCategory: function (id) {
      var c = CATEGORIES.filter(function (c) { return c.id === id; })[0];
      return c ? c.prompts : [];
    }
  };
})();
