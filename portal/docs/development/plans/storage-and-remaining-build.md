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

### 2. ✅ Plugin-health screen — DONE 2026-08-29

A "Module health" section in the Dev Console, beside worker activity, over the
route built 2026-08-28. Reading rules live in `lib/chrome/pluginHealth.ts`
rather than in the component, so they can be driven by a test —
`smoke-plugin-health-panel.test.ts`, 20 cases.

`supported: false` survived into the UI as intended: a hollow grey ring and the
words "not reporting", never a colour that reads as a fault.

Two things the plan did not anticipate, both found while building:

- **A green module can have a red component.** `HealthStatus` carries an
  optional `components` map and `client-crm` is the live proof the two levels
  disagree — top-level `ok: true` alongside `segments: { ok: false }`. Showing
  only the headline would have hidden a real failure behind a green dot, so
  there is a fourth tone, `degraded`, that names the failing component.
- **Degraded must not re-score the route's totals.** The route counts
  `unhealthy` as `status.ok === false` and nothing else. `degraded` is a display
  tone only; the panel prints the route's own summary rather than deriving one,
  which is the bug the Dev Console already shipped once with its worker count.

Rows sort problems-first rather than by `pluginId` — the route's stable order is
right for an API and wrong for a 366px popover where one broken module must not
land under the fold.

### 3. ✅ `setup` requirements, over the vault — DONE 2026-08-29

**The premise above was wrong, and building to it would have lost credentials
rather than stored them.** Recorded here because the correction is the useful
part.

The ANSWERS path forwards but does not arrive. `installPlugin({ setupAnswers })`
does reach `onInstall` — and **zero of the ten `onInstall` implementations read
it**. `ecommerce`, the only module declaring `setup`, signs the parameter
`_setupAnswers`; the underscore is deliberate and the body only seeds an empty
`collections` list.

Worse, `ecommerce`'s three `setup` fields are the same three the
`settings.groups.stripe` group already collects — except the settings fields
carry `secretVault: { provider: "stripe" }` and the setup fields carry nothing.
A renderer built to the plan would have taken a live Stripe secret key and a
webhook secret, handed them to a function that drops them, and sat beside a form
that stores the same two values correctly. The operator would have had every
reason to believe Stripe was configured.

**What `setup` is actually good for:** `SettingsField` has no `required` flag.
`SetupStep.fields[].required` is the only place in the system that says which
values a module cannot work without. So `setup` is now read as a REQUIREMENTS
declaration, and the vault-backed settings surface stays the only writer —
nothing new touches a secret.

Shipped:

- `lib/plugins/pluginSetupStatus.ts` — pure comparison of declared requirements
  against `describePluginSettings`' existing `configured` flag, which already
  resolves the vault. A required id with no settings field behind it is reported
  as `unmapped` rather than dropped, because a checklist item nobody can action
  is worse than an absent one.
- A Finish-setup banner on `PluginSettingsPanel`. It is a **signpost, not a
  second form**: it names what is missing and the vault-backed field below stays
  the only input, so there is exactly one place a Stripe key can be entered.
- `ecommerce/src/pages/SettingsPage.tsx` + its `pages`/`navItems` entries. The
  panel is generic and only `agency-finance` had ever mounted it, so ecommerce's
  own Stripe group had no surface at all — the same "declared, never consumed"
  defect one level up. Without this the banner would have rendered for nobody.
- `smoke-plugin-setup-completion.test.ts`, 16 cases, including a guard holding
  the real manifest's two blocks against each other so a rename cannot silently
  make a requirement uncollectable.

**Still open, and deliberately not decided here:** `setup` remains dead as an
install-time mechanism. Either an `onInstall` should start consuming answers or
the field should be retired from the manifest type. Nothing depends on the
answer today.

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
