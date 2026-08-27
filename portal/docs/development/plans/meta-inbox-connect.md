# Plan — Meta social inbox: self-serve "Connect now"

← [todo.md](../todo.md) · [development.md](../../development.md)

**Status: CODE-COMPLETE — all phases + webhook shipped 2026-08-19.** The
Connect-now UI and notice states were browser-verified on port 3032. The remaining
usable-product proof is Ed creating the real Meta app and completing OAuth plus a
live webhook on HTTPS. The plan replaced the dead "Awaiting Meta
values" state with a **"Connect now"** button that lets Ed enter his Meta
credentials in-app and actually connect — instead of the values being env-only.
**Decision resolved (Ed):** full self-serve in-app entry (not env-only relabel).

**Progress:**
- ✅ **Phase 1 — store Meta creds (both views).** `meta` is now an integration
  provider in `integrations/catalog.ts`; `integrationConnections.ts` gained its
  env-fallback map + a `testProvider` case; the catalog-driven
  `IntegrationConnectionsPanel` surfaces it in **both** the inbox Channels panel
  and Agency→Company connections with **no `_MasterInbox` edit**. Secrets
  encrypted/masked by the existing vault (covers Phase 4). Full suite 1546 green;
  behavioural test added. See [updates.md](../updates.md).
- ✅ **Phase 2 — read stored-then-env.** `metaInboxReadiness` +
  `readMetaMessagingConfig` now take `(agencyId, origin?)` and resolve the stored
  `meta` connection first (env fallback); threaded through all 6 call sites
  (inbox/marketing pages, `meta/start`, `meta/callback`, `inbox/connections`,
  `inboxService`). OAuth flow + `buildMetaAuthorizeUrl` untouched. Full suite 1580
  green; behavioural test added. **⚠ Follow-up:** the webhook route
  `api/webhooks/meta` still verifies against `META_APP_SECRET` env, not the stored
  secret (no session → needs agency-from-payload resolution before verifying).
- ✅ **Phase 3 — "Connect now" UI.** The disabled "Awaiting Meta values" button is
  now an enabled **"Connect now"** revealing an inline `MetaConnectForm` in
  `_SocialInboxWorkspace.tsx`. Built inline (not the full panel modal) because the
  workspace can't receive new props without editing `_MasterInbox` (forbidden) — but
  it **reuses the shared `integrationDefinition("meta")` fields + the same
  `/api/portal/settings/integrations` save API**, so it's one store / two views, not
  a twin. On save → `router.refresh()` → readiness recomputes → the IG/FB consent
  buttons appear. Contract test added; full suite 1589 green. **Commander to
  browser-verify the click-through** (preview harness is locked to `:3032`).
- ✅ **Phase 4 — secret hygiene (confirmed).** Provided by the existing vault: App
  Secret encrypted at rest (AES-256-GCM), never returned to the client
  (`configuredSecretFields` only), "•••• set" state in the panel; the new
  `MetaConnectForm` never pre-fills or receives secrets (client sees only the
  boolean `appSecretConfigured`). Pinned by the Phase 1 no-leak assertions.
- ✅ **Webhook (folded in, Ed said continue).** The session-less `api/webhooks/meta`
  now resolves the owning agency from the payload's account id
  (`findPrivateConnectionByExternalAccount`) and verifies the HMAC signature
  (`verifyMetaWebhookRequest`) + the GET verify-token handshake
  (`metaWebhookVerifyTokenAccepted`) against that agency's **stored** secret/token,
  then env. Env stays a candidate and the HMAC/token check is the only gate, so a
  forged request can never be accepted. New `listAgencyIdsForProvider` helper;
  behavioural test proves the stored-secret path. Full suite 1607 green.
- ✅ **Phase 5 — many accounts on one Meta app (Ed's clarification).** Ed confirmed
  he wants **multiple IG/FB accounts through one Meta app** (not multiple apps). The
  data-flow already supported it (FB OAuth returns every Page + linked IG account,
  each saved as its own connection deduped by `(agency, channel, externalAccountId)`;
  webhook routes each delivery by account id; sends use each conversation's own
  connection). Added the missing **feedback/clarity**: the inbox surfaces the OAuth
  connect result (`metaConnectNotice` — "Connected N accounts" / warnings / errors,
  previously silent), reads "Add Instagram/Facebook" once ≥1 connected, and shows a
  connected-count + a "Routed" badge (connect-time routing via
  `meta/start?marketingAssetId=…&companyId=…`, already used by the marketing
  workspace). New test: two accounts coexist as distinct profiles, route by account
  id, disconnect-isolation. Full suite 1636 green; browser-verified on `:3032`.

**Browser-verified (2026-08-19, `:3032`):** inbox → Channels shows "Connect now"
(dead button gone) → reveals `MetaConnectForm` with all four catalog fields + help
+ setup link; readiness correctly flags the missing "public HTTPS portal URL"; no
console errors. Not submitted — localhost can't reach `configured` (HTTPS-callback
gate rejects localhost by design), so the IG/FB-buttons transition only shows on a
real HTTPS deploy.

**Done when (still outstanding — not code):** Ed creates the Meta Developer app +
supplies creds on an HTTPS deployment; the OAuth connect + live webhook can then be
exercised for real.

## Original starting point (superseded by the shipped status above)
- `_SocialInboxWorkspace.tsx` shows the connect UI **only when `readiness.configured`** (from `metaInboxReadiness()`), which checks **env vars** `META_APP_ID` / `META_APP_SECRET` (+ verify token, Graph API version, portal URL). If unset → the disabled **"Awaiting Meta values"** button (line 195).
- The connect buttons already exist and work when configured: `/api/portal/inbox/meta/start` → Meta OAuth (`buildMetaAuthorizeUrl`, reads `readMetaMessagingConfig`).
- So the block is: **credentials come from env, not the UI.** A "Connect now" that just links to OAuth would hit `not-configured`.

## Honest prerequisite
Connecting Meta genuinely needs a **Meta Developer app** (App ID + Secret) that Ed creates in Meta's dashboard — no button can skip that. "Connect now" *collects and guides*; it doesn't remove that step. And the App Secret is a real secret → must be encrypted at rest.

## Phases
1. ✅ **Store Meta app credentials in-app — as an integration connection, surfaced in BOTH places.** Persist App ID, **App Secret (encrypted)**, webhook verify token, Graph API version via **`lib/server/integrationConnections.ts`** (canonical store) + the inbox's existing token-encryption pattern (`encrypted_access_token`). Portal URL derives from the request origin. **One source of truth, two views:** manage it from "Your connections" *and* from Agency settings — both read/write the same connection record. **Don't** copy the values into a second `agencySettings` field (that's a drift-prone twin — see [hazards](../../workspace/hazards-and-duplication.md)); settings just renders the same connection.
2. ✅ **Read stored config first.** `readMetaMessagingConfig` + `metaInboxReadiness` read the stored values (falling back to env), so entering them in-app flips `configured` → true.
3. ✅ **"Connect now" UI.** Swap the disabled button for an enabled **"Connect now"** that opens a form for the values (with short "where to find this" help linking Meta's dashboard). On save → the existing Instagram/Facebook connect buttons appear and OAuth runs.
4. ✅ **Secret hygiene.** App Secret encrypted at rest, never returned to the client after save; show "•••• set" state.

## Reuse
`integrationConnections.ts`, the inbox token encryption, the existing `meta/start` + OAuth (unchanged — they just read config from storage now).

## Decisions (Ed)
- ✅ **Storage — RESOLVED: both.** Canonical = the integration connection; also surfaced/managed in Agency settings. One store, two views (not duplicated). This is a general principle — see [notes.md](../notes.md).
- ✅ **Entry — RESOLVED:** full self-serve in-app entry, with env fallback.

## Done definition
The in-app implementation is complete and its UI/config contract is verified.
Live acceptance remains: with no env values set, **Connect now → enter valid
Meta values → Instagram/Facebook buttons → OAuth → signed webhook → reply** on
an HTTPS deployment. The App Secret must remain encrypted and never echoed back.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/lib/server/integrations/metaMessaging.ts`
- `src/lib/server/integrations/integrationConnections.ts`
- `src/lib/integrations/catalog.ts`
- `src/app/api/webhooks/meta/route.ts`
- `src/app/api/portal/inbox/meta/start/route.ts`
- `src/app/api/portal/inbox/meta/callback/route.ts`
- `src/app/api/portal/inbox/connections/route.ts`
- `src/app/portal/agency/inbox/_SocialInboxWorkspace.tsx`
- `src/app/portal/agency/inbox/page.tsx`
- `src/app/portal/agency/settings/IntegrationConnectionsPanel.tsx`
- `src/lib/server/inbox/inboxService.ts`
- `scripts/smoke-meta-master-inbox.test.ts`
- `docs/development/plans/meta-inbox-connect.md`
