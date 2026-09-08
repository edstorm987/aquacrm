# Blockers for Ed — things I can't do without your keys/accounts/decisions

Owner-controlled list, reconciled 2026-09-08 against the current
[production-readiness assessment](PRODUCTION-READINESS.md). Engineering-owned
work remains only in [TODO.md](TODO.md); this page names credentials, platform
settings and decisions that cannot be truthfully completed from the repository.

## 🚀 Deploy the 2026-09-08 readiness fixes (newest — your action)

A local engineering pass fixed four red gates in source/tests/CI (#187 health
truth, #189 contrast ×2, #190 `dev:verify`, #188 CI) plus structured observability
logging. **These are locally verified but NOT yet deployed.** To ship them:

1. **Review + merge** the branch these land on (they are NOT committed for you — see
   the recommended commit boundaries in the session handoff), then let Railway
   auto-deploy `main`.
2. **Verify after deploy** (read-only):
   - `curl -s https://www.aqua-crm.com/healthz` → `sha` is now the deployed commit
     (not `null`), `platform:"railway"`, `env:"production"`.
   - `curl -s -o /dev/null -w '%{http_code}' https://www.aqua-crm.com/healthz/full`
     → **503** while required email is still `needs-setup` (this is now correct —
     an unready production release must not answer 200). It returns **200** only
     once every required readiness item is ready.
3. **Rollback** if needed: Railway → the `aquacrm` service → Deployments → redeploy
   the previous good deployment; or `git revert` the merge commit and push. The
   fixes are self-contained (health routes, `globals.css`, `instrumentation.ts`,
   `deployment.ts`, `observability.ts`, `storage.ts`) with no schema/migration/env
   dependency, so a revert is clean.
4. **Enable branch protection** on `main` to require the new CI jobs
   (`verify`, `browser`) before merge — see `.github/workflows/ci.yml`.

Note: `/healthz/full` returning 503 is the *goal* of #187 — do not "fix" it by
weakening the check. It turns green by making the required items (email, secure
access) actually ready.

## 🔑 Secrets / credentials (I build + test around; you wire)

- **Supabase local/live separation and credential rotation.** `.env.local`
  currently leaves `PORTAL_BACKEND` and `PORTAL_DATA_FILE` unset, so a plain
  local run can promote itself to configured Supabase. Set an explicit file
  backend/path before local mutation work and rotate the DB
  password + `sbp_` token that were pasted in a transcript on 2026-09-03.
- **Stripe live account** — every "finish live Stripe acceptance" P1 item (#33 #42 #45 #69
  #122 #123 memberships/affiliates/ecommerce). Code + file-backend behaviour is done on
  most; live-provider acceptance needs your account.
- **Meta / Instagram developer app** — social inbox connect (#11), Meta messaging.
- **Email / SMTP provider** — the 2026-09-08 Railway deep probe reports required
  email `needs-setup` and the release `readyForProduction:false`; configure and
  prove Email Sender/enquiry/security delivery (#43).
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
- **Recovery activation** — PITR is OFF. The repository now has a self-managed
  encrypted backup runbook and workflow, but it is not production-proven until
  `BACKUP_ENABLED`, keys/secrets, durable off-Supabase delivery, a downloaded
  live-artifact restore, timing and missed-backup alert proof are complete.
- **Deployment environment verification** — `www` serves and database/security/
  uploads report ready, but email is missing, the detailed probe incorrectly
  returns HTTP 200 while unready, the deployment SHA is null and apex TLS fails.

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
