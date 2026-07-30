# Health Check — delivery plan

The Health Check (this app) is the front door of the Milesy funnel. To ship cleanly we need to know exactly what "done" means at each layer.

---

## Phase 1 — UX (this week)

- [x] 5 topics × 3 tiers shipped, each with a real exercise script.
- [x] Persistent floating action row (Call us / Skip to results / Skip topic).
- [x] Money-mirror dashboard with leak cards, per-topic scores, action-rich quick wins, section navigator.
- [x] End-of-flow gift card → BOS signup with `?source=healthcheck`.
- [x] Cross-port rewrite for dev (`:3033` → `:3034`).
- [x] HC summary persisted to `bos.healthCheck` + XP + achievement grant.
- [ ] **Mobile pass** — every step usable single-handed, no horizontal scroll, no hidden CTAs.
- [ ] Replace the "Pub test" placeholder copy with the final question script after Ed's review.
- [ ] Add a tiny progress indicator on the gift card showing what they're claiming (e.g. "+250 XP, +8h time saved, Self-aware achievement").

## Phase 2 — Content (next 2 weeks)

- [ ] Final 6 questions per topic, copy-edited for tone and grade level.
- [ ] Niche-tailored question variants (Therapist / Roofer / Salon etc.) — the quickest win is 1 niche-specific question per topic.
- [ ] Real quick-win blog URLs (right now they all 404 to `milesymedia.co/blog/<slug>`). Either ship those posts or point at the BOS module library instead.
- [ ] "We'll do it for you" mailtos should pre-fill richer subject lines + a body recap of the user's score for that topic.

## Phase 3 — Pro tier (real audit hooks)

The Professional tier currently shows mocked scan output. Replace with:

- [ ] **Lighthouse**-style Performance/Accessibility/SEO/Best-practices read via PageSpeed Insights API or Vercel/Cloudflare worker.
- [ ] **Site metadata scrape** (title, h1, description, OG, schema).
- [ ] **Indexed-pages estimate** via `site:` query (or DataForSEO if budget allows).
- [ ] **GMB lookup** by business name + town (Places API).

Decision needed: serverless function on Vercel, or an external worker. Recommend a small Vercel Edge function for now — same project, no extra infra.

## Phase 4 — Funnel measurement

- [ ] Capture email at the gift-card step (optional — we already capture it on BOS signup, but adding it here gives us a recoverable lead even if they bounce on the BOS signup form).
- [ ] Webhook on completion → CRM (or notify-only mailto for now).
- [ ] Drop-off analytics: which topic do people skip, which step kills the most flow?
- [ ] A/B the gift card headline ("Claim your free Business OS" vs "🎁 Free OS for finishing" vs "Your reward — a free Business OS").

## Phase 5 — Production wiring

- [ ] Vercel rewrite for `/health-check` → `/_milesy/health-check/index.html` (currently only `/`, `/index.html`, `/login.html`, `/admin.html`, `/styles.css` are rewritten — chief commander / T6 to add).
- [ ] Strip the dev floating action labels for production (or feature-flag them off).
- [ ] Update milesymedia website hero CTA to point at the production path (already `/health-check.html` via the JS shim — switch to `/_milesy/health-check.html` once the rewrite lands, then drop the shim).
- [ ] Smoke harness: assert all 5 topics × 3 tiers render, all step types work, dashboard always renders something even with 0 answers.

---

## Open questions for Ed

1. **Niche-specific questions** — do we want 1 per topic, or a fully forked tier per niche (more work but feels much more "tailored")?
2. **Pro tier audit** — is real Lighthouse + GMB lookup worth the build effort now, or save it for v2?
3. **Email capture** at the gift card — yes/no? Adds friction but recovers leads.
4. **Quick-win guides** — do we ship blog posts to `milesymedia.co/blog/`, or fold them into BOS modules?
