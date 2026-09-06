# Blockers for Ed — things I can't do without your keys/accounts/decisions

Running list from the autonomous run started 2026-09-05. I **note these and move on**,
building and testing everything *around* the missing piece so it's plug-and-play the
moment you hand it over. Nothing here is stalled work elsewhere.

## 🔑 Secrets / credentials (I build + test around; you wire)

- **Supabase secrets for local + the config surfaces.** You said you'll give them later.
  Until then local dev stays on `PORTAL_BACKEND=file` and I do NOT wire the live
  client/service configuration to real Supabase — I build the surfaces and test them on
  the file backend. (TODO: "Set `PORTAL_BACKEND=file` in `.env.local`"; rotate the DB
  password + `sbp_` token that were pasted in a transcript on 2026-09-03.)
- **Stripe live account** — every "finish live Stripe acceptance" P1 item (#33 #42 #45 #69
  #122 #123 memberships/affiliates/ecommerce). Code + file-backend behaviour is done on
  most; live-provider acceptance needs your account.
- **Meta / Instagram developer app** — social inbox connect (#11), Meta messaging.
- **Email / SMTP provider** — Email Sender live acceptance (#43).
- **Other provider keys** — voice/call recorder (#145), any live-provider ledger/webhook
  acceptance across the P1 list.

### 📋 Plug-and-play env-var checklist (set these on Railway — names only, no values here)

So handover is copy-paste, not a hunt. These are the exact `process.env` names the code reads,
grouped by what they unblock. Anything marked *(likely already set — app runs)* just needs
verifying. Cross-check against `src/lib/server/productionReadiness.ts`.

- **Supabase — DATA (likely already set — app runs):** `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (+ legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`),
  `SUPABASE_SECRET_KEY` (+ legacy `SUPABASE_SERVICE_ROLE_KEY`), `DATABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET`. (New `sb_`-scheme keys with legacy fallback — see the
  key-rotation note; the app reads both.)
- **App secrets — sessions/handoff (likely already set):** `SESSION_SECRET` /
  `PORTAL_SESSION_SECRET`, `PORTAL_HANDOFF_SECRET`, `PORTAL_PREVIEW_SECRET`,
  `AQUA_EMBED_SIGNING_SECRET`, `AQUA_EMBED_API_TOKEN`, `CRON_SECRET` (also gates the radar-probe cron).
- **Radar probe self-scheduler (#170, optional — OFF unless set):** `RADAR_PROBE_INTERVAL_MINUTES` — set to a
  positive number of minutes (e.g. `180`) on the Railway instance to run the probe sweep in-process on the
  persistent server. Leave unset to keep it off (and instead use a Railway cron / GitHub Action on
  `/api/cron/radar-probes`). Only takes effect where `PORTAL_SINGLE_INSTANCE=true`.
- **Stripe — payments/onboarding (#33 #42 #45 #69 #122):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- **Email — client comms (#43). Pick ONE provider:** Resend → `RESEND_API_KEY`, `MILESYMEDIA_FROM_EMAIL`,
  `MILESYMEDIA_FROM_NAME`, `MILESYMEDIA_SUPPORT_EMAIL`; **or** SMTP → `SMTP_HOST`, `SMTP_PORT`,
  `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `SMTP_REPLY_TO`. Plus
  `ENQUIRY_EMAIL_FROM`, `FOUNDER_EMAIL`.
- **Meta / Instagram — social inbox (#11):** `META_APP_ID`, `META_APP_SECRET`,
  `META_WEBHOOK_VERIFY_TOKEN`, `META_GRAPH_API_VERSION`.
- **Twilio — voice/SMS/WhatsApp (#145, optional):** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_AGENT_PHONE_NUMBER`, `TWILIO_VOICE_FROM_NUMBER`, `TWILIO_SMS_FROM_NUMBER`,
  `TWILIO_WHATSAPP_FROM_NUMBER`.
- **Optional extras:** `OPENAI_API_KEY` (Advisor/AI), `GITHUB_TOKEN` (Dev-editor publish walk),
  `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET` + `GOOGLE_CALENDAR_OAUTH_CLIENT_ID`/`_SECRET` (calendar),
  `VERCEL_TOKEN` (only if still using the Vercel deployer).

**Minimum to walk a real client onboarding end-to-end:** Supabase (verify) + Stripe + one email
provider. Meta/Twilio/Google are per-feature and can follow.

## 🌐 Infra / environment

- **Radar probe cron isn't firing on Railway — SELF-SCHEDULER NOW BUILT (2026-09-05), just set the env var.**
  The live inbox showed *"scheduled probe sweep hasn't run,"* so radar evidence was going stale. On Vercel
  this was a platform cron; Railway has none. A self-scheduling interval on the persistent instance is now
  built and flag-gated OFF (`src/engines/data/server/radar/probeSchedule.ts`). **Activate it by setting
  `RADAR_PROBE_INTERVAL_MINUTES`** (e.g. `180`). Alternatives still work if you prefer: a Railway cron
  service or a GitHub Action hitting `/api/cron/radar-probes` (leave the env var unset). See #170 below.
- **Apex `aqua-crm.com` cert** — only `www` is registered on the Railway plan; the apex
  serves an invalid cert. Add the apex domain in Railway (needs the plan slot) or drop the
  apex DNS.
- **Supabase PITR + restore rehearsal** — daily physical backups exist but PITR is OFF and
  no restore was rehearsed (TODO). Recovery isn't fully verified.
- **Deployment env verification** (TODO, Ed-only).

## 🧭 Decisions I need from you (won't guess)

- Radar fractal §9 questions (in `plans/fractal-radar-architecture.md`) — **now pre-answered with
  recommended defaults in §9a** so this is a fast approval, not a deliberation. Each is a low-risk,
  reversible engineering tradeoff (Phase-2-first; accept ≤daily non-critical latency per #170;
  whole-client dirtying before element-level events; per-client targeting before domain decomposition;
  full-sweep-only correlations; batched notifications; defer the dev subtree). **Just say "yes to your
  §9 defaults" (or change any line) and I build Phases 3–6 on them.** I did not build ahead on guesses
  — the node model can shift with your answers, so I want your nod first to avoid rework.
These four now have a **recommended default** too — say "yes to your recommendations" (or change a line)
and I implement the ones with an engineering side:
- **#170 Radar probe freshness. 🟡 BOTH HALVES BUILT 2026-09-05, needs one env var from you.** The honest
  half was already done (evidence age shown; stale readings degrade to `blind`, never a false green). The
  mechanism half is now built too: a self-scheduling probe interval on the persistent instance
  (`src/engines/data/server/radar/probeSchedule.ts`), **OFF by default**. **To turn it on:** set
  `RADAR_PROBE_INTERVAL_MINUTES` on Railway (e.g. `180` for every 3h) — that's the whole activation. It runs
  only on the single instance and does the exact same sweep as `/api/cron/radar-probes`, so if you'd rather
  use a Railway cron service or a GitHub Action hitting that route, that still works and you leave the env
  var unset. Your call on which; the code is ready for all three.
- **#174 Last-grant revocation policy. ✅ APPROVED + DONE 2026-09-05.** You chose "no grants = no access".
  Implemented: a new `actorEverHadNonProjectAccessPolicy` makes the governance boundary a one-way door, so
  revoking an identity's last grant now **narrows to a refusal** instead of un-migrating them back to legacy
  `manage`. A genuinely never-governed identity is untouched (migration safety intact). All seven
  governance-boundary gates use it; the release-access-matrix pin records the new rule; full suite green.
- **#163 / #168 client-route refusals. ✅ APPROVED + DONE 2026-09-05.** Standardised on the indistinguishable
  404. #163: a **client** identity's refusal of a project not attached to them is now the same 404 an invented
  id gets (agency identities keep the honest 403). #168: turned out already complete in code across every named
  route (tenant client-*/customer-*/product-workspaces, contracts/templates, performance/*) — verified by an
  exhaustive source sweep + a 10-route pin, docs updated. Full suite green.
- **#2 Aqua Tag form-capture consent wording. 🟡 DRAFT WIRED 2026-09-05, needs your DPO's final wording.**
  The approved draft — *"By submitting, you agree we can store and use your details to respond to your
  enquiry. We won't share them or use them for anything else. See our Privacy Policy."* — is now the default
  data-use notice on Aqua's own contact form (React block + static export), as a `consentNotice` prop so your
  DPO's final wording drops in **without a code change**, plus an optional `privacyPolicyUrl` to link the
  policy. Basis is legitimate-interest-with-transparency (not a hard gate), per your steer. **What's left is
  yours:** DPO signs off the exact wording, then tell me the final string (or edit the prop default). This is
  the only remaining piece of #2.
- **DPO sign-off**, Stripe live walkthrough, Meta app, onboarding-chain walk — the TODO's
  "Blocked on you" section.
- A **real client's actual details** to do a true end-to-end onboarding (I'll build + test
  onboarding with a synthetic client on the file backend meanwhile).

_(Full detail for `#N` items is in `issues.md` / `ED-QUESTIONS.md`.)_
