# Checklist — 2026-08-22 (live checkout refresh)

> ★ **This is the one answer to "where do we stand".** As of 2026-08-22 nothing
> else claims that job: `WHERE-WE-ARE.md` and `WHERE-WE-STAND.md` are on the
> [history shelf](../context/archive/README.md), and `CURRENT-IMPLEMENTATION.md`
> is scoped to *what systems exist*. What changed and when is the one log,
> [updates.md](updates.md).

← [roadmap.md](roadmap.md) · Editor detail: [dev-editor-finish.md](plans/dev-editor-finish.md).

**Proof from this checkout, 2026-08-22:** full isolated suite **3,329 pass / 0
fail / 1 skipped**; typecheck **0**; `git diff --check` clean. Port 3032 is
`npm run dev:sandbox:real` on the **file backend** (`.data/portal-state.json`),
not the configured Supabase datastore. Mark's project record was fingerprinted
before and after the test pass and stayed byte-identical at
`a0d3db327a76990466019891610a1ed671f5b274bbbd85ba0e62c4bb3861e94e`.
No request was sent to Mark's website and no project record was saved.

---

## 🔴 Decisions / external setup only Ed can finish

- [ ] **Merge to `main`** (Ed's call — it triggers Vercel → production). The first commit and push are DONE: the branch `work/2026-08-20-parallel-session` is on origin.
      a push triggers Vercel → production, which is why it has waited.
- [x] ~~Is a "company" an Agency or a TradingCompany?~~ **SETTLED 2026-08-20:**
      agency = holding group, trading companies stay companies and gain portals.
      Company-promotion phases 1–3 are built on exactly this model.
- [ ] **Walk the onboarding chain** once, on your own data: client → connection
      link → they sign in → they see their portal. Everything is built; only the
      code step has never been clicked. This is what stands between you and the
      clients who are waiting.
- [ ] **Stripe:** the local keys exist, but `stripe` is not installed and there is
      no rendered settings writer for the plugin's declared secret fields. This
      is a code gap, not an Ed-only key task; see
      [the verified finding](findings/2026-08-22-stripe-can-never-be-configured.md).
- [ ] **Meta Developer app** + real HTTPS OAuth/webhook walk. No `META_*` values
      are present in this checkout; the in-app encrypted connection surface is built.
- [ ] **Deployment env verification.** Local presence is proven for session,
      vault, Supabase, Resend, Stripe and OpenAI names; that does **not** prove
      Vercel has them. `CRON_SECRET` is absent locally. Never copy values into docs.
- [ ] **DPO sign-off** on the erasure retention schedule.

## 🔴 Open defects found in the current source

- [ ] **Finance role leak:** an `agency-staff` user can reach finance-admin SSR
      pages by URL and Operations can serialize salary data before the client-side
      API gate. [Finding](findings/2026-08-22-agency-staff-can-read-salaries.md).
- [ ] **Stripe has no usable configuration path:** package absent, manifest fields
      unrendered, vault connection ignored by the finance reader.
      [Finding](findings/2026-08-22-stripe-can-never-be-configured.md).
- [ ] **Four false-data surfaces:** unmeasured website views shown as zero, outages
      called demo sessions, tax reclaim clamped to zero, and overview currency
      guessed from the first record. [Finding](findings/2026-08-22-surfaces-that-state-a-falsehood.md).
- [ ] **Aqua Editor AI multi-instance claim:** this pass made replies idempotent
      across sequential retries and concurrent requests in one server process,
      and rejects a late answer after a newer message. A distributed lease/unique
      append is still needed before claiming the same guarantee across parallel
      production instances.

## 🟠 Editor — current order

- [x] **Door-anchored project family switcher.** Parent door → parent + direct
      children; child door → that child only; unrelated agency projects never
      appear. Switching clears source/tag/AI context and the selected project's
      AI config/history re-fetches under its own id.
- [x] **Aqua Editor AI reply replay guard (single process).** Each request names
      the exact saved user message; sequential replay returns the stored answer,
      concurrent replay shares one provider call, and a stale result is not appended.
- [x] **Dev Team hydration trigger removed in source.** The literal `<style>` text
      inside the inline style payload is gone. Browser reload proof is still due.
- [ ] **Project page navigator** — the current tagged browser has one address and
      no route/page picker.
- [ ] **Website / Normal surface switcher** — Website must add per-page SEO,
      canonical, robots, social tags and structured data; Normal remains universal.
- [ ] **Full browser round trip** — ping → select → exact words → source patch →
      draft branch → publish/PR/merge, plus device sizing, insert, lifecycle,
      Librarian and throttle. Source tests are green; this acceptance path is not.
- [ ] **Whole editor in a client portal** with a project-family security boundary.
      This is phase 18 and is not mounted today.

## 🟠 Broader next work

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
- [ ] **Historical docs still call closed work open** in prose. Archive or add a
      superseded banner instead of letting them compete with this checklist.
      high value to the next agent — stale docs are how tonight's three phantom
      blockers happened.
- [ ] **Backfill phase ticks** on 14 shipped plans reading `0/N`, then archive
      them to `plans/archive/`.
- [ ] **Re-enter the Aqua Tag routing config** production lost (master site key,
      website sources, per-site config). Code fixed; the values are gone.

## ✅ Closed 2026-08-20/21 (historical)

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
