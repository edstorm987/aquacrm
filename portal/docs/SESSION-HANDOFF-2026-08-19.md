# Session handoff — 19 August 2026

Written to resume cleanly in a fresh chat. This is the single entry point.
For the honest state-of-the-app map, read `docs/WHERE-WE-ARE.md` too.

## Start here

```bash
npm run dev:sandbox:real       # milesymedia data — Ed's working sandbox (already running)
# Run the FULL test suite safely (memory backend keeps stateful tests off the sandbox):
PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts
```

- **1,419 tests passing. Typecheck clean.**
- **Nothing is committed** — `origin/main..HEAD` is 0, ~180 files in the working
  tree. Months of work unsaved in git. A first commit to lock it in is worth
  doing — Ed's call, nothing commits without him asking.
- **All data is Ed's own test data. No real clients yet** (pre-launch). The one
  real-ish thing is a "Pranab H" website enquiry. Cleanups are low-stakes.
- **Clean demo client to look at: "Northlight Studio"** (on the milesymedia
  tenant), sitting on the one standard Website product.

## What this long session built (the arc)

1. **Client-software → portal connections.** `/connect/[id]` flow: dark
   "cutscene" welcome → sign in → email code (`00000` in dev) → staged loader →
   portal. Agency side: create/copy/reset/delete/disconnect + usage/health, in
   the client workspace Portal tab. Customer can self-disconnect from their
   account page. Customer **setup** flow at `/setup`: welcome (+ optional VSL
   video, set via `portalWelcomeVideoUrl` on the Portal tab) → choose password
   → add-to-home-screen (PWA manifest added). Passwords set via Supabase admin.
2. **Standard portal = one Website product**, phases **Onboarding → Design →
   Develop → Published** (de-duplicated into `PORTAL_PHASE_LABELS`). Seeding
   creates only Website; the rest of the catalogue is available to add later.
3. **Two crash bugs fixed** (`getAgency(...)!` in `agency/page.tsx` &
   `pipelines/[slug]/page.tsx`).
4. **Data cleanup + compliant erasure.** Archived the junk products/clients,
   scrubbed the slur locally, built one clean client. Built **client erasure**
   (`server/clientErasure.ts`, owner-only, type-to-confirm danger zone, keeps
   an audit entry) and **enquiry delete** (owner-only, inbox trash button).
5. **Enquiry 3× duplication fixed** at source — dedupe guard in
   `/api/public/brand-enquiry`.
6. **Website → inbox routing.** `server/websiteSources.ts` — register a tagged
   site by host, route to your inbox or a specific client. Config in the inbox
   **Channels** tab, and a per-client view in the client **Systems → Monitoring**.
7. **Channels made real** — the existing `IntegrationConnectionsPanel` (add/
   edit/test/remove email/SMS/WhatsApp accounts) surfaced at the top of the
   Channels tab; dead status cards removed; email connections carry their sender.
8. **Master tags + Command Centre "Aqua Tags" screen** (`/portal/agency/aqua-tags`).
   Generates the agency master tag; ingestion wired so master-tagged submissions
   arrive in the inbox (with host→client routing). The full setup wizard is laid
   out but only "generate" is live.

## What's next (in priority order)

1. **The Aqua Tags wizard** (`_AquaTagsWorkspace.tsx`). **Steps 1–3 now ship
   live** — generate, detect-on-domain, and scan/count-forms are wired
   end-to-end (`/api/portal/aqua-tags/detect` → `lib/server/aquaTagDetection.ts`,
   SSRF-safe via `safeSiteFetch.ts`). The remaining steps, one at a time —
   each reuses an existing system, client version = same flow repackaged:
   - Link the repo → seed the site into the **website editor** we have →
     link/create a **company**.
   - Add a Command Centre **nav** link (only the Channels "Master tags →" button
     reaches it today).
   - Full picture of the whole feature: `docs/workspace/aqua-tag.md`.
2. **Ed's tag-manager idea** — Aqua Tag as a consent-gated manager for
   GA/PostHog/Meta Pixel (the tag already tracks consent). See the memory note
   `aqua-tag-as-consent-tag-manager`.
3. **Connect flow email codes** — `00000` is a dev stand-in; the flow can't
   complete in production until real emailed codes exist (`connectionConfirmation.ts`).
4. **Plugin-data erasure hooks** — client erasure sweeps top-level `clientId`
   records but not nested plugin data (leads-pipeline). Needed for a fully
   complete GDPR erasure.
5. **Meta/Instagram inbox** — full pipeline built, switched off (no creds).

## Caveats that bite (read before touching things)

- **Live Supabase is not sandboxed.** `PORTAL_BACKEND=file` guards the state
  file only; the admin client reads env, so it hits the *real* auth/enquiry
  project. The env's safety classifier **blocks scripts that hard-delete live
  rows** — that's why `scripts/cleanup-junk-enquiries.mjs` exists for **Ed to
  run himself** (deletes ~33 junk enquiries, keeps Pranab H + Tom Innes;
  removes stray `@bare-co.test` users). Everything is backed up in the session
  scratchpad.
- **Dev/demo sessions load ZERO website enquiries** (`inbox/page.tsx`,
  `session.isDemo ? Promise.resolve([])`). So the enquiry delete button and
  master-tag ingestion only show in a *real* (non-demo) inbox. Don't conclude
  they're broken from the sandbox.
- **The junk enquiries are in live Supabase**, still there until Ed runs the
  cleanup script.
- **Duplication is the app's main "chaos"** (see `WHERE-WE-ARE.md`): two
  Contacts systems, two Fulfilment systems, a spare finance module copy.

## New files this session (where the new stuff lives)

- Connections: `src/app/connect/`, `src/app/api/portal/connections/`,
  `src/lib/server/connectionConfirmation.ts`, `src/server/portalConnectionStore.ts`.
- Customer setup: `src/app/setup/`, `src/app/api/portal/customer/setup/`,
  `src/app/api/portal/customer/connections/`, `src/app/manifest.ts`.
- Erasure: `src/server/clientErasure.ts`,
  `src/app/api/portal/clients/[clientId]/erase/`,
  `.../settings/_ClientDangerZone.tsx`,
  `src/app/api/portal/website-enquiries/erase/`.
- Routing / master tag: `src/server/websiteSources.ts`,
  `src/app/api/portal/website-sources/`,
  `src/app/portal/agency/inbox/_WebsiteSourcesConfig.tsx`,
  `src/app/portal/clients/[clientId]/_ClientTagWorkspace.tsx`,
  `src/app/portal/agency/aqua-tags/`.
- Tests: `smoke-portal-connections`, `smoke-customer-setup`,
  `smoke-client-erasure`, `smoke-enquiry-dedupe`, `smoke-website-sources`.

## The standing rules (unchanged)

- Don't commit/push/deploy or touch git history unless Ed asks.
- Run the FULL suite (`scripts/*.test.ts`, with `PORTAL_BACKEND=memory`) before
  calling a behaviour change done.
- Talk to Ed plainly and simply — short, honest, no dense walls. He's been on
  this for months; don't overwhelm. See the memory notes.
