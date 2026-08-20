# Session handoff — 18 August 2026

Written at the end of a long session so the next one starts with facts rather
than a summary of a summary. Nothing here is committed; it is all uncommitted
working tree.

## How to pick up

```bash
npm run dev:sandbox:real       # milesymedia data — the real shape
npm run dev:sandbox            # Bare Co — clean room
# Walk the connect flow: become a customer of any sandbox client, then
# paste the link. Dev-mode gated; see the TEMPORARY note in /dev.
open 'http://localhost:3032/dev?client=<clientId>&to=/connect/<connectionId>' 
PORTAL_BACKEND=file npx tsx scripts/seed-bare-co-portal.ts   # after any restore
PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' \
  npx tsx --test scripts/*.test.ts
```

1,390 tests passing. Typecheck clean. `origin/main..HEAD` is 0 — nothing
committed or pushed all session, per the standing rule.

**Run the suite with `PORTAL_BACKEND=memory`.** The nine unpinned stateful
tests are what wipe the local sandbox; the env var pins them along with
everything else, and the whole suite still passes. Verified byte-for-byte
against a snapshot: nothing touched the sandbox, and the dev server can stay
running. Without it, restore from the snapshot and re-run the Bare Co seed
afterwards.

## Finished and verified in a browser

- **Task templates + checklists.** Eight built-ins; accepted actions arrive
  with their steps already attached, mapped by alert family. Custom templates
  can claim a family and beat the built-in.
- **Deferral tracking.** Parked work counts up and says "Put off 3×"; work
  deferred three times is promoted one tier so it escapes the attention shield.
- **Actions and Master Inbox now share one queue.** Actions previously read the
  raw alert list, so parking or dismissing there lasted until the next refresh.
- **Form capture.** The Aqua Tag captures every field, the form, the page and
  the purpose; the inbox shows the whole submission. Never touches password,
  payment or token fields; refuses forms containing a password.
- **Radar evidence.** The vault is keyed by `series.id` but was looked up by
  `sourceId`; 216 of 3,090 checks resolved and 1,505 more had history nothing
  found. Fixed — the graphs on Radar alerts are the visible result.
- **Repository tab in the Portal Studio.** Browse the repo, scope filter
  ("Just home files" narrows 1,747 → 8), click an element in the preview and it
  opens the file at the line that rendered it.
- **Three editing modes** — Just the words / Design it / Developer — gating the
  inspector tabs.
- **The whole connect flow, walked end to end.** Two screens and a loader, in
  one component (`_ConnectFlow.tsx`) rather than spread across page loads —
  it is one continuous act, and splitting it made it feel like four unrelated
  errands. "Welcome, {client}" with the sign-in **on the page** (posting to
  `/api/auth/login`, no bounce to `/login`), then "Nearly there" for the code,
  then a staged loader, then the portal. A step bar shows how much is left.
  A wrong code is refused without saying which kind of wrong. The link is
  checked for life *before* anyone is asked to sign in, so a dead link never
  costs somebody a login.

  **The loader's stages are real.** Confirming your code / Linking your
  software / Securing the connection / Opening your portal — each names part
  of the one round trip that is genuinely happening. It runs on a timer
  because a single request has no intermediate events to report, but the final
  stage does not complete until the server has actually answered, so it can
  look unhurried without ever claiming to be done before it is. A test pins
  that, and pins that no invented stage creeps in later.
- **Anybody signed in on the wrong account gets the sign-in screen**, not a
  wall. A first pass intercepted agency sessions with a "this is your own link"
  explainer; that was wrong, because Ed doing the setup *is* the normal case,
  so the explainer stood between him and the thing he was trying to see. Now
  the flow shows with a quiet line naming who is currently signed in.
  Completing is still gated by `canCompleteConnection` against stored state —
  finishing from an agency sign-in would bind the connection to Ed rather than
  to the account the software belongs to.
- **The connect screens have their own look.** Dark, ambient, drifting colour,
  a glass card, one scene fading to the next — it is reached from somebody
  else's software, outside the portal chrome, and it is the one moment where
  Aqua introduces itself. All motion stops under `prefers-reduced-motion`
  (`globals.css`, "Connect flow"). The greeting names the account
  ("Welcome, ddddd"), which reverses an earlier decision to withhold the
  business name pre-sign-in — the link was sent to somebody who already knows
  whose account it is.
- **The connection screen.** Client workspace → Portal tab → "Connected
  software". Name the software, get a link, copy it, withdraw it. The name is
  prefilled from what Aqua already knows the client runs — properties of kind
  `software`, then `client-portal`, then `website`, then the website host —
  so it is a confirmation rather than a blank box. A new link is copied to the
  clipboard the moment it exists, quietly: the link is on screen with a button
  beside it, so a convenience that did not fire is not worth a red message
  under a link that worked. An explicit Copy that fails does say so. Pending
  links show what remains of their seven days; expired ones say they have
  stopped working and offer a replacement, because that failure happens at the
  client's end where Ed never sees it. Withdrawn connections stay on screen
  under a fold. Driven end to end in a browser, light and dark: create, copy,
  withdraw, reload, and the copied link resolves to the consent page.

## Built and tested but never run in a browser

Everything below typechecks and has unit tests. None of it has been exercised
end to end. Treat it as unproven.

- **Portal connections** — `/connect/[id]`, consent page, accept endpoint.
- **Supabase MFA** — enrolment and verify routes, the assurance gate on
  consent, and `TwoFactorSetup`. **Enable MFA in the Supabase dashboard first**
  or `mfa.enroll` fails regardless of this code.
- **Editing leases and the client overlay** — built, mounted nowhere.
- **The commit path** — registry, patch, hash check, branch publish. Has never
  run against a real repository, which is why the repo editor has no Save.

## Who can actually reach what

Checked against the layouts on 18 Aug 2026, because the assumed model differed
from the code in two places.

| Surface | Gate | Who gets in |
| --- | --- | --- |
| `/portal/agency` | `requireRole([...AGENCY_ROLES])` | Agency only. `agency-staff` is bounced on to `/portal/team`. |
| `/portal/clients/[clientId]` | `requireRoleForClient([...ALL_ROLES], clientId)` | **Not agency-only.** Agency roles reach any client; `client-owner`, `client-staff`, `freelancer` and `end-customer` reach their own. |
| `/portal/customer` | `requireRole("end-customer")` | **End customers only.** Agency users are redirected to `/portal`. |
| `/client-preview/[clientId]` | `requireRole([...AGENCY_ROLES])` | Agency only — this is how the agency sees a customer portal. `?manage=1` switches the audience from `customer` to `agency`. |

So the customer portal is not "both": there are two routes onto the same
content, one per audience. And the client workspace is not agency-only —
anybody scoped to that client can open it. Whether it *should* be agency-only
is a real decision and is not made.

## Decisions made, so they are not relitigated

- **Portals connect by link, not iframe.** The client's app has an `Aqua`
  sidebar item opening a new tab. Each side keeps its own session; nothing
  depends on third-party cookies. Settled — see
  `portal-tiers-and-fractal-fulfilment.md`.
- **Connection over minted tokens.** A minted token is a credential in a URL.
  The connection id grants nothing; security comes from authenticating at Aqua.
  `portalHandoff.ts` is the older approach and is now largely superseded —
  keep it only if deep links into specific portal pages are wanted.
- **One editing engine, adapters per surface.** `src/engines/editor/editing/engine.ts`.
  Three server editors migrated onto it and all three gained conflict
  detection they never had. The Portal Studio is *not* migrated and probably
  should not be — it already has draft/publish and version history.

## Next, in order

1. **Replace the confirmation-code stand-in with real emailed codes.**
   `src/lib/server/connectionConfirmation.ts` — the file says what to delete
   and what has to take its place. `00000` is accepted **only** when
   `isDevModeEnabled()`, which requires `PORTAL_DEV_MODE=true`, a
   non-production `NODE_ENV`, no `VERCEL_ENV`, and a file or memory backend —
   so it physically cannot confirm against real data. Everywhere else the
   accept endpoint refuses with "Email confirmation is not switched on yet",
   which means **the connect flow does not work in production until this is
   built**. That is deliberate and fail-closed, but it is a live gap, not a
   nicety.

   Supabase TOTP is no longer on this path. `mfa.ts`, `TwoFactorSetup` and
   `/api/portal/mfa/*` are untouched and still the intended long-term
   mechanism — nothing calls them now.

2. **Decide whether the client workspace should be agency-only.** Today
   `client-owner`, `client-staff`, `freelancer` and `end-customer` can all
   open `/portal/clients/[clientId]` for their own client. If that is not
   intended, the gate is one line in that layout — but check what client-side
   staff are expected to use first.

3. **A client account Ed can actually sign into.** How setup really works:
   Ed provisions the client, signs in *as them* with a generated password,
   embeds and proves the connection, and only then hands over — an email that
   lets the customer set their own password. Connecting software is technical
   setup work; a customer should never be asked to do it.

   What exists: the handover. "Send customer access" on the Portal tab emails
   a magic link (`/login/magic?token=…&return=/portal/customer`).

   What does not: the generated password Ed holds beforehand.
   `mustChangePassword` provisioning exists for agency *staff*
   (`/api/portal/people`) and is the template, but there is nothing equivalent
   for a customer. And the wall is the same one as everywhere else —
   `/api/auth/login` authenticates against Supabase, so a locally generated
   scrypt hash lets nobody in, Ed included. The account has to exist in
   Supabase Auth before either of them can use a password.

   Until that lands, `/dev?client=<id>` is the only way to be a customer, and
   it only works in the sandbox. This is the same blocker as the connect flow's
   confirmation codes, wearing different clothes: both need a real customer
   identity in Supabase.

4. **The Aqua Tag heartbeat is now the keystone.** Three things go live the
   moment it reports `lastSeenAt`/`uses`: the connection screen's "last
   reported", the agency panel's usage count, and the radar's
   `portal-connections` freshness lens (blind until then). All three are built
   and honest about the gap; none needs changing when the heartbeat arrives.

5. **The client's own disconnect.** The consent page promises "You can
   disconnect at any time and this stops working." Nothing on the client side
   keeps that promise yet; today only Ed can withdraw. The store already
   scopes by agency, so this needs a client-scoped path of its own rather than
   a widened role check.
5. **Prove the commit path** on a scratch repository, then wire Save into the
   repo editor. Needs Ed's explicit go-ahead — nothing pushes without it.
6. **Aqua Tag heartbeat** → `lastSeenAt` and `uses`. See point 4: it is now
   the single thing three separate surfaces are waiting on.
7. **Tier field on the client record.** Small, and everything conditional
   about tiers depends on it.

## Connection management, agency side — new

The Portal tab's "Connected software" panel now carries the full technical
controls Ed asked for, each backed by an API action on
`/api/portal/connections` and a store function scoped by agency:

- **Reset link** (`resetPortalConnectionLink`) — withdraws the current link and
  copies a fresh one in its place, in one mutation, so there is never a moment
  with two live links or none. The new one carries `replacedId` back to the old.
- **Delete** (`deletePortalConnection`) — removes the record outright, for a
  link that should never have existed (typo, test, wrong client). Sits apart
  and quiet, styled red-on-hover, so it is not hit by reaching for Disconnect.
  Also offered on withdrawn rows, to clear history that is just clutter.
- **Usage / health** — every active row shows "Used N times" and "Last
  reported …", or "Usage not measured yet · No report since connecting" while
  the heartbeat does not exist. `uses` is counted by `markPortalConnectionSeen`
  and is **absent, not zero**, until the Aqua Tag reports — the two are not the
  same, and zero would read as broken.

**Radar wiring.** A 13th `systems` family, `portal-connections`, now exists in
`radarRuleCatalog.ts`, and `radarObservations.ts` counts an agency's active
connections into it. This is the agency business radar, so it is agency-wide.
All the catalog assertions are `>=`, so the extra family and its 12 checks pass
cleanly. The freshness lens goes **blind** rather than green, because the
measured-at comes from `lastSeenAt` (the heartbeat, which does not exist yet),
never a fabricated "now" — exactly the blind-spot behaviour the Radar contract
in CLAUDE.md requires. Once the heartbeat lands, this family starts reporting
real freshness with no further work.

## The customer can disconnect their own software — new

The connect screen promises "you can disconnect at any time"; that promise is
now kept from the customer's side, not only Ed's. On the customer account page
(`/portal/customer/account`) a **Connected apps** section lists the apps *that
person* connected and offers a Disconnect on each.

- Deliberately personal, not a client-admin power. `withdrawOwnPortalConnection`
  revokes only a connection whose `connectedUserId` is the viewer and whose
  `clientId` matches — a colleague's connection and another client's are both
  unreachable by id, and the refusal is the same "not found" either way so no
  id is confirmed.
- Its own endpoint (`/api/portal/customer/connections`, `end-customer` only),
  next to the agency route rather than a widened role check on it.
- The activity trail records `portal_connection.disconnected_by_customer`, so
  Ed can tell a customer's own disconnect from one he did — it lands in his
  withdrawn list either way, with `revokedBy` set to the customer.

## Customer setup — new, and shippable

`/setup` is where a customer lands from the setup email. Three scenes on the
same dark stage as the connect flow: **welcome** ("Welcome, {first name}",
a per-client note, and an optional video), **choose a password**, then **keep
it one tap away**.

- The setup email now returns to `/setup` rather than `/portal/customer`, and
  the customer layout sends anybody without `welcomeCompletedAt` there. A
  first-timer signed in by a link holds no password; dropping them into the
  portal leaves somebody locked out the moment the link is spent.
- **Passwords are set with the Supabase admin key**, not by the browser. The
  magic-link route issues Aqua's cookie directly and no Supabase session, so
  there is nothing for the browser to use. The account is provisioned on first
  use and updated after — which is what finally makes a customer able to sign
  in normally rather than only ever through a link.
- **`app/manifest.ts` is new.** Without it "add to home screen" makes a
  bookmark, not an app. The install step offers the real one-tap prompt where
  the browser fires `beforeinstallprompt`, and falls back to per-platform
  instructions where it does not. **The one-tap prompt needs a service
  worker**, which is deliberately not added — a SW on a live portal is a real
  caching-bug risk and its own decision. So today: iOS gets instructions
  (Safari never fires the event), and Android/Chrome also gets instructions
  until a SW exists. Installing works everywhere via the manifest; only the
  button is gated. Adding a minimal SW later turns the button on for Chrome.
- **The welcome video (Ed's VSL) is set from the Portal tab** — a "Welcome
  video (setup screen)" field beside the welcome note. It cleans and persists
  as `portalWelcomeVideoUrl`, and the setup screen reads it back and renders
  it as an embed; absent, the section is left out rather than shown broken.
  Walked end to end: set on the Portal tab → plays on the customer's first
  sign-in. Use an **embed** URL (youtube.com/embed/…, player.vimeo.com/…),
  not a watch/share link. `portalWelcomeNote` overrides the welcome copy the
  same way and already had its field.

## Correctness fixes from a review pass

Shipping to real customers, so I re-read the session's new code for bugs:

- **Sandbox setup no longer loops.** The `.test`-domain guard in
  `customer/setup` returned before `markWelcomeComplete`, so a sandbox customer
  was sent back to `/setup` on every visit forever. It now marks setup done in
  that branch too — there is no Supabase account to hold a password, but the
  setup is complete. Verified: after the 409, `/portal/customer` serves
  instead of redirecting.
- **Reset is no longer offered on a live connection.** "Reset link" on an
  active connection would silently revoke a working link and force the customer
  to consent again — which is what Disconnect is for. It now shows only on
  pending and expired links; active rows offer Disconnect and Delete.

## Standard portal simplification — new (Ed's scope-down)

Ed decided to cut the portal products back to one and rebuild the rest one at a
time. Done so far:
- **Seeding now creates exactly one product — Website** (`agencyProducts.ts`,
  `ensureDefaultAgencyProducts`). The social-ads force-add is removed. The other
  10 catalogue templates are untouched and available to add later.
- **Phase labels centralised** into `PORTAL_PHASE_LABELS` in `portalProducts.ts`
  and read from five previously-duplicated sites (FulfilmentPortalPreview,
  ProductsWorkspace, PortalsWorkspace, ClientPortalStudio; clientPortalDesign
  already matched). They now read Onboarding → Design → Develop → Published
  everywhere.
- **Both `getAgency(...)!` crash sites fixed** with a null guard → redirect.
- Not yet done: the milesymedia test tenant still holds 38 products + junk
  clients from before; a clean-up (or a fresh tenant) is needed for Ed's own
  screens to show the one-Website-product standard. See `docs/WHERE-WE-ARE.md`.

## Data erasure & the enquiry-duplication fix — new

**Enquiry 3× duplication — fixed at source.** `/api/public/brand-enquiry` had
no idempotency, so a double-submit / retry / the Aqua Tag racing the form each
inserted a fresh enquiry (+ lead). That's why Supabase held e.g. "nigga one"
×12. Added a dedupe guard: same brand + same email/phone within 2 minutes
returns the existing enquiry instead of a new one (`DEDUPE_WINDOW_MS`, mirrors
form-capture). Test: `scripts/smoke-enquiry-dedupe.test.ts`.

**Right-to-erasure (GDPR/audit) — built.** The app had no hard-delete anywhere;
now it has a compliant one for clients:
- `src/server/clientErasure.ts` — `eraseClientCompletely` sweeps every state
  collection and removes anything stamped with the `clientId`, plus the client
  record, and keeps ONE audit entry (`client.erased`) recording that the
  erasure happened (names no personal data — that's the point). `previewClientErasure`
  gives the count. Generic sweep, so new collections are covered automatically.
- `POST /api/portal/clients/[clientId]/erase` — **agency-owner only**, requires
  the client name typed back in the body (defence in depth).
- Danger zone on client settings (`_ClientDangerZone.tsx`, owner-only) with
  type-to-confirm and "cannot be undone" copy. Walked in a browser: created a
  throwaway client, erased it, client gone, audit entry kept.
- Tests: `scripts/smoke-client-erasure.test.ts`.
- **Caveat — deeply nested plugin data.** The sweep catches top-level
  `clientId`-stamped records. Plugin buckets (`pluginData`, e.g. leads-pipeline
  contacts/leads) are heterogeneous and NOT swept — a fully complete erasure
  will need per-plugin erasure hooks. Flagged, not done.

**Enquiry erasure — built, including the inbox button.** `POST /api/portal/website-enquiries/erase`
(owner-only, deletes the Supabase `brand_enquiries` row + audit log) plus a
per-enquiry delete control in the Master Inbox: a Trash icon that becomes a
two-step "Delete for good? Yes / No" in place (owner-only via `canErase`, set
from `session.role === "agency-owner"` on the inbox page). Threaded through
`WebsiteEnquirySection`. Contract-tested in `smoke-client-erasure.test.ts`.
**Couldn't see it render in the dev sandbox** — `inbox/page.tsx:60` loads zero
enquiries for a demo/dev session (`session.isDemo ? Promise.resolve([])`), so
no enquiry cards exist to hang the button on. It renders in a real
(non-demo) inbox where enquiries load.

**The junk enquiries are still in live Supabase.** 33 test/slur enquiries remain
(backup: `scratchpad/brand-enquiries-backup.json`; keepers: Pranab H, Tom Innes).
The env's safety classifier blocked a script hard-deleting live rows, so
`scripts/cleanup-junk-enquiries.mjs` is ready for Ed to run himself, OR wire the
inbox delete button and remove them in-app.

## Inbox: Resolve fix, and website-source routing — new

**Resolve now clears the item.** `AlertRow`'s Resolve was a plain `<Link>` — it
navigated to the record but never removed the alert, so it "stayed there for no
reason". It now dismisses the alert (removing it from the list) *and* opens the
record. If the underlying issue genuinely persists, the derived signal returns.

**Website-source routing — built.** The real answer to "I tag my new company's
site / a client's site — how do I route submissions to the right inbox?"
- `src/server/websiteSources.ts` — a registry keyed by normalised host, each
  routing to the agency inbox (default) or a `destinationClientId`. Pure
  `normalizeHost`, CRUD, `resolveWebsiteSourceRouting`. State:
  `websiteSources?` on `PortalState`.
- `/api/portal/website-sources` (agency-only) — list (+ clients for the
  picker), add, update (re-point), remove.
- `/api/public/brand-enquiry` now looks the route up by the submission's host
  and makes the enquiry the routed client's from the start
  (`owningClientId = routedClientId ?? identityResolution.clientId`), writing
  the client ledger for it. Unregistered hosts keep the old agency-inbox
  behaviour.
- UI: `_WebsiteSourcesConfig.tsx` mounted at the top of the inbox **Channels**
  tab — add a domain, pick "Your inbox" or a client, re-point or remove.
  Walked in a browser: added `northlight-studio.com → Northlight Studio`,
  persisted, then removed. Tests: `smoke-website-sources.test.ts`.
- **Client-side entry point.** `_ClientTagWorkspace.tsx` — mounted in the
  client workspace's **Systems → Monitoring** view, under the existing tag
  install snippet. Shows the sites routed to *this* client and lets you add one
  (destination fixed to the client, so it auto-routes here). Same
  `/api/portal/website-sources` registry, filtered to the client. Walked in a
  browser. So the tag install + routing now sit together in the client's
  workspace — the "tag workspace in client internal".
- **Not yet done:** routed-to-client enquiries still appear in the agency
  inbox's enquiry list (the client ledger gets them, but the agency list isn't
  filtered/labelled by route yet). (fixed below).

**Ed's next idea (captured, not built): Aqua Tag as a consent-aware tag
manager** — configure GA/PostHog/Meta Pixel through the one tag, injected only
when the visitor's consent (which the tag already tracks) allows. Plus an
"owner's tag" variant for his own sites. See the memory note of the same name.

## Channels tab is now a real control panel — new

Ed's "channels is basically bs, just UI" is resolved. The inbox **Channels**
tab now has three real sections instead of a status board:
1. **Website sources & routing** (built earlier) — which tagged sites → which
   inbox.
2. **Accounts & connections** — the existing, tested `IntegrationConnectionsPanel`
   (from agency settings) mounted here. Add / edit / test / remove the
   email (Resend/SMTP), SMS & WhatsApp (Twilio) senders the inbox replies
   through, plus Stripe/GitHub/Vercel/etc. Scoped to workspace or a client.
   Gated on owner/manager (`canManageChannels`). Nothing new/untested — it's
   the same component reused in the right place.
3. **Built-in channels** — the old status board, kept but reframed as
   always-on live status (Meta social, website forms, chatbot, monitoring).

So the accounts config that lived only in Settings is now where Ed expected it.
Meta/Instagram connect-flow is still its own thing (OAuth) and not surfaced in
this panel — a possible follow-on.

## Master tags & the Aqua Tags Command Centre screen — new

Ed's "master tag" — one owner's tag for his own sites, pouring submissions into
his inbox — plus the decision to build the full flow *properly in the Command
Centre*, dogfooded on his own sites before any client.

Done and working:
- **Agency master site key** — `ensureAgencyMasterSiteKey` /
  `resolveAgencyByMasterSiteKey` / `masterTagSnippet` in `server/websiteSources.ts`.
  One stable key per agency (never rotates — it lives in site HTML). State:
  `agencyMasterTagKeys?` on `PortalState`.
- **Ingestion** — `/api/public/form-capture` now recognises a master key,
  attributes the enquiry to that agency (a real enquiry, not a held capture),
  applies the host→client routing override, and writes the client ledger when
  routed. So submissions from a master-tagged site arrive in the inbox.
- **Command Centre screen** — `/portal/agency/aqua-tags` (`_AquaTagsWorkspace.tsx`).
  Generates + shows the master tag with copy, and lays out the full setup flow:
  generate (Ready) → detect on domain → scan forms → link repo → seed the site
  into the editor → link/create a company. Only generate is live; the rest are
  honestly marked "Building next"/"Planned".
- **Inbox Channels** no longer holds the master tag — it has a "Master tags →"
  button to the Command Centre screen, and keeps the per-host routing overview.

**The next build (Ed's vision, staged in the screen):** the guided wizard —
detect the tag live on a domain (server fetch + check for /aqua-tag.js), scan
& count forms, link the repo, seed the site into the existing website editor,
and link/create a company. Each reuses systems we already have; the client
version is "the same flow repackaged". No Command Centre *nav* link yet — the
Channels button is the entry point.

## Loose ends worth knowing

- The junk client records (`ddddd`, `defhjesuifhesif`, and one containing a
  slur) are the entire client list on the real tenant, so they appear in the
  Studio picker and any screenshot.
- `src/app/portal/agency/page.tsx:63` does `getAgency(...)!` and crashes when
  that is null. Same class as the brand-kit crash fixed this session.
- `/portal/agency/development/code` is now redundant — superseded by the Repo
  tab. Delete it.
- **The sandbox does not protect Supabase Auth.** `PORTAL_BACKEND=file` guards
  the state file only; `src/lib/supabase/admin.ts` reads its credentials from
  the environment, so anything using the admin client writes to the real auth
  project. Walking the new setup flow locally created a real user
  (`dev-customer-…@bare-co.test`) in the live project — 1 of 2 users there.
  The setup route now refuses any `.test` domain (RFC 2606, so no real
  customer can have one) and says so on screen. Anything else reaching for the
  admin client needs the same guard.
- The live Supabase blob changed at 09:51 BST today (activity +18, ledger +6,
  identity reviews +6). Not from this session's work — the sandbox stayed
  sealed throughout — but unexplained.
- The running `dev:sandbox:real` server re-stamps `updatedAt` on all eight
  `persons` records every ~30 seconds. Harmless so far, but it writes
  constantly and makes `updatedAt` useless as a signal on people. Found by
  diffing the sandbox against a snapshot; not chased down.
- **Two temporary things to remove together**, both gated on `devModeStatus()`
  so neither can reach real data: the `00000` code in
  `connectionConfirmation.ts`, and `/dev?client=<id>`, which mints an
  `end-customer` session for a sandbox client. The second exists because
  `/api/auth/login` goes through Supabase, so a sandbox-only user cannot sign
  in at all and the flow could otherwise be read but never walked.
- **A `client-owner` following a connect link lands somewhere else.** The
  customer portal layout requires `end-customer`; every "Go to your portal"
  link in the connect flow points at `/portal/customer`. So the flow quietly
  assumes the connecting person is an end customer. Fine for now, wrong the
  first time a client-side admin uses a link — decide whether the redirect
  should follow the role, or whether these links are only ever for customers.
- Connection records exist on the junk `ddddd` client from testing the
  screen: one pending ("ddddd app", expires seven days from 18 Aug) and one
  withdrawn ("Cedar booking app"). Both are visible and removable in the tab
  itself. Connections are revoked rather than deleted by design, so the
  withdrawn one stays.
