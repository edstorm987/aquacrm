# Phases / roadmap

← Back to [development.md](../development.md) (the law)

> ⚠ **SUPERSEDED 2026-08-20 by [roadmap.md](roadmap.md)** — the live roadmap, written and
> edited from the Dev Console at `/portal/dev-team/roadmap`. It carries the same idea with
> dates, horizons and progress **computed** from the plans' phases, so it cannot go stale the
> way this file did. Kept for its history; **do not add new items here.**

Where development is going, in order. Move an item to "Done" (with a date) when
it ships, and log it in [updates.md](updates.md). This is the queue — pull the
top of "Next" unless Ed redirects.

## ✅ Recently done (this push — Aug 2026)
See [the session changelog](../workspace/session-changelog-2026-08.md) for detail.
- Client-software → portal connections (`/connect` cutscene + agency management).
- Customer setup flow (`/setup`) + PWA.
- Standard portal = one Website product, phases Onboarding→Design→Develop→Published.
- Compliant erasure (client + enquiry, unrecoverable, audited).
- Enquiry dedupe; website→inbox routing; master tags; Channels made real.
- **Aqua Tags wizard steps 1–3 live** (generate → detect on domain → scan forms).
- Full documentation system (this whole `docs/` tree).

## 🔨 Next (in priority order)
1. **Aqua Tags wizard steps 4–6** — link the repo → seed the site into the website editor we already have → link/create a company. Each reuses an existing system; the client version is the same flow repackaged. Dogfood on Ed's own sites first. (See the [Aqua Tag dossier](../workspace/aqua-tag.md).)
2. **Command Centre nav link to Aqua Tags** — today only the Channels "Master tags →" button reaches it.
3. **Real emailed connect codes** — retire the `00000` dev bypass (`connectionConfirmation.ts`).
4. **Aqua Tag consent-gated tag manager** — configure GA/PostHog/Meta Pixel through the tag; inject each only when its consent category is granted. (Memory: `aqua-tag-as-consent-tag-manager`.)
5. **Plugin-data erasure hooks** — erasure sweeps top-level `clientId` records but not nested plugin data (leads-pipeline). Needed for fully-complete GDPR erasure.
6. **Radar upgrade + database/storage health** — the bigger piece: move Radar from one monolithic sweep to **typed sweeps** (pulse / deep-synthetic / infra / evidence-rollup / compliance), add **check classification/grouping**, add **real test types** (fixture-golden, sweep-isolation, integration — not just contract tests), and land **database + storage health** as the first new infra signal on that structure. Full design: **[plans/radar-upgrade.md](plans/radar-upgrade.md)**. Related honesty note: [issues.md 9b](issues.md).

## 🌫 Later / backlog
- Rebuild the rest of the product catalogue, one product at a time.
- Meta/Instagram inbox — full pipeline built, switched off (no creds).
- Wire MFA into login (built in `lib/server/mfa.ts` via Supabase, not yet gating).
- Resolve the confirmed duplications (see [issues.md](issues.md)) — fulfilment/fulfillment, two contacts systems.

## ⚠ Decisions to make (not code — Ed's call)
- **Aqua Tag form-capture consent** — the field-value capture is not consent-gated (telemetry is). Deliberate legitimate-interest call, or gate it? (See [issues.md](issues.md).)
- **Database RLS** — confirm/enable Row-Level Security in Supabase (it is not in the repo; service-role bypasses it). (See [issues.md](issues.md).)
- **First git commit** — months of work uncommitted.

_The phase *lifecycle inside the product* (Onboarding→Design→Develop→Published)
is a different thing — that's `lib/portalProducts.ts` `PORTAL_PHASE_LABELS`,
documented in the [feature index](../workspace/feature-index.md)._
