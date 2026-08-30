# Questions for Ed — blocked decisions, work continues around them

**Started 2026-08-30.** Per your instruction: anything needing your input is
written here and skipped; everything else proceeds. Answer inline or in chat —
each item says exactly what it unblocks.

---

## Q1 — Do end-customers get PASSWORD sign-in, or is magic-link their only door?

`smoke-mfa-doors.test.ts:56` says magic-link is their door, and their signup
provisions no Supabase identity — so today a password-reset email would arrive
and `/login` would still refuse them.

- **If passwords: yes** → I wire the login route (spec 4 edit 6, ready).
- **If magic-link only** → I change the customer portal's "Reset password"
  button to send a magic link instead.

*Everything else in the reset flow is already fixed and shipped either way.*
**Unblocks:** end-customer password reset. **Recommendation:** magic-link only —
fewer credentials to support, and the flow already exists.

## Q2 — Resend sending domain (ACTION, not a question)

`.env.local` uses `onboarding@resend.dev` — Resend's sandbox sender, which only
delivers to *you*. Until a real domain is verified in Resend (DNS records) and
`RESEND_API_KEY` + a real from-address are in Vercel, **no customer ever
receives an email in production**, whatever I build.

**Unblocks:** password reset, enquiry notifications, all transactional mail.

## Q3 — Twilio account + numbers

The outreach journey's calling half (press-to-call, number picker, inbound
answering) is built/being built against the existing telephony layer, but live
calls need: your Twilio account SID/auth token in Connections, at least one
purchased number, and the voice webhook URL set in Twilio's console to
`<production-domain>/api/webhooks/twilio/voice`.

**Unblocks:** real dialling and inbound answering. Everything ships
webhook-verified and dormant until then.

## Q4 — Public demo: how long before a visitor's sandbox is wiped?

The self-serve demo design is staged (per-visitor data realms). The consent
copy must state the retention period, and the reaper enforces it. Pick one:
**24h / 72h / 7 days**. **Recommendation:** 72h — long enough to come back
after a weekend, short enough to keep storage trivial.

Also: **do not publish any "we delete after X" wording until I confirm the
reaper is live** — deletion machinery didn't exist until this work.

## Q5 — Terms of service + privacy wording for the demo gate

I build the checkbox, record consent with a timestamp and version, and link the
pages — **the words are yours** (legal). A name + phone number is personal
data: it needs a lawful basis and sits under your governance/DPO erasure
surface (I'm wiring demo signups into it). You may want your solicitor's eyes
on the demo T&Cs before the gate goes live.

**Unblocks:** the public demo gate going live (build proceeds behind a flag).

## Q6 — Aqua as a public subscription product

You said: sell AquaCRM as a subscription to agencies. Pricing, plan tiers, and
Stripe products are yours to define. The demo/website work does NOT wait on
this — but the pricing page will ship with placeholder tiers until you set
real numbers.

## Q7 — Supabase cutover residue (from the live preflight)

1 portal user would be **locked out at cutover** and 2 auth users have no
role/agency. These need reconciling in the Supabase dashboard before cutover.
Run `node scripts/supabase-cutover-preflight.mjs` to see the current list.

## Q8 — Apply the written-but-unapplied database migrations (ACTION)

Three things exist on disk but not in the live project, and the data
architecture work (docs/data/MIGRATION-PLAN.md) is gated on them:

1. `supabase/migrations/20260820150000_brand_enquiries_agency_scope.sql` —
   the enquiry `agency_id` tenant column (until applied, tenancy rides in
   `metadata->>'agencyId'` and the agency-aware RLS ratchet cannot bite).
2. `supabase/migrations/20260811113000_master_inbox_messaging.sql` — the five
   `inbox_*` tables; production's `useSupabase()` inbox path 404s without
   them.
3. The live project's `rls_auto_enable()` function exists in NO migration —
   export it from the dashboard and commit it, or it dies on any rebuild.

**Unblocks:** migration phases 1/4/6; honest RLS claims. You run
`supabase db push` by hand — say when, and I'll verify with
`supabase/rls-verify.sql` + the preflight script.

## Q9 — Which response SLA is canonical?

Two "response compliance" numbers exist side by side: the Radar/command KPI
uses your **configured** guardrail (`speedToLeadTargetMinutes`), while the
commercial formula `response-sla` **hardcodes 5 minutes**. Dedup
(MIGRATION-PLAN phase 7) needs the business answer:

- **Recommendation:** the configured guardrail is canonical everywhere;
  5 minutes stays only as the default value of that guardrail.
- Alternative: keep a fixed 5-minute industry benchmark as a *separate,
  clearly-labelled* metric next to your own SLA.

**Unblocks:** folding `response-sla` onto the canonical calculation.

## Q10 — Which campaign ROAS is "the" ROAS?

`campaign-roas` exists twice (command KPI: zero-clamped, rounded 2dp over
built campaign rows; commercial formula: unrounded over raw records). They can
disagree in the same explorer, and custom KPIs resolve to the opposite one
than the picker does. **Recommendation:** the command KPI is canonical for
dashboards; the commercial twin gets a namespaced id and a "raw/unrounded"
label until retired. Saved custom-KPI definitions referencing it get a
backfill.

**Unblocks:** retiring the one descriptor-id collision
(pinned in `src/lib/data/metricRegistry.ts` until then).

## Q11 — First-cut Supabase tables: adopt or drop?

`clients`, `client_portals`, `client_portal_members`, `audit_events` exist
live (created by the initial security migration), are **empty**, and no
portal code reads them. The extraction phases will create real tables for
these concepts — reusing those names only works if we adopt and reshape them.
**Recommendation:** drop them in a migration once phase 1 designs the real
schemas, so nobody builds against the wrong model.

**Unblocks:** clean table naming for migration phases 1–2.

---

*Answered items: move them to the bottom with the decision and date, so this
file stays a live queue.*
