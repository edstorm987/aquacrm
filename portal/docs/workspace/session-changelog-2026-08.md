# Chapter — Recent changes (session of 18–19 Aug 2026)

← Back to [the contents page](../WORKSPACE-FILE-TREE.md)

Everything new/changed in the current push, so nobody hunts for where a feature
landed. **All uncommitted.** Narrative version:
[`SESSION-HANDOFF-2026-08-19.md`](../SESSION-HANDOFF-2026-08-19.md).

## What got built (the arc)

1. **Client-software → portal connections.** The `/connect/[id]` flow: dark
   "cutscene" welcome → sign in → email code (`00000` in dev, **marked to
   replace with real emailed codes**) → staged loader → portal. Agency side:
   create/copy/reset/delete/disconnect + usage/health, in the client-workspace
   Portal tab. Customer self-disconnect from their account page.
2. **Customer setup flow** at `/setup`: welcome (+ optional VSL video via
   `portalWelcomeVideoUrl`) → choose password → add-to-home-screen (PWA manifest
   added). Passwords set via Supabase admin (`.test`-domain guarded).
3. **Standard portal = one Website product**, phases **Onboarding → Design →
   Develop → Published** (de-duplicated into `PORTAL_PHASE_LABELS`). Seeding
   creates only Website; the rest of the catalogue can be added later.
4. **Compliant erasure.** `server/clientErasure.ts` (owner-only, type-to-confirm
   danger zone, cross-collection cascade, keeps one audit entry) + enquiry
   delete (owner-only inbox trash button).
5. **Enquiry 3× duplication fixed** at source — dedupe guard in
   `/api/public/brand-enquiry` (same brand + email/phone within 2 min).
6. **Website → inbox routing.** `server/websiteSources.ts` — register a tagged
   site by host, route to your inbox or a specific client. Config in the inbox
   **Channels** tab + a per-client view in client **Systems**.
7. **Channels made real** — the existing `IntegrationConnectionsPanel`
   (add/edit/test/remove email/SMS/WhatsApp accounts) surfaced at the top of
   Channels; dead status cards removed.
8. **Master tags + Command Centre "Aqua Tags" screen**
   (`/portal/agency/aqua-tags`). Generates the agency master tag; ingestion
   wired so master-tagged submissions arrive in the inbox with host→client
   routing. Wizard **steps 1–3 are live end-to-end** — generate, **detect the
   tag on a domain**, and **scan/count forms** (UI → `/api/portal/aqua-tags/detect`
   → `lib/server/aquaTagDetection.ts`). Steps 4–6 (link repo → seed into editor →
   link/create company) are laid out as still-to-build. Full picture:
   [aqua-tag.md](aqua-tag.md).
9. **Two crash bugs fixed** — `getAgency(...)!` non-null assertions in
   `agency/page.tsx` & `pipelines/[slug]/page.tsx` → guarded redirects.
10. **"Resolve" bug fixed** — `_MasterInbox.tsx` `AlertRow` used a plain `<Link>`
    (navigate-only, never cleared); now dismisses **and** navigates.

## New files (where the new stuff lives)

| Area | Files |
| --- | --- |
| **Connections** | `server/portalConnectionStore.ts`, `lib/server/portalConnections.ts`, `lib/server/connectionConfirmation.ts`, `app/connect/[connectionId]/{page,_ConnectFlow}.tsx`, `app/api/portal/connections/*` |
| **Customer setup** | `app/setup/{page,_CustomerSetup}.tsx`, `app/api/portal/customer/{setup,connections}/`, `app/manifest.ts` |
| **Erasure** | `server/clientErasure.ts`, `app/api/portal/clients/[clientId]/erase/`, `clients/[clientId]/settings/_ClientDangerZone.tsx`, `app/api/portal/website-enquiries/erase/` |
| **Routing / master tags** | `server/websiteSources.ts`, `app/api/portal/website-sources/`, `agency/inbox/_WebsiteSourcesConfig.tsx`, `clients/[clientId]/_ClientTagWorkspace.tsx`, `agency/aqua-tags/{page,_AquaTagsWorkspace}.tsx` |
| **De-dup** | `lib/portalProducts.ts` `PORTAL_PHASE_LABELS` |
| **Tests** | `scripts/smoke-{portal-connections,customer-setup,client-erasure,enquiry-dedupe,website-sources}.test.ts` |

## Still open / next
1. **The Aqua Tags wizard steps** — detect tag live on a domain + scan/count
   forms (reuse `lib/server/aquaTagDetection.ts` + `safeSiteFetch.ts`), then
   repo link → seed into the website editor → link/create a company. Dogfood on
   Ed's own sites first. Add a Command Centre nav link.
2. **Aqua Tag as a consent-gated tag manager** (GA/PostHog/Meta Pixel) — memory
   note `aqua-tag-as-consent-tag-manager`.
3. **Real emailed connect codes** — retire the `00000` dev bypass
   (`connectionConfirmation.ts`).
4. **Plugin-data erasure hooks** — erasure sweeps top-level `clientId` records
   but not nested plugin data (e.g. leads-pipeline). Needed for fully complete
   GDPR erasure.
5. **`scripts/cleanup-junk-enquiries.mjs`** still needs Ed to run it (removes
   ~33 junk live enquiries + stray `@bare-co.test` users; keeps Pranab H + Tom
   Innes; backs up first).
