# Plan — The Aqua Tag as the backbone (the full system)

> **Scope superseded in part on 2026-08-26:** “backbone” means consented
> marketing/analytics telemetry, managed tag injection, form/event routing and
> optional remote inspection. It does not mean editable code authority. A
> repository-backed Dev Workspace uses its isolated branch/worktree as source
> of truth and starts a supervised local preview without requiring Aqua Tag.
> This plan remains authoritative for the Tag capabilities it actually owns.

← [todo.md](../TODO.md) · [development.md](../../development.md) · reference: [aqua-tag dossier](../../workspace/aqua-tag.md)

> **📋 Current state / handoff record: [aqua-tag-handoff.md](aqua-tag-handoff.md)** — what's built across all 6 phases, verification levels, problems, decisions, coordination, and what's next. Read that for "where are we now."

**Status: ✅ SHIPPED in-lane backbone (2026-08-19); auditor FULLY PASSED the consent-gating and catalogue-growth scope.** All six phases have a working shipped slice; the deferred edges are tracked separately: Radar health/firing findings, own/company-site editor scope, a company-facing enquiry view, per-client injection keys and a fuller site-state registry. _(Was mislabelled "PLAN (not built)" long after it shipped.)_ The most important piece — maximum care to get it
right and fit it in. One tag on a site becomes the spine that captures
enquiries, tracks behaviour (with consent), **injects every other tool you'd
normally paste in**, feeds the CRM + Radar, and tells you what's happening — per
company and per client.

## Why this is the backbone
The Aqua Tag is the **observed marketing and telemetry evidence spine** for a
site: its captured forms, consented visitors/events, managed tools and enquiries.
The repository remains code truth when one exists. Set the Tag up per company and
real evidence flows in; without it, the enquiry card, Radar coverage, routing and
analytics have less evidence. "Run it all through the Aqua Tag" means one thing to
install, one consent gate and one managed marketing surface — instead of pasting
GA + GTM + PostHog + a chat widget + a search-console tag + a form handler into
every site by hand.

## Everything the Aqua Tag can do (the accounting — "how much I made of it")
**Already built today** (verified in the [dossier](../../workspace/aqua-tag.md)):
- **Form capture** — the exact submitted fields → enquiries (with labels/types).
- **Behaviour telemetry** — pageviews (incl. SPA route changes), page-load performance, JS errors / promise rejections, form-submit events, **conversions**.
- **Consent model** — reads `aqua-cookie-preferences`, gates analytics/marketing, records consent events. (This is the foundation the injection layer rides.)
- **Custom events** — `Aqua.track(...)` public API.
- **Detection** — server-side detect the tag live on a domain + scan forms (SSRF-safe).
- **Embed SSO** — mint/consume tokens to drop a visitor into their portal.
- **Explorer / visual-editing bridge** — inspect the DOM + live-patch text/images/styles via `postMessage` (the editor integration).
- Anonymous + session identity; URL minimisation; keyed by `data-site-key`.

**To add** (this plan):
- **Injection / tag-manager layer** — inject third-party tools *through* the tag (below).
- **Per-company routing** — the tag can serve your own companies, not just clients.
- **The workspace** — one control tower for all of it.
- **Radar link** — the tag's activity (enquiries, routing, health, injections) is monitored.

## The gaps (why it doesn't fit yet)
1. **`websiteSources` routes to CLIENTS only** (`destinationClientId`). Your own companies are *trading companies*, not clients → their tagged sites can't be linked or routed. The "owner's tag" gap.
2. Company creation has **no tag-setup step** — nothing flows in automatically.
3. **No injection layer** — third-party tools still get pasted per site by hand; the consent-gating advantage is unused.
4. **No workspace** that reflects everything the tag does — so it's invisible and easy to forget.
5. **The tag isn't wired to Radar** — you can't see enquiry flow, routing correctness, or whether injected tools/forms are actually firing.

---

## Part 1 — The Aqua Tag workspace (the control tower, in Fulfilment)
**Decision (Ed): the workspace lives in Fulfilment** — technical delivery is
where setting up a site's tag, forms, tracking, and **tools** belongs (matches
CLAUDE.md "Fulfilment owns technical delivery"; Command Centre stays your
day/monitoring). Moves from the current Command Centre `agency/aqua-tags/` into
Fulfilment. One home reflecting *everything* the tag does:
- **Tags** — master (own sites) + per-client keys: generate, snippet, copy.
- **Sites registry** — every tagged site with its real state: installed? reporting (live/quiet/errors)? forms imported? tools injected? routed where (inbox / client / **company**)?
- **Detect & import** — detect live on a domain, scan + **import** each form's field schema (feeds the [enquiry card](enquiry-detail-card.md)).
- **Tools / injections** (Part 3) — per site, configure which third-party **tools** the tag injects + their consent category. This is the "tools in Fulfilment" surface — the tools live under the Aqua Tag.
- **Link / seed** — link a site → company / client / inbox; seed a site into the website editor (wizard step 5); repo link (step 4).
- **Health & flow** — live/quiet/errors, enquiry volume, routing, injection firing — the Radar view (Part 4).

## Part 2 — Company setup (via the Aqua Tag workspace)
**Decision (Ed): setup lives centrally in the Aqua Tag workspace (Part 1), not
embedded in each surface.** Company creation (Trading Companies editor / battle
table) gets a **"set up tag →"** link into the workspace; the workspace is where
you link that company's site(s), detect/verify, import forms, route enquiries to
the company, and configure injections. **One setup surface, reused for every
company and client — no duplicated flows.** Reuses `TradingCompany.website`.

## Part 3 — The injection / tag-manager layer (the big new capability)
The tag becomes a **consent-aware tag manager**: configure third-party tools once,
per site, and the tag injects each — **gated by the consent it already tracks**.
One tag, one consent gate, compliant by construction (no separate CMP).

**What it injects** (a typed catalogue):
| Kind | Examples | Consent category | Notes |
|---|---|---|---|
| Verification | Google Search Console / Bing `<meta>` | necessary (no tracking) | fires always |
| Analytics | GA4, PostHog | analytics | held until analytics consent |
| Marketing / pixels | Meta Pixel, Google Ads, LinkedIn | marketing | held until marketing consent |
| Tag managers | Google Tag Manager container | analytics/marketing (as configured) | the tag can even bootstrap GTM |
| Tools / widgets | chat widget, custom `<script>` | categorised per tool | arbitrary head/body snippet |

**How it works:**
- **Config store** — per site (per `websiteSource` / company): a list of injections `{kind, id-or-snippet, consentCategory, enabled}`. Configured in the workspace (Part 1). Reuses the memory idea `aqua-tag-as-consent-tag-manager`.
- **Config delivery** — the tag fetches its site's injection config (keyed by `data-site-key`) from a new public endpoint (cached, like `/aqua-tag.js`).
- **Injection logic** — the tag injects each item **only when its consent category is granted** (it already watches `aqua-cookie-preferences` + the consent-updated event; injections that become permitted after consent fire retroactively, like `startAnalytics` does today).
- **Security — Decision (Ed): v1 = allow-list known providers only** (GA4, GTM, PostHog, Meta/Google/LinkedIn pixels, GSC verification) configured **by id/key, no raw `<script>` snippets** → no XSS surface, covers ~90% of what you'd paste. Arbitrary snippets deferred to a later, sanitised, owner-trusted phase.

This **absorbs the standalone "consent-gated tag manager" todo.**

## Part 4 — Tag ↔ Radar (so you know what's happening + route correctly)
**The split (Ed):** setup + management live in **Fulfilment** (Part 1). Data
surfaces in **Command Centre via Radar** — but **scoped by who owns the site**:
- **Your own companies → full data in Command Centre** (you own them, you want the detail).
- **Clients → alerts only in Command Centre** ("XYZ had no enquiries this month", "XYZ traffic dropped high/low") — the full client detail stays in **Fulfilment**. Those alerts come from the **client-health** signal, fed by the tag's per-client enquiry/traffic data. *That mechanism exists but is unfinished/unconnected — see [client-health.md](client-health.md), it's what actually solves this.*

Command Centre owns monitoring; the tag feeds it. Wire the tag's activity into
Radar so enquiries, routing, and health are **watched**:
- **Enquiry flow** — when enquiries hit a site, Radar sees per-site volume/freshness (extends the existing `sales` + `marketing` families to a per-site/per-tag view). "Enquiries hit → you know."
- **Routing intelligence** — Radar knows the routing rule for each site (**master/company vs client**) and flags: unrouted enquiries (landed in the agency catch-all when they should go somewhere), or a site with no routing set. So you *know to route something to a client vs the master tag* — Radar surfaces it as an action.
- **Site health** — the tag reporting (live/quiet/errors), via the existing synthetic + the new infra/telemetry signals; a tagged site that goes silent → blind-spot finding.
- **Injection health** — are the configured tools actually firing? (detect their presence like the tag scan does) → a finding if a configured injection is missing.
- **Auto-seeding** — a company's tagged sites become monitored Radar properties automatically (Radar [auto-seeding](radar-upgrade.md) Part E — already shipping).

## The connective changes (what makes it all fit)
- **`websiteSources` destination** → inbox | client | **company** (add `destinationCompanyId`); `resolveWebsiteSourceRouting` returns whichever. *This is the keystone.*
- **Per-site config** — a store for form schemas (import) + injections, keyed by site.
- **Auto-link** `company.website` → a `websiteSource` at company creation.

## How it stops the guessing
| Downstream | Was guessing | With the tag set up |
|---|---|---|
| Enquiry card | guessed fields | mirrors the real form |
| Third-party tools | pasted per site by hand | injected + consent-gated through one tag |
| Radar coverage | generic pack | the company's real sites |
| Routing | inbox catch-all | the right company/client — and Radar watches it |
| Analytics | blank | real per-company + your GA/PostHog through the tag |

## Phases (simple-first — get *something working*, then deepen)
1. ✅ **Working slice** — in the Aqua Tag **workspace**: link a company's site → show the snippet → detect it's live → **route its enquiries to that company** (the `websiteSources` company destination). Company creation gets a "set up tag →" link into the workspace. A company is tag-linked and enquiries flow in.
2. ✅ **Import forms → enquiry layouts** ([enquiry-detail-card](enquiry-detail-card.md)).
3. ✅ **The workspace registry** (Part 1) — every tagged site + state + management.
4. ✅ **Injection layer** (Part 3) — start with the safe, high-value ones (GSC verification + GA/PostHog IDs), then GTM/pixels, then arbitrary snippets (behind the security decision).
5. ✅ **Radar link, shipped slice** (Part 4) — enquiry-routing and injection-coverage evidence are live; gone-silent, not-firing and should-route flagging remain deferred.
6. ✅ **Editor seed + repo link, shipped client-site slice** (wizard 4–5) — own/company-site editor scope remains deferred.

## Decisions
- ✅ **Routing model — RESOLVED (Ed): add `destinationCompanyId`** — a site routes to inbox / client / **company**. The keystone.
- ✅ **Injection security — RESOLVED (Ed): allow-list known providers** for v1 (GA4/GTM/PostHog/pixels/GSC by id/key, no raw snippets). Arbitrary snippets deferred.
- ✅ **Setup entry — RESOLVED (Ed): the Aqua Tag workspace lives in Fulfilment** (technical delivery — where tag/site/tools setup belongs), with its tools/injections there. Central setup; company creation links to it. Moves from the current Command Centre `agency/aqua-tags/`.
- ⏳ **Config delivery** — bake injections into `/aqua-tag.js` per key, or a separate cached config endpoint the tag fetches? (Fetch = more flexible, one more request.)
- ⏳ **Own companies** — always *trading companies*, or a distinct "my sites" concept?
- ⏳ **Consent categories** — reuse necessary/preferences/analytics/marketing, or add a "tools" category for injected widgets?

## Non-goals (v1)
- Not auto-installing the tag on a site (you paste the snippet; we detect + verify).
- Not real-time — poll/detect based.
- Not a full GGTM replacement — a curated, consent-gated injector, not an arbitrary rules engine (unless the security decision opens it up).

_Leans on: [enquiry-detail-card](enquiry-detail-card.md) (forms → layouts), Radar
[auto-seeding + issues→actions](radar-upgrade.md), the memory note
`aqua-tag-as-consent-tag-manager`._

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/server/websiteSources.ts`
- `src/server/websiteInjections.ts`
- `src/server/websiteFormSchemas.ts`
- `src/lib/integrations/aquaTagSource.ts`
- `src/lib/server/integrations/aquaTagDetection.ts`
- `src/lib/server/safeSiteFetch.ts`
- `src/app/api/public/aqua-tag-config/route.ts`
- `src/app/api/portal/website-injections/route.ts`
- `src/app/api/portal/website-sources/route.ts`
- `src/app/api/portal/website-enquiries/form-template/route.ts`
- `src/app/api/portal/aqua-tags/detect/route.ts`
- `src/app/aqua-tag.js/route.ts`
- `src/app/api/public/form-capture/route.ts`
- `src/app/api/public/brand-enquiry/route.ts`
- `src/app/portal/agency/fulfilment/_AquaTagsWorkspace.tsx`
- `src/app/portal/agency/fulfilment/_FulfilmentWorkspace.tsx`
- `src/app/portal/agency/fulfilment/page.tsx`
- `src/app/portal/agency/inbox/_WebsiteSourcesConfig.tsx`
- `src/app/portal/agency/company/_TradingCompaniesPanel.tsx`
- `scripts/smoke-website-sources.test.ts`
- `scripts/smoke-aqua-tag-injections.test.ts`
- `src/server/types.ts`
- `src/engines/data/radar/radarRuleCatalog.ts`
- `src/engines/data/server/radar/radarObservations.ts`
- `scripts/smoke-radar-classification.test.ts`
- `scripts/smoke-radar-golden-sweep.test.ts`
- `docs/development/plans/aqua-tag-system.md`
