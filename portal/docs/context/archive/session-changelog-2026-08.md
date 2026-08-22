# Chapter — Recent changes (session of 18–19 Aug 2026)

> 🗄 **ARCHIVED 2026-08-21.** Moved here from `docs/workspace/` — it is a dated narrative of the 18–19 Aug 2026 session, not a chapter of the live code map. The running record of every change is **[updates.md](../../development/updates.md)**, which is the one log.

← Back to [the contents page](../../WORKSPACE-FILE-TREE.md)

Everything new/changed in **that** push, so nobody hunts for where a feature
landed. **All uncommitted.** Narrative version:
[`SESSION-HANDOFF-2026-08-19.md`](session-handoff-2026-08-19.md).

> ## ⚠ THIS IS A HISTORICAL RECORD, NOT THE CURRENT STATE (banner added 2026-08-20)
> It describes the session of **18–19 August**. Read the "What got built" list as
> *what happened that day*, and **do not read "Still open / next" as a to-do
> list** — four of its five items shipped within 24 hours of it being written.
> Each is marked inline below with what the source now shows.
> For where things actually stand, use `docs/development/checklist.md`.

## What got built (the arc)

1. **Client-software → portal connections.** The `/connect/[id]` flow: dark
   "cutscene" welcome → sign in → email code → staged loader → portal.
   *(As written that day the code was a dev stand-in. **Real emailed 6-digit
   codes shipped since** — `lib/server/connectionConfirmation.ts`; the dev
   stand-in is `DEV_CONFIRMATION_CODE = "000000"` at `:53`, six zeros, dev-gated.)* Agency side:
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
   [aqua-tag.md](../../workspace/aqua-tag.md).
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

## Still open / next — **as of 19 Aug. Four of these five have since shipped.**
1. **The Aqua Tags wizard steps** — ⚠ **partly done.** Steps 1–3 were already live
   that day; steps 4–6 (repo link → seed into the website editor → link/create a
   company) are the part still genuinely open.
2. ~~**Aqua Tag as a consent-gated tag manager**~~ — ✅ **BUILT** (aqua-tag Phase 4,
   2026-08-19): the consent-gated store + `app/api/public/aqua-tag-config/route.ts`
   + tag injection (`server/websiteInjections.ts` `INJECTION_PROVIDERS`) + the UI.
3. ~~**Real emailed connect codes**~~ — ✅ **SHIPPED.** `connectionConfirmation.ts`
   generates + HMAC-hashes a 6-digit code, 15-min TTL, single-use, 5-attempt
   lockout. The dev bypass is `DEV_CONFIRMATION_CODE` (`"000000"`, dev-gated) — it
   was never `00000`.
4. ~~**Plugin-data erasure hooks**~~ — ✅ **BUILT.** `onEraseClient` is a first-class
   manifest hook (`built-ins/runtime/_types.ts:502-520`) with a declared default
   disposition (incl. `"retain"` for legal hold), implemented by leads-pipeline,
   ecommerce, agency-marketing, email-sender, memberships, affiliates and
   public-funnel; `server/clientErasure.ts:22-57` drives the sweep. Plan:
   `docs/development/plans/plugin-data-erasure.md`.
5. **`scripts/cleanup-junk-enquiries.mjs`** still needs Ed to run it (removes
   ~33 junk live enquiries + stray `@bare-co.test` users; keeps Pranab H + Tom
   Innes; backs up first).


## 2026-08-21 — the Dev Editor becomes the one editor

Roughly 20 commits on `work/2026-08-20-parallel-session`. Headline: there is no
longer a portal editor, a website editor and a code editor — there is ONE Dev
Editor that adapts to what it is pointed at.

- **Projects workspace** at `/portal/dev-team/editor`; the editor is
  `./studio?project=<id>` and exiting returns to the list, so several projects
  are workable at once. A `DevProject` binds repo + branch + the GitHub/Vercel
  CONNECTION IDS + an Aqua Tag; secrets stay in the vault and are resolved at
  call time. Cross-tenant connection ids are rejected.
- **The type selector is gone.** "What is it?" is free text — a project is often
  a codebase AND a site AND the portals it serves. The editor adapts to what is
  CONNECTED, not to a declared label.
- **Real editor**: CodeMirror 6 + VS Code Dark+, language grammars, file-type
  tints, multi-file tabs, session resume.
- **File reading fixed** (`readable` ≠ `editable`), **writing added and then
  hardened after an adversarial review found five real defects** — see the
  status snapshot in `development.md` and `smoke-editor-write-path`.
- **Presence, create file/folder, PR open+merge, Aqua Editor AI, the universal
  "+", mode switch with per-mode colour and cutscenes.**
- Security, unrelated to the editor: cross-tenant `brand_enquiries` read closed
  (`listWebsiteEnquiries` now requires an agencyId).

Left, tracked in `docs/development/plans/dev-editor-checklist.md`: the env
"are you sure" overlay, saved components, binary upload, and the funnel /
client-side editor convergence mapped in `super-editor.md`.
