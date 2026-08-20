# Worker handoff — Master Inbox (Meta) + internal chat attention

← [context/](README.md) · **For the Commander.** From the meta-inbox worker,
2026-08-19. Honest report: what shipped, how it's tested, where it hurt, my real
read on it, and what's left.

> **One-line snapshot:** The Meta social inbox is now self-serve end-to-end at the
> app layer (create app → enter creds in-app → connect many accounts), the
> connections panel now nudges you to set up email first, and internal team chat
> now pings the owner in "Needs attention" when a direct message or @mention is
> waiting. **Full suite 1668 pass / 0 fail / 1 skip; whole tree typecheck-clean.**
> The gaps left are all either *live browser walks* (flagged to you) or *Ed's
> external prerequisites* (a Meta app, an HTTPS deploy, an email sender).

---

## What shipped

### 1. Meta social inbox — self-serve "Connect now" (my actual brief)
Plan: [meta-inbox-connect](../development/plans/meta-inbox-connect.md). Was a dead
end ("Awaiting Meta values" — creds were env-only). Now:

- **P1 — store.** Meta is a normal **integration provider** (App ID / App Secret /
  webhook verify token / Graph API version). Secrets encrypted (AES-256-GCM), never
  echoed. It surfaces in **both** the inbox Channels panel and Agency→Company
  connections because that panel is catalog-driven — **no `_MasterInbox` edit
  needed** (which mattered; it's the enquiry-card worker's file, off-limits to me).
- **P2 — read stored-then-env.** `metaInboxReadiness` / `readMetaMessagingConfig`
  now take `(agencyId, origin?)` and read the stored connection first, env as
  fallback. Threaded through all 6 call sites; the OAuth flow itself is untouched.
  Fixed a latent crash on the way (the old config reader dereferenced
  `NEXT_PUBLIC_PORTAL_BASE_URL!` even when the base came from the request origin).
- **P3 — UI.** The dead button is now an enabled **"Connect now"** that opens an
  inline creds form (fields pulled from the shared catalog, saved via the existing
  integrations API), then `router.refresh()` → the Instagram/Facebook consent
  buttons appear.
- **P4 — secret hygiene.** Already provided by the vault; confirmed + test-pinned.
- **Webhook (the sharp one).** `api/webhooks/meta` is session-less, so it now
  resolves the owning agency from the payload's account id and verifies the HMAC
  signature + the GET verify-token handshake against **that agency's stored
  secret/token, then env**. Env stays a candidate and the HMAC is the only gate —
  so adding candidates can *never* accept a forged request, only let a validly
  signed one match the right stored secret.
- **P5 — multiple accounts (Ed: many IG/FB on one app).** The data-flow already
  supported it; the gap was **feedback** — connecting several accounts (or a
  failure) was silent. Added the connect-result banner (`metaConnectNotice`),
  "Add Instagram/Facebook" once you have some, a connected-count, and a "Routed"
  badge for accounts tied to a company/marketing profile.

**Verification level:** service-layer runtime-verified (in-process behavioural
tests) + **browser-verified on `:3032`** for the Connect-now form and the
connect-result banners (both tones + dismiss). **Not** verified: a real OAuth
connect — that genuinely needs a Meta app on an HTTPS host (localhost fails the
HTTPS-callback gate *by design*).

### 2. Email-sender prominence (small, Ed asked)
A "**Start here — connect an email sender**" callout at the top of the connections
panel when no Resend/SMTP is set, with one-click Connect Resend / Use SMTP. It's
the thing that powers enquiry replies *and* the customer login-code emails, so it's
the right first step. **Browser-verified** (renders; "Connect Resend" opens the
modal). `IntegrationConnectionsPanel.tsx`.

### 3. Internal chat → owner "Needs attention" (Ed asked; new little feature)
Plan: [internal-chat-attention](../development/plans/internal-chat-attention.md).
Chat existed but had **no read-state and no @mentions**, and never fed the
attention inbox — so an owner-directed message could just slip by.

- Added **read-tracking** (`peopleChannelReads`, marked on view/post) and
  **@mentions** (`PeopleMessage.mentions`, parsed from the roster on post) — both
  from scratch.
- `ownerChatAttention` → `operationalAlerts` raises one **`in-app`
  `people:chat-attention`** alert when the owner has unread **direct messages** or
  **@mentions** (Ed's chosen trigger). It lands in the Needs-attention tab
  automatically (that tab renders the alert list — no `_MasterInbox` edit) and
  **clears when the owner opens Team chat**.
- @mentions render **highlighted** in the chat + a composer hint.

**Verification level:** behavioural **and end-to-end** — a test posts an unread
owner message, confirms the alert actually appears in `listOperationalAlerts`, then
confirms it clears after `markChannelRead`. **Not** browser-verified (seeing it live
means seeding a second user's message into your shared sandbox — flagged to you).

---

## How it's tested (the honest version)
- **Full smoke suite: 1668 pass / 0 fail / 1 skip. Whole tree `tsc` clean.**
- I leaned on **behavioural** tests, not just source-shape ones — e.g. the webhook
  test signs a body with an agency's *stored* secret and proves it verifies via the
  account→agency lookup; the chat test proves the alert lands in the real alert
  list and clears on read. That's genuine server-logic proof, not just "the string
  exists."
- What's **not** proven by tests, honestly: the pixels. The Meta OAuth round-trip
  (needs a real app), and the two live walks I've flagged to you below. Per the
  register discipline, those are logged as pending in
  [status.md](../development/status.md), not hand-waved as done.

---

## Challenges (the real ones)
- **I can't safely self-verify UI here.** `preview_start` refuses while you hold
  `:3032` (per-folder lock), and a second file-backend server would clobber the
  shared `.data` sandbox. I *can* drive your running `:3032` (and did, for the
  read-only-ish checks), but that writes to your state — so for anything needing a
  seed I flagged it to you rather than muddy your sandbox. The git-worktree
  isolation you're setting up will fix this properly; right now it's the single
  biggest drag on "is it *really* working."
- **The shared docs shift under me constantly.** `updates.md`, `status.md`,
  `todo.md` were edited by other workers between my read and my write on almost
  every entry — several edits bounced and I had to re-read + re-insert. Not a
  complaint, just the reality of this many hands; the "insert at top, don't rewrite
  others" rule held up well.
- **The full-tree `tsc` flickered red on *other people's* work** (websiteSources,
  `_PeopleCommand`, `publicMediaAdapter`) at different points. Every time, I had to
  disambiguate mine vs theirs — mine were always clean, and I noted it each time so
  nobody mistakes another worker's mid-edit for my regression.
- **Forbidden-file gymnastics.** Not being able to touch `_MasterInbox` shaped a lot
  of choices — but the catalog-driven panel and the generic alert list meant I could
  extend at the *data* layer and have the UI pick it up for free. That's good
  architecture paying off.
- **The webhook was the one that needed care** — session-less, multi-tenant,
  security-critical. I'm confident in the "HMAC is the only gate, env always a
  candidate" design, but it's the one place I'd genuinely welcome a second set of
  eyes.

---

## My honest thoughts
Buddy, this codebase is *better than most* I've seen at this stage — and the reason
is the docs law. `development.md` → plan → status → updates actually works; I stayed
oriented across a sprawling app without thrashing, and "a passing test ≠ working"
being written down everywhere kept me honest instead of declaring victory on green.

The integration catalog/panel is the quiet hero — generic, catalog-driven, reused in
two surfaces, encryption + masking + env-fallback already baked in. Meta "self-serve"
sounded big and turned out to be mostly *registering a provider*. Whoever built that
deserves a nod; it's the difference between a two-day job and a two-hour one.

Where I'd push back gently:
- **Verification is the soft spot**, and everyone knows it (the status register is
  the honest antidote). The isolation work is the highest-leverage thing on the
  board right now — it unblocks every worker's "does it actually run."
- **Concurrency friction is real.** Five-plus workers on shared docs + shared `tsc`
  means a lot of "is this mine?" overhead. Worktrees help here too.
- **Scope crept (at Ed's direction, happily).** I started on the Meta inbox and
  ended up in team chat and the connections panel. Files were free so no collision —
  but flagging it so you're not surprised to see my fingerprints outside
  `agency/inbox/`.

And genuinely — this was a good run. Clean wins, real tests, and the couple of
places I wasn't sure, I surfaced instead of guessing. Thanks for the setup; it made
the work easy to do well.

---

## What's left
**Live browser walks (→ you, on `:3032`):**
- Meta **Connect-now** happy path *end-to-end* — only fully exercisable once there's
  a real Meta app on an HTTPS deploy (localhost can't complete OAuth by design).
- Internal-chat **alert live** — post a message to the owner from a second user, see
  `people:chat-attention` in Needs attention + the @mention highlight/composer hint.
- (Already browser-verified by me: the Connect-now form, the connect-result banners,
  the email-sender callout.)

**Ed's external prerequisites (not code):**
- Create a **Meta Developer app**, deploy AquaCRM on **HTTPS**, and register the
  webhook URL (`/api/webhooks/meta`) + verify token in Meta's dashboard. Then enter
  the four values via Connect now and connect accounts.
- Connect an **email sender** (Resend/SMTP) — now prominently nudged.

**Noted follow-ups (small, optional):**
- Per-viewer chat alerts (managers get their own, not just the owner).
- Full-name (multi-word) @mention highlighting — currently highlights the first
  token; server detection already handles full names.
- A second set of eyes on the Meta **webhook** agency-resolution (security-sensitive).

**My recommendation for next:** land the worktree isolation (unblocks everyone's
verification), then hand me the live walks above the moment a Meta app + HTTPS host
exist — I'll close them out.

— the meta-inbox worker
