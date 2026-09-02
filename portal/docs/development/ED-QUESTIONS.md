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

The immediate coordinated-storage path has **four ordered database
preconditions**, as defined by `docs/data/MIGRATION-PLAN.md`:

1. `20260809090000_atomic_datastore_patches_and_history.sql`;
2. `20260825130000_product_workspace_leases.sql`;
3. `20260902090000_merge_app_datastore_patch_objects.sql`; then
4. `20260902091000_product_workspace_lease_renewal_fencing.sql`.

The wider relational extraction still separately requires the enquiry agency
column, Master Inbox tables and a version-controlled `rls_auto_enable()`
definition; those are not extra members of this four-migration ordering.

**Unblocks:** live coordinated-storage/concurrency acceptance and later migration
phases. Apply through the controlled production migration process, then verify
schema status, RLS and the remote concurrency cases; checked-in SQL alone is not
deployment evidence.

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

# Batch 2 — raised by the 2026-08-30 to-do campaign

All 131 documented to-dos were verified against source. **Sixteen** of them
cannot be finished without you — eleven blocked outright on a decision or an
account you own, five carrying a risk I should not take on your behalf. Three
more questions below (Q15's purge rule, Q16, Q17) came out of the campaign's
own implementation work rather than the triage, so nineteen items in total sit
here.

They are grouped by what you actually have to do: **decide**, **do (external
account)**, or **sign off**. Every one has had its decision-independent half
built already — none of these is blocking a line of code that could have been
written without you.

The other 115 to-dos needed no input from you. Where they are not finished, it
is because the closing evidence is a browser walk this container cannot run —
recorded honestly rather than ticked.

## DECISIONS — product or policy calls

### Q14 — Does form capture need consent, like telemetry does?

The Aqua Tag gates telemetry on consent, but the **form field-value capture**
path posts to `/api/public/form-capture` with no consent check on either side,
and the server hardcodes `consent:false` on capture-only inserts. That is
either correct (a submitted form is the consent) or a live compliance gap,
depending on a view I should not take on your behalf.

**Unblocks:** `todo:968`.

### Q15 — What happens when you retire something that is still referenced?

Dependency inventories now exist and are test-proven for SOPs, membership plans
and affiliates, and the deletion paths refuse rather than orphan. What is NOT
decided is the policy behind the refusal: archive/tombstone, require
reassignment first, or one transactional detach under a stated retention rule —
and specifically whether a plan with **billable subscribers** may ever be
purged, and what must be reconciled in Stripe before it is.

**Unblocks:** the policy half of `todo:751`, `todo:757`, issue #176.

### Q16 — If a campaign send crashes mid-blast, what should the campaign say?

Campaign delivery is now truthful — it reports what the provider actually did.
But a crash **during** a blast can strand a campaign in `sending` with some
recipients contacted and some not. Options: resume on next run (needs
per-recipient state, already partly there), mark it `partially-sent` and stop,
or fail the whole campaign and require a manual re-send.

I did not pick one: each is defensible and each is visible to your customers.

**Unblocks:** the last open major from campaign wave 2.

### Q17 — Durable job runner, or synchronous sending, permanently?

Campaign send is now **synchronous** — the option the to-do sanctioned —
because this app has no job-runner infrastructure at all. That is honest and it
works, but it ties up a request for the length of a blast and cannot retry.

A real queue/worker is a platform decision with real cost, not something to
introduce inside a to-do item.

**Unblocks:** `todo:99`'s remaining half.

### Q18 — Revoking someone's last grant currently WIDENS their access

Governance is recomputed from active grants, so revoking an identity's last
non-project grant flips `governed` back to false and they fall back to legacy
`manage` on every client element. Revocation makes them **more** powerful.

This is pinned deliberately by the release access matrix rather than changed
unilaterally, because the fix is a policy choice: fail closed (no grants = no
access) or keep the legacy fallback for un-migrated identities.

**My recommendation: fail closed.** But it can lock people out of surfaces they
use today, so it is yours.

**Unblocks:** issue #174.

### Q19 — Advisor "omega" upgrade: what is the vision?

The plan document is a placeholder that literally says "To fill once Ed
answers". Source confirms the pre-omega state: exactly 8 skill recipes, a
`gpt-5-mini` default, reactive-only behaviour. Nothing can start without the
shape you want.

**Unblocks:** `todo:942`.

### Q20 — What does a client actually SEE at each product-portal stage?

The four-mode enum (`onboarding|designing|developed-launch|maintenance`) types
every stage, but the client-facing content is one static blurb per mode. The
engineering half (stage carries an element payload) is mechanical. The half
that needs you is the experience: what elements, welcome video and tasks each
stage carries, and the "stunning standard" defaults replacing the eleven
existing blurbs.

**Unblocks:** `checklist:1947` (~5 days of work).

### Q21 — Extract a wizard engine, or leave the setup flows hand-written?

There is no wizard engine; the 711-line Aqua Tag setup is bespoke, and several
other setup flows repeat its shape. Extracting a steps-as-data engine is real
work that pays off only if you intend more setup flows.

**Unblocks:** `checklist:1951`.

## ACTIONS — external accounts only you can touch

### Q22 — Affiliate payouts need their OWN Stripe webhook secret

Automated affiliate payouts are currently **refused** rather than offered,
because `transfer.paid` is the only route a payout has to `completed` and it
arrives by webhook. With no verifiable webhook secret, an automated transfer
would really move the affiliate's money and then strand the payout with no
control left to finish it. Manual mark-paid carries the scope safely today.

To enable it: add a Connect webhook endpoint in your Stripe dashboard and put
its signing secret in the affiliates install config.

**Unblocks:** the automated half of `todo:506`.

### Q23 — The external-account queue (nothing here is code work)

Each of these is code-complete and waiting on an account action:

- **GitHub credentials for the editor publish walk** — promised 27 Aug, still
  outstanding. Connect GitHub *in the editor Settings tab* (one vault — do not
  create a second connection store), then walk save → diff → commit → PR →
  merge on a throwaway branch before any client repository. `todo:971`.
- **Meta/Instagram app review** — the self-serve Connect-now flow, webhook
  verification and multi-account routing are built and test-pinned.
  `todo:953`, `checklist:1620`.
- **Live Stripe credentials** — vault, checkout, signed webhooks and refunds
  all exist and are tested against test mode. `checklist:1614`.
- **Vercel env names + `CRON_SECRET`** — the required-env definitions, startup
  check and fail-closed cron guards exist. `checklist:1622`.
- **Apply the four ordered coordinated-storage migrations** — see Q8; then
  verify schema/RLS and remote concurrency before enabling that path.
  `checklist:1625`.
- **Re-enter the unrecoverable routing values** — `parseBlob` no longer wipes
  them, but the ones already lost cannot be recovered by code.
  `checklist:1984`.

## SIGN-OFF

### Q24 — Retention schedule needs a DPO or solicitor decision

The erasure sweep with disposition policy (delete/anonymise/RETAIN), a
preview-before-enforce retention control, and a reviewer-ready DPO pack all
exist in source. The retention **schedule** itself is a legal decision.
Follow-on code (expiry/purge for the RETAIN set) is designed and waiting.

**Unblocks:** `checklist:1629`.


---

## Answered items

### Q12 — Website Editor localStorage surfaces — answered 2026-09-01

Retire the parallel admin islands. Sections, Popups and legacy Page Detail were
removed or redirected; Customise now contains only an honest browser-local editor
preference plus canonical tenant-scoped site/export controls. Issue #31 is resolved.

### Q13 — Build custom portal wizard — answered 2026-09-01

Remove the dead `portal-export` wizard and route the CTA to the canonical Systems
workspace backed by `/api/tenants/client-projects/provision`. The code/path decision
is complete under #36; mounted provision/reload and configured-provider acceptance
remain, so the acceptance work stays in TODO rather than this decision queue.

*Answered items stay here with the decision and date so the section above remains
a live queue.*
