// T4 R008 — default HC question pack, hand-ported from
// `public/health-check/hc-questions.js` (the static app's source of
// truth). Once parity is signed off, the static JS file retires and
// this module becomes the canonical pack. Per-niche-agency packs
// (Phase 12 R3) will return objects of this same shape.

import type { HCArea, HCPack } from "./types";

const seo: HCArea = {
  id: "seo",
  name: "Visibility & Search",
  icon: "⌕",
  blurb: "Can the right people find you when they go looking?",
  tiers: {
    beginner: {
      label: "Just show me", time: "~3 min",
      summary: "No jargon. Two mini-experiments using Google.",
      exercise: [
        { type: "task", title: "Mini-experiment #1 — the pub test",
          body: 'Search <strong>"pub near me"</strong> in the panel above. Scan it for a few seconds — notice where your eyes land — then mark done.',
          stickyEmbed: { kind: "search", query: "pub near me" }, done: "Done — I looked" },
        { type: "choice", prompt: "Where did your eyes go first?", scoring: false,
          stickyEmbed: { kind: "search", query: "pub near me" },
          options: [
            { label: "The top result", score: 0 },
            { label: "The map / places box", score: 0 },
            { label: "The 2nd or 3rd link", score: 0 },
            { label: "I scrolled past page one", score: 0 } ] },
        { type: "reveal", title: "Now imagine your customer doing exactly that.",
          body: "~75% of clicks go to the top three results. Less than 1% reach page two. Whatever you just felt looking for a pub, your customer feels looking for you.",
          stickyEmbed: { kind: "search", query: "pub near me" } },
        { type: "task", title: "Mini-experiment #2 — your turn",
          body: "Type <strong>what you sell + your town</strong> into the search bar above. Don't scroll yet — just look.",
          stickyEmbed: { kind: "search", editable: true, placeholder: "e.g. plumber Bristol", queryFromUser: true },
          done: "Done — I looked" },
        { type: "choice", prompt: "Where did YOU appear?",
          stickyEmbed: { kind: "search", editable: true, queryFromUser: true },
          options: [
            { label: "Top of the page — easy to find", score: 90 },
            { label: "On the page somewhere — had to look", score: 60 },
            { label: "Page 2 or further", score: 30 },
            { label: "I couldn't see myself at all", score: 10 } ] },
        { type: "text", prompt: "What would you Google to find a business like yours?",
          body: "Even just two or three phrases. (We'll use these to build your real keyword list — your customer's vocabulary, not ours.)",
          skipIf: { rawAt: 4, neq: 3 } },
        { type: "lever-calc", prompt: "So what could that be costing you?",
          body: "These are <strong>your</strong> numbers — your typical customer value, your guess at how many extra enquiries ranking first would bring you in a year. We just multiply.",
          ltvDefault: 1000, enqDefault: 10 },
        { type: "mental-note", tag: "seo", prompt: "Quick gut check.",
          body: "There's no judgement here — just a note for you (and for us, when we look at your answers).",
          label: "Yes — being invisible in search is probably costing me money." },
        { type: "choice", prompt: "Do you have a Google Business Profile?",
          options: [
            { label: "Yes — and I keep it updated", score: 90, tag: "gmb-good" },
            { label: "Yes — but I never touch it", score: 50, tag: "gmb-stale" },
            { label: "No / I'm not sure", score: 15, tag: "gmb-missing" } ] },
        { type: "mental-note", tag: "gmb-claim", prompt: "Quick one.",
          label: "Yes — I'd like to claim my Google Business Profile (free, ~15 min, big lever).",
          skipIf: { rawAt: 8, neq: 2 } }
      ]
    },
    intermediate: {
      label: "I dabble", time: "~4 min", summary: "Targeted checks. Light jargon.",
      exercise: [
        { type: "choice", prompt: "How many search terms do you actively want to rank for?",
          options: [
            { label: "A clear list — 5+ priority terms", score: 85 },
            { label: "A vague idea", score: 55 },
            { label: "None — never thought about it", score: 20 } ] },
        { type: "choice", prompt: "When did you last check your Google ranking?",
          options: [
            { label: "This week", score: 90 },
            { label: "This month", score: 70 },
            { label: "This year", score: 40 },
            { label: "Never", score: 10 } ] },
        { type: "choice", prompt: "Do you have a Google Business Profile, claimed and active?",
          options: [
            { label: "Yes — kept up to date", score: 95, tag: "gmb-good" },
            { label: "Yes — but neglected", score: 55, tag: "gmb-stale" },
            { label: "No / not sure", score: 15, tag: "gmb-missing" } ] },
        { type: "multi", prompt: "Done in the last 90 days? (pick any)",
          options: [
            { label: "Posted to Google Business Profile", score: 20 },
            { label: "Got a new review", score: 25 },
            { label: "Added a page targeting a search term", score: 25 },
            { label: "None of these", score: -50 } ] }
      ]
    },
    professional: {
      label: "Run the audit", time: "~5 min",
      summary: "Paste your URL. Live read on visibility, indexing, on-page signal.",
      exercise: [
        { type: "url", prompt: "Your website URL",
          body: "We'll use this to simulate a visibility scan. (Real audit endpoint coming next round.)",
          placeholder: "https://yourbusiness.co.uk" },
        { type: "reveal", title: "Sample scan output",
          body: '<div class="hc-mock-scan"><div><span>Indexed pages</span><strong>12</strong></div><div><span>Mobile speed</span><strong>62</strong></div><div><span>Title tag coverage</span><strong>8 / 12</strong></div><div><span>Schema markup</span><strong>None detected</strong></div><div><span>Estimated keywords ranking top-10</span><strong>3</strong></div></div>' },
        { type: "choice", prompt: "Of those indexed pages, how many target a specific search intent?",
          options: [
            { label: "Most of them", score: 85 },
            { label: "A handful", score: 55 },
            { label: 'None — they\'re all "about us" / "services"', score: 20 } ] },
        { type: "choice", prompt: "Search Console review cadence?",
          options: [
            { label: "Weekly with documented actions", score: 95 },
            { label: "Monthly glance", score: 60 },
            { label: "I don't use it", score: 15 } ] }
      ]
    }
  }
};

const site: HCArea = {
  id: "site", name: "Your Website", icon: "◎",
  blurb: "When someone lands on you for the first time, do they stay?",
  tiers: {
    beginner: {
      label: "Just show me", time: "~3 min", summary: "A 5-second test of your own site.",
      exercise: [
        { type: "choice", prompt: "First — do you actually have a website?", scoring: false,
          options: [
            { label: "Yes — it's live", score: 0, tag: "site-yes" },
            { label: "Building one / it's halfway", score: 0, tag: "site-wip" },
            { label: "No — we don't have one", score: 0, tag: "site-no" } ] },
        { type: "task", title: "The 5-second test",
          body: "Drop your homepage URL below. We'll show it for <strong>5 seconds</strong>, then dim it — answer based on your first impression only.",
          embed: { kind: "site", editable: true, placeholder: "https://yourbusiness.co.uk", timer: 5 },
          done: "Done", skipIf: { rawAt: 0, neq: 0 } },
        { type: "choice", prompt: "In one breath — could a stranger tell what you sell?",
          skipIf: { rawAt: 0, neq: 0 },
          options: [
            { label: "Yes, instantly", score: 90 },
            { label: "Probably, with a squint", score: 55 },
            { label: "No — they'd have to read", score: 25 },
            { label: "No idea", score: 10 } ] },
        { type: "choice", prompt: "Was the next thing to do (call, book, buy) obvious?",
          skipIf: { rawAt: 0, neq: 0 },
          options: [
            { label: "Big button, hard to miss", score: 90, tag: "cta-clear" },
            { label: "Somewhere — they'd find it", score: 55, tag: "cta-weak" },
            { label: "Honestly no", score: 20, tag: "cta-missing" } ] },
        { type: "choice", prompt: "Did the site feel trustworthy?", skipIf: { rawAt: 0, neq: 0 },
          options: [
            { label: "Yes — looks current", score: 85 },
            { label: "Bit dated but OK", score: 55, tag: "site-dated" },
            { label: "It looks neglected", score: 25, tag: "site-dated" } ] },
        { type: "reveal", title: "OK — that's actually the most common starting point.",
          body: "There's no judgement here. We'll skip the on-site critique and look at what a website would be worth to you instead.",
          skipIf: { rawAt: 0, neq: 2 } },
        { type: "lever-calc", prompt: "What might not having one be costing you?",
          body: "If a website brought in just a couple of extra enquiries a month, what would that be worth across a year? <strong>Your numbers.</strong>",
          ltvDefault: 1000, enqDefault: 24, skipIf: { rawAt: 0, neq: 2 } },
        { type: "mental-note", tag: "site-missing", prompt: "Gut check.",
          label: "Yes — not having a website is probably losing me trust and leads.",
          skipIf: { rawAt: 0, neq: 2 } },
        { type: "choice", prompt: "What's the actual blocker to finishing it?", scoring: false,
          skipIf: { rawAt: 0, neq: 1 },
          options: [
            { label: "I don't know what to write / what it should say", score: 0, tag: "site-wip-copy" },
            { label: "Time — the half-built version's been there for months", score: 0, tag: "site-wip-time" },
            { label: "I'm stuck on design / look-and-feel", score: 0, tag: "site-wip-design" },
            { label: "I'm waiting on someone else (dev / agency)", score: 0, tag: "site-wip-dep" } ] },
        { type: "mental-note", tag: "site-wip", prompt: "Gut check.",
          label: "Yes — every month it stays half-built is a month I'm not getting found.",
          skipIf: { rawAt: 0, neq: 1 } }
      ]
    },
    intermediate: {
      label: "I dabble", time: "~3 min", summary: "Quick targeted checks on conversion.",
      exercise: [
        { type: "choice", prompt: "When did you last test something on your site?",
          options: [
            { label: "This month", score: 90 }, { label: "This year", score: 60 },
            { label: "Never", score: 20 } ] },
        { type: "choice", prompt: "Is your homepage hero benefit-led or feature-led?",
          options: [
            { label: "Benefit, with proof", score: 90 },
            { label: "A mix", score: 60 },
            { label: 'Mostly features / "welcome" copy', score: 30, tag: "hero-weak" } ] },
        { type: "slider", prompt: "Rate your site's mobile experience",
          min: 0, max: 100, value: 50, suffix: "/100" }
      ]
    },
    professional: {
      label: "Run the audit", time: "~5 min", summary: "Mock Lighthouse-style read of your site.",
      exercise: [
        { type: "url", prompt: "Your website URL", placeholder: "https://yourbusiness.co.uk" },
        { type: "reveal", title: "Sample Lighthouse-style read",
          body: '<div class="hc-mock-scan"><div><span>Performance</span><strong>62</strong></div><div><span>Accessibility</span><strong>78</strong></div><div><span>SEO</span><strong>71</strong></div><div><span>Best practices</span><strong>83</strong></div><div><span>LCP</span><strong>3.4s</strong></div><div><span>CLS</span><strong>0.18</strong></div></div>' },
        { type: "choice", prompt: "Conversion events instrumented?",
          options: [
            { label: "Yes — server-side", score: 95 },
            { label: "Yes — GA / pixel only", score: 70 },
            { label: "No", score: 15 } ] }
      ]
    }
  }
};

const flow: HCArea = {
  id: "flow", name: "Where Customers Come From", icon: "↗",
  blurb: "If your biggest source dried up tomorrow, how long do you last?",
  tiers: {
    beginner: {
      label: "Just show me", time: "~2 min", summary: "Three sliders. Brutal honesty time.",
      exercise: [
        { type: "slider", prompt: "What % of last month's customers were word-of-mouth or repeat?", min: 0, max: 100, value: 50, suffix: "%" },
        { type: "slider", prompt: "What % came from one specific channel?", min: 0, max: 100, value: 50, suffix: "%" },
        { type: "choice", prompt: "If that biggest source stopped tomorrow, how long until it hurts?",
          options: [
            { label: "A few months — we'd be fine", score: 85 },
            { label: "A month or so", score: 55 },
            { label: "Within weeks", score: 30, tag: "channel-fragile" },
            { label: "Honestly… immediately", score: 10, tag: "channel-fragile" } ] },
        { type: "choice", prompt: "When was your last new enquiry that wasn't a referral or repeat?",
          options: [
            { label: "This week", score: 90 },
            { label: "This month", score: 60 },
            { label: "This year", score: 30, tag: "cold-pipe-empty" },
            { label: "Can't remember", score: 10, tag: "cold-pipe-empty" } ] }
      ]
    },
    intermediate: {
      label: "I dabble", time: "~3 min", summary: "Channel-by-channel breakdown.",
      exercise: [
        { type: "multi", prompt: "Which channels currently bring in customers?",
          options: [
            { label: "Search (Google)", score: 20 },
            { label: "Word of mouth", score: 10 },
            { label: "Paid ads", score: 20 },
            { label: "Social organic", score: 15 },
            { label: "Email / SMS", score: 15 },
            { label: "Partnerships", score: 10 } ] },
        { type: "choice", prompt: "Do you know your cost per new customer?",
          options: [
            { label: "Yes — to the pound", score: 95 },
            { label: "Roughly", score: 60 },
            { label: "No", score: 15 } ] }
      ]
    },
    professional: {
      label: "Run the audit", time: "~5 min", summary: "Channel concentration + payback period.",
      exercise: [
        { type: "slider", prompt: "Top channel concentration (% of revenue)", min: 0, max: 100, value: 70, suffix: "%" },
        { type: "choice", prompt: "Payback period documented?",
          options: [
            { label: "Yes — segmented by channel", score: 95 },
            { label: "Yes — overall only", score: 65 },
            { label: "No", score: 20 } ] }
      ]
    }
  }
};

const business: HCArea = {
  id: "business", name: "My Business", icon: "✪",
  blurb: "The bits only you know — your offer, your fans, your unfair advantage.",
  tiers: {
    beginner: {
      label: "Just show me", time: "~3 min", summary: "Tell us about your offer in plain words.",
      exercise: [
        { type: "choice", prompt: 'Do you have a clear "best seller" or flagship offer?',
          options: [
            { label: "Yes — and I push it", score: 90 },
            { label: "Yes — but I don't lead with it", score: 60, tag: "hero-product-hidden" },
            { label: "No — we sell everything equally", score: 30, tag: "no-hero-product" } ] },
        { type: "url", prompt: "Got a link to your highest-value offer? (optional)",
          body: "Helps us see exactly what your customers see. Skip if you'd rather.",
          placeholder: "https://yourbusiness.co.uk/your-best-seller", optional: true },
        { type: "choice", prompt: "Do you actively encourage referrals?",
          options: [
            { label: "Yes — there's a system", score: 90 },
            { label: "Sort of — when I remember", score: 55, tag: "referrals-passive" },
            { label: "No — it's blind faith", score: 20, tag: "referrals-blind" } ] },
        { type: "choice", prompt: "Do you go an extraordinary mile for customers?",
          options: [
            { label: "Always — it's our thing", score: 90, tag: "extra-mile-strong" },
            { label: "Sometimes", score: 55 },
            { label: "We do the job and that's it", score: 25 } ] },
        { type: "text", prompt: "In one sentence — why do customers pick you over a competitor?", optional: true }
      ]
    },
    intermediate: {
      label: "I dabble", time: "~3 min", summary: "Sharper offer questions.",
      exercise: [
        { type: "choice", prompt: "Is your highest-margin offer also your most marketed?",
          options: [
            { label: "Yes — deliberately", score: 90 },
            { label: "No — we lead with the cheap one", score: 30, tag: "wrong-front-door" } ] },
        { type: "choice", prompt: "Do you have testimonials or case studies on the highest-value offer specifically?",
          options: [
            { label: "Multiple, recent", score: 90 },
            { label: "A couple, old", score: 55 },
            { label: "None", score: 20, tag: "no-social-proof" } ] }
      ]
    },
    professional: {
      label: "Run the audit", time: "~4 min", summary: "Offer architecture + referral mechanics.",
      exercise: [
        { type: "choice", prompt: "Is there a documented referral mechanism (incentive, ask, tracking)?",
          options: [
            { label: "Yes — all three", score: 95 },
            { label: "One of three", score: 60 },
            { label: "None", score: 15, tag: "referrals-blind" } ] },
        { type: "choice", prompt: "Do you tier customers (best vs everyone) for retention attention?",
          options: [
            { label: "Yes", score: 90 },
            { label: "No", score: 30 } ] }
      ]
    }
  }
};

const retain: HCArea = {
  id: "retain", name: "Keeping Them", icon: "✉",
  blurb: "Once someone buys once, what happens next?",
  tiers: {
    beginner: {
      label: "Just show me", time: "~2 min", summary: "Two simple questions.",
      exercise: [
        { type: "choice", prompt: "After someone buys, what do you send them?",
          options: [
            { label: "A friendly thank-you and a follow-up later", score: 85 },
            { label: "A receipt — that's it", score: 40, tag: "no-followup" },
            { label: "Nothing", score: 15, tag: "no-followup" } ] },
        { type: "choice", prompt: "How often does a past customer hear from you?",
          options: [
            { label: "Regularly — emails or messages", score: 85 },
            { label: "Now and then", score: 55 },
            { label: "Only if I bump into them", score: 20, tag: "no-lifecycle" } ] }
      ]
    },
    intermediate: {
      label: "I dabble", time: "~3 min", summary: "Email/SMS basics.",
      exercise: [
        { type: "choice", prompt: "Do you have an active mailing list?",
          options: [
            { label: "Yes — segmented", score: 90 },
            { label: "Yes — flat", score: 55 },
            { label: "No", score: 15, tag: "no-list" } ] },
        { type: "choice", prompt: "Welcome flow when someone signs up?",
          options: [
            { label: "Yes — multi-step", score: 90 },
            { label: "A single welcome email", score: 60 },
            { label: "Nothing", score: 15, tag: "no-welcome" } ] }
      ]
    },
    professional: {
      label: "Run the audit", time: "~4 min", summary: "Lifecycle revenue share + flow coverage.",
      exercise: [
        { type: "slider", prompt: "% of revenue from email / SMS today?", min: 0, max: 60, value: 10, suffix: "%" },
        { type: "multi", prompt: "Which flows are live?",
          options: [
            { label: "Welcome", score: 20 },
            { label: "Browse abandon", score: 20 },
            { label: "Cart / enquiry abandon", score: 25 },
            { label: "Post-purchase", score: 20 },
            { label: "Win-back", score: 15 } ] }
      ]
    }
  }
};

export const defaultPack: HCPack = { areas: [seo, site, flow, business, retain] };
