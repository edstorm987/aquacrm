# Chapter — The Aqua Tag (feature dossier)

← Back to [the contents page](../WORKSPACE-FILE-TREE.md)

The Aqua Tag is one of the app's spine features and it spreads across many
surfaces, so this dossier pulls **every** part of it into one place: the tag
script, its keys and routing, all the **views/workspaces**, the detect/scan
engine, ingestion + telemetry, the endpoints, the data, and what's built vs.
planned.

> **One-line what-it-is:** a single JS tag you paste on a website. It captures
> form submissions and page telemetry, **respects the visitor's cookie
> consent**, and routes what it captures to the right inbox — the agency's, or a
> specific client's.

---

## 1. The tag script
- **`src/lib/aquaTagSource.ts`** — the tag source; `aquaTagResponse()` builds it.
- Served at **`/aqua-tag.js`** (`src/app/aqua-tag.js/route.ts`). Legacy alias **`/milesy-tag.js`** (deprecation headers; keeps old installs alive).
- **Consent-aware:** reads the visitor's choice from `aqua-cookie-preferences` (the same key the website-editor's `CookieConsentBlock` writes) and the `aqua:consent-updated` event, and **gates its own analytics** until consent is given. This is the foundation for the future tag-manager idea (§9).
- Keyed by a **`data-site-key`** on the script tag — that key is what ties a submission back to an agency or client.

## 2. Keys & routing model  (`src/server/websiteSources.ts`)
Two kinds of site key, one routing registry:

- **Per-client key** — `newTelemetrySiteKey()` (`src/lib/server/…`), stored as `telemetrySiteKey` on the client. Identifies a specific client's site.
- **Agency master key** — `ensureAgencyMasterSiteKey(agencyId)`: one stable key per agency, generated on first ask and **kept forever** (the tag lives in people's sites — it must never rotate). The reverse lookup on the ingestion path is `resolveAgencyByMasterSiteKey(siteKey)`. The paste-in snippet is `masterTagSnippet(origin, siteKey)`. Stored in `agencyMasterTagKeys` on `PortalState`.
- **The routing registry** — `websiteSources` (state), a list of `WebsiteSource {host → destinationClientId? | destinationCompanyId?}`. Functions: `listWebsiteSources`, `addWebsiteSource`, `updateWebsiteSourceRouting`, `removeWebsiteSource`, and the resolver `resolveWebsiteSourceRouting(agencyId, host)` → a **`WebsiteSourceDestination`** discriminated union (`{kind:"inbox"} | {kind:"client",clientId} | {kind:"company",companyId}`; defined in `server/types.ts`). `normalizeHost()` reduces a URL to the shared form (`https://www.Cedar-Dental.com/contact` → `cedar-dental.com`) so both a submission and its routing rule match. A site has **one home**: a client, or a company, or the inbox — `add`/`updateWebsiteSourceRouting` enforce client-XOR-company and validate a company via agency-scoped `getTradingCompany`.

**The rule:** master tag → agency inbox by default; a `websiteSources` entry for that host **overrides** it to a **client** (their inbox) or a **company** (one of Ed's own brands, since 2026-08-19). A company-routed enquiry is recorded on the enquiry (`routedCompanyId` in metadata) and — per "the configured route wins" — is *not* also filed onto a client.

---

## 3. The views / workspaces (the different screens)

### a. Fulfilment → **Aqua tags** view  — `src/app/portal/agency/fulfilment/_AquaTagsWorkspace.tsx`
The **`tags`** view of the Fulfilment workspace: `fulfilment/page.tsx` builds the
snippet via `ensureAgencyMasterSiteKey` + `masterTagSnippet` and passes
`<AquaTagsWorkspace>` as the `tagsWorkspace` prop (mirroring the `technical`
view). Reached at `/portal/agency/fulfilment?view=tags` — **moved here 2026-08-19
(plan Phase 3)** from the old Command Centre `agency/aqua-tags/` route (removed;
its `AquaTagsPage` is gone). This is the home of the master tag and the guided
setup, with these live parts:
1. **Your master tag** — the snippet, read-only, with a copy button + the key preview.
2. **Prove it's live** — enter a domain → calls `/api/portal/aqua-tags/detect` → renders a `DetectionResult`: *tag found + N forms*, *a tag with a different key*, or *no tag yet* (with paste-and-redeploy guidance).
3. **Route a site to one of your companies** (Phase 1) — pick a company → its site address (prefilled from the company's `website`) → routes that host's enquiries to the company (`destinationCompanyId`); lists company-routed sites with remove. The agency-wide equivalent is §3c.
4. **Tools & injections** (Phase 4, `ToolInjections`) — configure allow-listed providers (GA4/GTM/PostHog/pixels/GSC) on a site by id/key, with a consent category each; the tag injects them consent-gated. Managed via `/api/portal/website-injections`.
5. **The setup flow** — a 6-step checklist, each honestly labelled Ready / Building next / Planned:
   | # | Step | Status |
   |---|---|---|
   | 1 | Generate the master tag | ✅ Ready |
   | 2 | Detect it on the domain | ✅ Ready |
   | 3 | Scan for forms | ✅ Ready |
   | 4 | Link the repo | 🔨 Building next |
   | 5 | Seed the site into the website editor | ⋯ Planned |
   | 6 | Link the site to a company | ✅ Ready (route its enquiries to that company) |

   The intent (from the file's own header): run the *exact* flow a client's site will run, **on Ed's own sites first** — that dogfood is the real test, and the client version is the same flow repackaged.

### b. Client workspace → Systems tab → **Tagged sites routing**  — `_ClientTagWorkspace.tsx`
`ClientTagWorkspace({clientId, clientName})`. The client-scoped view of the
routing registry: list the sites routed to *this* client (from
`/api/portal/website-sources` filtered by `destinationClientId`), add a host
(destination fixed to this client — you're already in their workspace), remove a
host. So a tagged site's enquiries land on the client, not the agency inbox.

### c. Inbox → Channels → **Website sources & routing**  — `_WebsiteSourcesConfig.tsx`
The agency-wide version of the same registry (the entry point Ed reaches from the
inbox): see every tagged source, route each to the inbox, a client, **or one of
your own companies** (company-aware since 2026-08-19 — grouped destination
picker, company badge; the picked value carries its kind so client-XOR-company
holds), plus the master-tag reference. This is where "which submissions go where"
is configured across all sites — the company-complete sites registry (Part 1).

### d. Performance → **Aqua Tag dashboard**  — `_AquaTagDashboard.tsx`
`AquaTagDashboard({client, period, onReportsChange})` — the **analytics** view:
per-client telemetry + monthly performance reports (`MonthlyPerformanceReport`)
over a period. ⚠ This overlaps the Aqua Tags Command Centre screen conceptually
(both are "the tag" surfaces) — see the [hazards chapter](hazards-and-duplication.md).

### e. Dev Team → **API & MCP** — `src/app/portal/dev-team/api/_MasterTagPanel.tsx`
**Read-only, and deliberately not a fifth workflow.** The tag seen as what it is
alongside the API keys and the vault: a machine surface with a permanent
credential. Shows the site key, the paste snippet (`masterTagSnippet`), the
**three endpoints the tag actually calls** (`/api/public/aqua-tag-config`,
`/api/public/form-capture`, `/api/telemetry/collect`) and the injectable
allow-list — all **derived** from `AQUA_TAG_SOURCE` / `INJECTION_PROVIDERS`,
never retyped. Detection, routing and injection *config* are NOT duplicated: it
links to §3a. Founder + Dev Mode only.
- It warns when `NEXT_PUBLIC_PORTAL_BASE_URL` is unset, because
  `connectionLinkOrigin()` then falls back to the request origin and the snippet
  would be pasted into a real site pointing at a dev host.
- ⚠ It also states the hazard the other views don't: `agencyMasterTagKeys` lives
  on `PortalState`, so a sandbox reset destroys a key **that is already deployed
  inside other people's sites**.
- Drift guard: `smoke-aqua-tag-injections.test.ts` asserts the tag's endpoint set
  equals exactly what the page surfaces — a fourth endpoint fails the suite.

---

## 4. Detect & scan engine  (built — `src/lib/server/`)
The step-2/3 logic is real, not stubbed:
- **`aquaTagDetection.ts`** — `detectAquaTag({rawUrl, masterSiteKey})` fetches a domain and reports `{reachable, tagPresent, keyMatches, detectedSiteKey, forms}` (network failures come back as `reachable:false` with a plain reason, never a throw). `analyzeAquaTagHtml(html, masterSiteKey)` is the pure analyzer; `scanFormsInHtml(html)` counts forms the way the tag decides what to capture (explicit `data-aqua-form`/`data-aqua-capture`, or plain forms).
- **`safeSiteFetch.ts`** — the **SSRF-guarded** fetch it uses (blocks internal hosts). Reuse this for any "go fetch a user-named URL" work.
- Endpoint: **`POST /api/portal/aqua-tags/detect`** (agency-scoped).

## 5. Ingestion & telemetry
- **`POST /api/public/form-capture`** *(LIVE Supabase)* — the Aqua-Tag form-capture path: resolves the agency by master key, applies host→client routing, writes a real enquiry.
- **`POST /api/public/brand-enquiry`** *(LIVE `brand_enquiries`)* — website enquiry submission; carries the same routing + a 2-minute **dedupe guard**.
- **`POST /api/telemetry/collect`** *(LIVE `website_consent_events`)* — page telemetry + consent events, CORS + consent-gated.
- **`src/server/agencyWebsite.ts`** — records/summarises agency-site telemetry (`recordAgencyWebsiteTelemetry`, `resetAgencyWebsiteTelemetryKey`, `summarizeAgencyWebsite`). Client telemetry mirrors this via `/api/tenants/client-telemetry` + `lib/…/clientTelemetry`.

## 6. Embed (tag-adjacent)
`src/lib/server/aquaEmbedToken.ts`, `embedAllowResolver.ts`,
`src/lib/aquaExplorerBridge.ts`; endpoints `/api/v1/embed/sessions` (mint) +
`/api/v1/embed/consume` (redeem → end-customer session). Lets a tagged site drop
a visitor straight into their portal.

## 7. Endpoints at a glance
| Endpoint | Purpose | Live? |
|---|---|---|
| `GET /aqua-tag.js` | Serve the tag script | |
| `GET /api/public/aqua-tag-config` | Serve a site's enabled injections (by key+host), cached + CORS-open — the tag-manager delivery seam | |
| `POST /api/portal/aqua-tags/detect` | Verify tag live on a domain + count forms | |
| `GET, POST /api/portal/website-sources` | Routing registry list/add/remove/update | |
| `GET, POST /api/portal/website-injections` | Manage a site's injected tools (list/add/update/remove) + provider catalogue | |
| `GET, POST /api/portal/website` | Agency site config + telemetry key | |
| `GET, POST /api/tenants/client-telemetry` | Per-client telemetry key manage/reset | |
| `POST /api/public/form-capture` | Tag form-capture + master-tag routing | **LIVE** |
| `POST /api/public/brand-enquiry` | Enquiry submit + dedupe + routing | **LIVE** |
| `POST /api/telemetry/collect` | Telemetry + consent events | **LIVE** |

## 8. Data (state collections)
`agencyMasterTagKeys` (agency → master key), `websiteSources` (routing rules),
`websiteSiteConfigs` (per-site injection config — see `server/websiteInjections`),
`telemetrySiteKey` on each `Client`, agency-site telemetry on `agencyWebsites`,
and — live in Supabase — `website_consent_events`.

## 9. Consent model & the tag-manager (foundation built — Phase 4)
The tag already reads `aqua-cookie-preferences` and gates analytics on it
(`permitted(category)` over `necessary/preferences/analytics/marketing`). The
evolution (plan Part 3, memory note `aqua-tag-as-consent-tag-manager`): configure
GA / GTM / PostHog / pixels / Search Console **through the Aqua Tag**, each
injected only when its consent category is granted — one consent-compliant tag
instead of a separate CMP.

**Foundation shipped (2026-08-19):** `server/websiteInjections.ts` — a per-site
config store (`websiteSiteConfigs`) + an **allow-listed provider catalogue**
(`INJECTION_PROVIDERS`) validated **by id/key only, no raw `<script>`** (Ed's
resolved security decision; each provider has a strict `valuePattern`).
`listEnabledInjectionsForHost` is the delivery seam.

**Delivery + injection shipped (2026-08-19, browser-verified):** the cached
`GET /api/public/aqua-tag-config` endpoint (key+host → enabled injections) and
`aquaTagSource.ts` fetching it (`loadInjections`/`runInjections`) and injecting
each tool **only when its consent category is `permitted()`** — retroactively on
a consent change, the same way `startAnalytics` fires. Recipes for GA4/Google Ads
(gtag), GTM, Meta Pixel, PostHog, LinkedIn, GSC `<meta>`; every tool wrapped and
the fetch `typeof fetch`-guarded so nothing can break the site or form-capture.
The served tag was confirmed to parse in real V8 on `:3032`.

**UI + full loop shipped (2026-08-19, browser-verified end-to-end):** the managed
API `POST/GET /api/portal/website-injections` (agency-scoped, over the store) +
the **"Tools & injections"** section (`ToolInjections`) in the Aqua tags view
(pick a site → provider → id/key → consent, enable/disable/remove). Walked live on
`:3032`: configure a GA4 id → `GET /api/public/aqua-tag-config` serves it →
cleaned up. **Remaining:** per-client-key sites (v1 resolves the master key), and
the inherent "a real tag script loads on a real external page" (needs a live site).

**Gate hardened to FAIL-CLOSED + behaviourally proven (2026-08-19, audit
follow-up):** `runInjections` used to read `permitted(item.consentCategory ||
"necessary")` — a config item that arrived with **no** (or an unrecognised)
consent category was treated as `necessary` and injected **before any consent**.
It now reads `permitted(item.consentCategory)`, so an unlabelled or unknown
category is **held** (and stays held even under full consent — the visitor never
consented to whatever it is). The server always sets a validated category
(`normalizeConsent` in `server/websiteInjections.ts`), so this only changes the
malformed case: a config gap can no longer leak a tag.
The gate was previously only pinned by **source-shape** assertions, which cannot
show a tag actually stays off the page. `scripts/smoke-aqua-tag-consent-injection.test.ts`
now **VM-executes the real `AQUA_TAG_SOURCE`** (the `smoke-consent-capture.test.ts`
harness) against a fake DOM + a stubbed config endpoint and asserts on what
reaches `document.head`: analytics injection + no consent → **not injected** (and
the config *was* fetched, so it's a gate not a miss) → `applyPreferences`
granting analytics → **injected**, retroactively, with no re-fetch. Also covers:
rejection keeps it out · analytics consent doesn't unlock marketing (and later
marketing consent releases exactly that one, idempotently) · `necessary` still
fires immediately · unlabelled/unknown categories never fire.

## 10. Built vs planned (accurate as of this session)
- **Built & live:** the tag script + consent gating; master key + snippet; the routing registry and all three routing views; **detect + form-scan (steps 1–3 of the wizard, end-to-end UI→API→lib)**; form-capture/enquiry ingestion with routing; telemetry + consent collection; embed tokens.
- **Company routing (step 6) — shipped 2026-08-19 (aqua-tag plan Phase 1):** a tagged site routes to a **company** (`destinationCompanyId` → the `WebsiteSourceDestination` union), the workspace has a **"Route a site to one of your companies"** control, both live ingestion paths record a company route, and company cards link **"Set up Aqua tag →"**. (Routing is correct + recorded; a company-*facing* enquiry surface is later.)
- **Consent-gated tag-manager (§9) — shipped 2026-08-19 (Phase 4):** the injection config store, the public config endpoint, the tag-side injection, and the "Tools & injections" workspace UI — browser-verified end-to-end.
- **Tag → Radar (Phase 5) — two slices shipped 2026-08-19:** `sales:enquiry-routing` (how many tagged sites route to a specific client/company vs the agency catch-all, from `websiteSources`) + `development:injection-coverage` (sites injecting tools, from `websiteSiteConfigs`) — both informational radar families feeding the evidence vault. Remaining: the **flagging findings** (site gone silent, a tool not firing, unrouted-when-it-should-route) — need network detection / correlation logic.
- **Wizard steps 4–5 (repo + editor seed) — Phase 6 slice shipped 2026-08-19:** the website editor (`built-ins/modules/website-editor` `SitesPage`) already discovers a deployed site's repo + injects the tag + seeds it for editing (client-scoped). `_WebsiteSourcesConfig` now links each **client-routed** tagged site to that client's editor. **Own-site editing** (agency/company sites) is the remaining gap — the editor is per-client, so agency-scoping it is a focused editor-territory pass.
- **Not yet:** the rest of Phase 5 (site/injection *health* findings — need the probe pipeline). This reuses systems that already exist (Radar), so it's "the same flow repackaged."

## 11. ⚠ Watch-outs
- **Two "tag" surfaces:** `agency/aqua-tags/_AquaTagsWorkspace` (setup/master tag) vs `agency/performance/_AquaTagDashboard` (analytics). Keep setup in the former, analytics in the latter; don't merge blindly.
- **The master key must never rotate** (`ensureAgencyMasterSiteKey` is deliberately generate-once) — live tags in the wild depend on it.
- **Routing is host-normalised** — always compare via `normalizeHost`, never raw URLs.

## 12. Verified internals (from a full read of `aquaTagSource.ts`, 590 lines)

**Served** by `aquaTagResponse()`: `cache-control: public, max-age=300,
stale-while-revalidate=3600`, `access-control-allow-origin: *`. The script is
**byte-identical for everyone** — it reads its own key at runtime from
`document.currentScript`'s `data-site-key`; endpoints are derived relative to
`script.src`, so it posts back to whichever origin served it. `/milesy-tag.js`
serves the same body with `deprecation: true` + `sunset` headers.

**Every behaviour, consent-gated or not:**
| Behaviour | Trigger | Consent-gated? | Endpoint |
|---|---|---|---|
| Pageview | load + `pushState`/`replaceState`/`popstate` | **Yes** (analytics) | `/api/telemetry/collect` |
| Performance (`load`) | on `load` | Yes | telemetry |
| JS error / promise rejection | window handlers | Yes | telemetry |
| Form-submit *event* (count only) | capturing `submit` | Yes | telemetry |
| **Form CONTENT capture (field values)** | same `submit` | **NO — always runs** | `/api/public/form-capture` |
| Conversion | click `[data-aqua-conversion]` | **Yes** (marketing) | telemetry |
| Consent event | `aqua:consent-updated` | No — always | telemetry |
| Custom `Aqua.track()` | public API | depends on category | telemetry |
| Explorer / visual-edit channel | `postMessage` | **NO — always active** (parent frame only) | postMessage |

**Form-capture decision chain** (`capturableForm`): skip if inside
`[data-aqua-ignore]`; capture if `data-aqua-form`/`data-aqua-capture`; **never**
if it has a password input; else capture iff it asks for email/phone. Per field
(`captureableField`): rejects password/hidden/file/search, names matching
`/(pass|pwd|secret|token|csrf|otp|cvv|card|iban|ssn|nino)/i`, and `cc-`/
`*-password` autocomplete — **cannot be switched off by config**. Caps: ≤60
fields, values ≤2000, keys ≤120; same-name fields merged.

**Consent model:** `localStorage["aqua-cookie-preferences"]`, event
`aqua:consent-updated`. `normalizePreferences` returns *no consent* unless
`version===1 && necessary===true`. Four categories: necessary/preferences/
analytics/marketing. When analytics flips off→on, `startAnalytics()`
retroactively fires pageview + performance. **URLs are minimised at source** —
`safeUrl` sends origin+pathname only (query/hash/credentials never leave the page).

**Telemetry payload** (`sendBeacon`, else `fetch keepalive`): whitelisted data
keys only (`message` redacted for emails/phones/URLs), `siteKey`, `anonymousId`,
`sessionId` (analytics/marketing only), category, type, consent flags,
`occurredAt`, safe `url`/`path`/`title`/`referrer`. **Form-capture payload**:
siteKey, formName, `fields[]`, pageUrl/path, submittedAt.

**Detection** (`analyzeAquaTagHtml`): `tagPresent` = regex for an aqua-tag
`<script src>`; `keyMatches` = detected `data-site-key` === agency master key
(exact); `scanFormsInHtml` mirrors `capturableForm` on static HTML (can't see
per-field rejections the live tag applies).

**SSRF** (`safeSiteFetch`): timeout 8s/hop, ≤5 redirects, ≤512KiB body; rejects
embedded credentials; `assertPublicDestination` re-runs on **every** hop
(defeats DNS-rebinding), blocking reserved hostnames (`.local/.internal/.test/…`)
and private/reserved IP ranges (10/8, 127/8, 169.254 incl. cloud metadata,
172.16–31, 192.168, CGNAT, ULA/link-local IPv6); non-IP → unsafe by default.

**Embed token** (`aquaEmbedToken.ts`): `base64url(payload).base64url(HMAC-SHA256)`;
TTL clamped 30–300s; HMAC from `AQUA_EMBED_SIGNING_SECRET` (throws in prod if
unset); mint API bearer-gated by `AQUA_EMBED_API_TOKEN`. `consume` verifies →
issues a real session → redirects into the portal. Reverse direction
(`embedAllowResolver.ts`): an empty/unknown allow-list ⇒ `frame-ancestors 'none'`
(default-deny).

### ⚠ Security findings (verified — worth your attention)
- **A. Form-content capture is NOT client-side consent-gated.** The field-value POST to `/api/public/form-capture` runs regardless of the cookie choice (subject to the `capturableForm`/field filters), and the server route has **no** consent check. Telemetry, by contrast, is double-gated (client `permitted()` + server `eventIsConsented`). Worth a deliberate decision: is capturing enquiry fields from a visitor who declined analytics/marketing intended? (It's arguably legitimate-interest for a form they submitted, but it's an asymmetry to be aware of.)
- **B. Consent flags are self-reported.** The server trusts the `consent*` booleans the tag puts in the body — no server-side source of truth ties them to the stored preference.
- **C. `/api/public/form-capture` has no body-size cap** (telemetry caps at 32KiB); it relies on field-count/length caps only.

## 13. Tests
`scripts/smoke-aqua-tag-detection.test.ts`, `smoke-consent-capture.test.ts`,
`smoke-website-sources.test.ts`, `smoke-enquiry-dedupe.test.ts`.
