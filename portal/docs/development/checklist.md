# Checklist — 2026-08-20 (refreshed, evening)

← [roadmap.md](roadmap.md) · Refreshed after the reorg + Aqua Engine + three-lane session.
Suite **2,704 pass / 0 fail / 1 skipped** (2026-08-21), typecheck **0**, sandbox intact.

---

## 🔴 Yours — nothing moves without you

- [ ] **Merge to `main`** (Ed's call — it triggers Vercel → production). The first commit and push are DONE: the branch `work/2026-08-20-parallel-session` is on origin.
      a push triggers Vercel → production, which is why it has waited.
- [x] ~~Is a "company" an Agency or a TradingCompany?~~ **SETTLED 2026-08-20:**
      agency = holding group, trading companies stay companies and gain portals.
      Company-promotion phases 1–3 are built on exactly this model.
- [ ] **Walk the onboarding chain** once, on your own data: client → connection
      link → they sign in → they see their portal. Everything is built; only the
      code step has never been clicked. This is what stands between you and the
      clients who are waiting.
- [ ] **`npm i stripe` + keys** if you want pay-by-card. Blocked by design, not by
      a missing worker.
- [ ] **Meta Developer app** + webhook, if you want the Meta inbox live.
- [ ] **DPO sign-off** on the erasure retention schedule.

## 🟠 Next up — mine, in order

- [x] ~~Element engine, phases 1–3~~ **DONE 2026-08-20** — vocabulary in
      `src/engines/editor/elements/`, additive ABI, portal blocks on the registry with a
      byte-parity harness guarding client-visible HTML.
- [ ] **Engine widening + assistant proposals** (P5, P6). ~5 days. After this an
      assistant can compose real sites and portal pages. **Do not start P6 first.**
- [ ] **Stages hold elements** — retires the four-mode enum. This IS the
      onboarding builder. ~5 days. ⚠ Six coercers must widen together or a stage
      id silently resets to `onboarding` and in-flight client work jumps to the
      start with no error.
- [ ] **Wizard engine.** Generalise the 711-line Aqua Tag setup into steps/UI/
      actions as data. The rules half already exists (automations, with
      `phase.advanced` + `client.stage_changed` already firing); the action
      vocabulary needs portal-facing verbs beyond email/task/log/webhook.
- [ ] **Env-only audit.** Every setting that needs a redeploy to change cannot
      ship in a sellable product. `inspectProductionReadiness` reads its verdict
      from env, so a sold instance would read as permanently unready. That list
      is the true scope of "sellable" and nobody has it yet.
- [x] ~~RLS as repo SQL~~ **Already true** — 14 migrations in
      `aquaCRM/supabase/migrations/` (the earlier "none exist" claim looked in
      `portal/` only). Open residue: `brand_enquiries` has no `agency_id`; ~30
      service-role call sites bypass RLS (count disputed — measure first).
- [ ] **~12 docs still call RLS an open 🔴 blocker** in prose. Low value to you,
      high value to the next agent — stale docs are how tonight's three phantom
      blockers happened.
- [ ] **Backfill phase ticks** on 14 shipped plans reading `0/N`, then archive
      them to `plans/archive/`.
- [ ] **Re-enter the Aqua Tag routing config** production lost (master site key,
      website sources, per-site config). Code fixed; the values are gone.

## ✅ Closed tonight

**Data loss, live:** the Aqua Tag routing layer never survived a restart — in
production too · the full smoke suite wiped your dev sandbox every run · five test
fixtures leaked into your workspace · concurrent roadmap writes lost one silently.

**Security:** MFA enrolment was a lockout button (server gate shipped, login screen
couldn't answer it) · `preview-as-client-at-phase` open in production to every
customer's owner, seeding a fixed-credential tenant into live Supabase ·
credentials leaking across companies (Stripe, Meta, Resend, from-address) · a
company's own website silently dropping every enquiry.

**Shipped:** company switcher + brand-aware sign-in (38 tests, no escalation
possible) · MFA on login · marketing 10 views → 5, every old link resolving ·
finance expense idempotency · published-site login · Dev Console 12 sections → 6
with 57 gaps fixed · roadmap with file maps for all 34 plans and collision
detection · plan archive.

**Corrected:** all three "🔴 launch blockers" were already fixed · RLS already on ·
email sender already live · Stripe keys already in env. The docs were wrong in your
favour on every one.
