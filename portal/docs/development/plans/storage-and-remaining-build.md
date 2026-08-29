# What's left, and the order to build it

**Written 2026-08-29.** Ed: *"continue get it done — write a plan docs first
tho."* This is that plan. It covers the four remaining pieces of work and the
one distinction that decides how each is done.

Grounded in measurements against the LIVE datastore, not the local file.

---

## Where we are

| Collection | Was | Now | State |
| --- | --- | --- | --- |
| `devTeamWorkspaceFiles` | 967 KB (29.0%) | **own row** | ✅ split, lossless, tested |
| Radar (memory + evidence) | 974 KB (29.2%) | ~350 KB projected | ✅ retention fixed |
| `clientPortalTemplates` | 615 KB (18.5%) | **own row** | ✅ split, lossless, tested |
| `clients` + client records | 181 KB (5.4%) | 181 KB | ⬜ the real one |
| everything else | ~500 KB | ~500 KB | fine |

Live document was **3.25 MB across 59 collections**. Your actual business data
is 5% of it; the rest is machinery.

---

## The distinction that decides everything

There are **two different moves**, they solve different problems, and confusing
them is the main way this goes wrong.

### Move A — a sidecar row *(what we just did)*

The collection keeps its shape as JSON and moves to its own `app_datastores`
row under a second `app_key`.

- **Solves:** write amplification and payload size. Every `jsonb_set` on the
  main document stops rewriting that collection, and the patch response stops
  returning it.
- **Does NOT solve:** row-level security. The collection is still one JSON
  value; no policy can address anything inside it.
- **Cost:** small. `devTeamWorkspaceFiles` took one key function, one backend
  port, hydrate/flush conditionals — **no SQL at all**, because both RPCs
  already take `p_app_key`.
- **Risk:** the two data-loss traps found doing it — clearing the main copy
  before the sidecar holds the files, and excluding the collection on backends
  that have nowhere else to put it. Both are now pinned by tests, and the same
  tests protect the next one.

### Move B — real rows

The collection becomes actual Postgres rows with columns, and every row carries
`agency_id` / `client_id`.

- **Solves:** RLS granularity, provable erasure, queryability.
- **Cost:** large. Schema, migration, a routing layer under `getState()`,
  backfill, and every reader that assumed a synchronous in-memory object.
- **Risk:** high, because `getState()` is synchronous and returns the whole
  document. Rows want async reads.

**Nothing about safety currently forces Move B.** Verified 2026-08-29: the
public key cannot read, write or delete the state row, and the browser never
talks to Supabase for application state — it talks to Next.js, which enforces
the access kernel. Move B buys defence-in-depth, provable erasure and queries.
It is the right destination, not an emergency.

---

## The order

### 1. ✅ `clientPortalTemplates` → sidecar *(Move A)* — DONE 2026-08-29

615 KB, 18.5%, no personal data.

The difference from the first one turned out to matter: `devTeamWorkspaceFiles`
had a dedicated row-locking RPC, so its write path was already separate.
Templates are written through ordinary `mutate()`, so the FLUSH owns that row —
and that is where **write order** became load-bearing. The main document write
is what clears the collection out of it, so a sidecar written afterwards would
lose everything on a network blip between the two. Sidecars are now written
first, always.

Rather than add a second special case, the mechanism was generalised into
`SIDECAR_COLLECTIONS` — a list with a `dedicatedWriter` flag, so a collection
with its own RPC is not also written by the flush (which would race its lock).
The third one will be a one-line addition.

**Result:** the main document drops from 3.25 MB to roughly **1.2 MB**.

### 2. Plugin-health screen — NEXT

The route exists (`/api/portal/plugins/health`, built 2026-08-28) and ten
modules answer it. Nothing displays it.

Home: the Dev Console, beside the other operational panels. Shows each installed
module, its status, its own message, and — importantly — **`supported: false`
distinctly from unhealthy**, because a module with no healthcheck is unknown,
not broken. That distinction is already in the route and must survive into the
UI.

**Small.** A panel over an endpoint that is already tested.

### 3. `setup` wizard renderer

`ecommerce` declares a `SetupStep[]` and nothing renders it. The ANSWERS path
already works — `installPlugin({ setupAnswers })` forwards to `onInstall` — so
what is missing is only the collecting UI.

The one real decision: **where it appears.** A first-install wizard belongs in
the install flow, but there is no install flow surface today; plugins are
installed programmatically. Simplest honest answer is a "Finish setup" panel on
the plugin's settings page, shown while required answers are missing.

**Medium**, and the only piece here that needs a product opinion.

### 4. Client records → rows *(Move B)*, then enquiries permissions

The destination. Do it after 1–3, because:

- the document will be small enough by then that the pressure is off, so this
  can be done carefully rather than under duress;
- the sidecar work will have proven the storage seams twice;
- and the enquiries permission rule — *"which staff may open which client's
  enquiries"* — becomes a database policy rather than only application code,
  which is the honest end state.

Worth restating: the client-facing half is already right and must stay that
way. A client's enquiries live in **their** Supabase and AquaCRM holds only a
pointer; `clientFormReader.ts` states the rule — *"nothing this returns may be
written to our state"* — and that is why there is no second copy of a client's
customers to secure, leak or erase.

---

## What is NOT on this list, deliberately

- **`affiliate.payout_completed` email.** Emitted, but the payload carries
  `affiliateId` where the handler needs `affiliateUserId` and `affiliateEmail`.
  Wiring it would be connected-and-permanently-silent. It needs the affiliates
  module to emit a recipient, which is a change to that module.
- **`forms.notification.requested` / `auth.bootstrap.signup`.** Nothing emits
  either. There is no wiring to do until something does.
- **`storefront` blocks.** Three of the five declaring modules say *"Renderer
  ships in T3"* in their own descriptions. Registering them would drop
  non-functional blocks into the editor palette.

Each is recorded at the point somebody would read it, and pinned by a test so
the note cannot go stale.

---

## Still yours

Two Vercel variables (`NEXT_PUBLIC_PORTAL_SECURITY=strict`,
`NEXT_PUBLIC_PORTAL_BASE_URL`) and three Supabase accounts
(`node scripts/supabase-cutover-preflight.mjs`). Neither blocks anything above.
