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

---

*Answered items: move them to the bottom with the decision and date, so this
file stays a live queue.*
