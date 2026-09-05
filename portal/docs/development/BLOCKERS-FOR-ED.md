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

## 🌐 Infra / environment

- **Radar probe cron isn't firing on Railway.** The live inbox shows *"scheduled probe
  sweep hasn't run — last checked 22d ago,"* so radar evidence is going stale. On Vercel
  this was a cron; on Railway it needs a scheduler (Railway cron service, the GitHub
  Action, or a self-scheduling interval). **Your call on the mechanism** — I can build a
  self-scheduling interval on the persistent instance if you want (flag it and I will).
  Directly relevant to the fractal Radar's "always-on" layer.
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
- **#170** Radar probe freshness: restore sub-daily probes or show evidence age everywhere.
- **#174** permanent last-grant revocation policy.
- **#163 / #168** client-route refusals: indistinguishable sibling-project 404s vs the house
  404 convention.
- **#2** Aqua Tag form-capture consent wording.
- **DPO sign-off**, Stripe live walkthrough, Meta app, onboarding-chain walk — the TODO's
  "Blocked on you" section.
- A **real client's actual details** to do a true end-to-end onboarding (I'll build + test
  onboarding with a synthetic client on the file backend meanwhile).

_(Full detail for `#N` items is in `issues.md` / `ED-QUESTIONS.md`.)_
