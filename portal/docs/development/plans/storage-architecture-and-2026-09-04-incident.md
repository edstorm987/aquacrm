# Storage Architecture & the 2026-09-04 Performance Incident

**Status:** authoritative as of 2026-09-04. Supersedes the "Vercel serverless"
framing in older docs. Read this before touching `src/server/storage.ts`,
`storageSupabase.ts`, the sidecar mechanism, or planning the state migration.

---

## 1. What the storage actually is

AquaCRM keeps essentially all portal state — clients, leads, activity, inbox,
dashboards, persons, ledgers, outbox, radar, dev-team files, plugin data, …
(~92 top-level collections) — as **one JSON blob** in a **single Postgres row**:

```
table  public.app_datastores
row    app_key = 'aquacrm-portal-state'   (the "main blob", ~2.9 MB)
col    data jsonb
```

Reads load the whole blob into an in-memory cache; writes diff the cache and
apply a JSON patch to that one row via the `apply_app_datastore_patch` RPC.

**Why it was built this way:** it's a solo-founder build. One blob is trivially
simple — no schema per feature, no joins, transactional "everything or nothing",
and on a warm process it's just an object in memory. That simplicity carried the
product a long way and is *not* a mistake to be ashamed of. It has exactly one
fatal property under load, described next.

---

## 2. The property that bites: Postgres rewrites the whole row

A `jsonb` update is not an in-place edit. **Any** update to the row — even
changing one byte — writes a brand-new 2.9 MB row version (MVCC), and concurrent
updates serialise on that row. So:

- **Every write costs ~2.9 MB of row rewrite**, regardless of how little changed.
- **Concurrent writes queue** (a "convoy") behind each other on the one row.
- **Every page that writes on render pays this**, on every navigation.

This is invisible on a warm single-user localhost. It becomes an outage under
real traffic, or when latency is added, or when the blob is bloated with junk —
all three of which happened on 2026-09-04.

---

## 3. What actually broke on 2026-09-04 (the incident)

We moved AquaCRM off **Vercel serverless** onto an always-on **Railway**
persistent server (the right call — see the persistent-server rationale below).
The move exposed a stack of pre-existing issues that Vercel had been masking:

### Cause A — the app server and database were on different continents
Railway defaulted to **US-East (`iad`)**; Supabase is **EU-West (`eu-west-1`)**.
Every DB call — and the 2.9 MB blob — crossed the Atlantic. Measured: a blob read
~1.1 s, writes 1.2 s climbing to **8–42 s** under load.
**Fix:** moved the Railway service to **EU-West (Amsterdam)**. Reads ~0.5 s.

### Cause B — renders *awaited* the durable write
Five portal page renders (`clients`, `clients/[clientId]`, `fulfilment`,
`inbox`, dev-team `_Section`) did provision/sync work then
`await flushPendingWrites()` **during the render**. Under the convoy that awaited
a 5–42 s write, so the viewport sat on the loader; the long hangs then restarted
the container (cold cache → every navigation reloaded the whole blob).
**Fix (`42f83c44`):** `flushPendingWritesForRender()` — non-blocking on a
persistent instance (the in-memory cache is authoritative for the next request,
and `mutate()` already schedules a 250 ms debounced background flush), still
blocking on serverless and inside a mutation transaction.

### Cause C — a no-op event flood was 40% of the blob (the real culprit)
The blob was 2.9 MB but **1.06 MB of it (40%) was 2,809 `person.updated`
outbox events**, all `delivered`, all generated *today*. Source: `upsertPerson`
runs on **every agency render** (via `listOperationalAlerts` building the
attention feed in the layout *and* the page), and its shared-phone `settled`
sweep **forced a write and emitted `person.updated` every render even when the
person had not changed**. So every render announced "nothing happened" ~14 times,
and the blob (hence every write) ballooned.
**Fix (`4d1b8415`):** emit `person.updated` only on a `substantive` change,
matching what `mutate()` already does (it no-ops when nothing changed). Verified:
the outbox held flat at 2,809 across a clicking window that previously added
hundreds.

### Cause D — the public site is fast because it never touches the DB
Marketing pages don't hit the blob, so they were always instant. This is why the
symptom was "website lightning fast, portal unusable" — a useful tell that the
problem was DB-write-shaped, not CDN/bundler-shaped.

### Also fixed in the same window
- **Client-login redirect (`59ec0037`):** `/login/live` built an absolute
  redirect from `request.url`, which behind Railway's proxy is the internal bind
  origin (`localhost:$PORT`) → dead link. Now a relative redirect.
- **`NEXT_PUBLIC_PORTAL_BASE_URL`** corrected from the stale
  `aquacrm-production.up.railway.app` to `https://www.aqua-crm.com`.

### Still open (tracked)
- **Apex `aqua-crm.com` has no DNS** (only `www` is wired to Railway). The
  public site's hard-coded "Client login" links point at the apex → `NXDOMAIN`.
  Fix = add the apex domain in Railway + DNS, or redirect apex→www.
- **2,809 stale `person.updated` events** still sit in the blob (generation is
  stopped; they age out at 14 days via `OUTBOX_DELIVERED_RETENTION_MS`, or clear
  them via the app's coordinated prune).
- **The one-row design itself** — the durable fix, next section.

---

## 4. The durable fix: cluster the state by domain (this is the plan)

The one-row blob must become **many rows, one per domain cluster**, so a feature
reads/writes only its own row. Radar in a radar row; outbox in an outbox row;
dev-team files in theirs. Changing a radar value then rewrites ~30 KB, not 2.9 MB;
a page fetches only the clusters it renders.

**The machinery already exists — "sidecars."** `SIDECAR_COLLECTIONS` in
`storage.ts` declares collections that live in their own row
(`app_key = 'aquacrm-portal-state:<slug>'`), loaded via the
`load_app_datastore_with_sidecars` RPC and written via the owned-sidecar patch
path. `devTeamWorkspaceFiles`, `clientPortalTemplates`, `radarMemory`,
`radarEvidence` are already *declared* sidecars.

**The gap:** the data migrations to actually MOVE each collection out of the main
blob into its row were **never applied in production** (verified 2026-09-04: the
`dev-workspace-files` sidecar row is absent and its 967 KB is still in the main
blob). The engine is built; the switch was never flipped on live data. Two
dormant safety mechanisms are already shipped (`5cea9bc3`): a flush guard (never
write `{}` over an unloaded lazy sidecar = data-loss guard) and a dev/test alarm
that throws when a route reads a lazy collection it didn't declare.

### Current blob composition (live, 2026-09-04) — the peel targets
| collection | size | % | note |
|---|---|---|---|
| `outbox` | 1182 KB | 40% | 2,809 no-op events; generation now fixed, clear the backlog |
| `devTeamWorkspaceFiles` | 967 KB | 32% | already a declared sidecar; migrate the data |
| `clients` | 181 KB | 6% | |
| `activity` | 177 KB | 6% | append-only; paginate |
| `identityResolutionReviews` | 70 KB | 2% | render-time write hazard |
| `clientRecordLedger` | 45 KB | 2% | render-time write hazard |
| (+ 86 small collections) | ~460 KB | 12% | the mandatory floor read every render |

Peeling `outbox` + `devTeamWorkspaceFiles` alone takes the main blob from 2.9 MB
to ~0.8 MB.

### Peel order (safest first) and hazards
`0` devTeamWorkspaceFiles (code done, data migration pending) → `1`
clientPortalTemplates (own row already, single surface, no chrome dependency) →
`2/3` radarEvidence + radarMemory (**blocked until** the server-rendered topbar
`RadarQuickLookControl` / `AdvisorDrawerControl` are deferred to a client fetch —
they read radar on every agency render) → `4` assistant (after the advisor drawer
deferral) → `5` pluginData (needs a per-install split, not one lazy key) → `6`
activity (append-only, paginate). Full blueprint:
`scratchpad/scoped-loading-blueprint.json`.

Render-time WRITE hazards to move off the GET path as part of this:
`persons`/`organisations` (`upsertPerson` — partly addressed by the Cause-C fix),
`clientRecordLedger`, `identityResolutionReviews`, pipelines
(`seedDefaultPipelines`).

### The non-negotiable migration procedure (data safety)
The live database **has lost data before**. Therefore, per cluster:
1. **Rehearse locally first.** Local Supabase is up (`supabase status`). Load a
   copy of the prod blob, apply the migration, verify byte-for-byte that the
   cluster's data now lives in its row and the main blob no longer carries it,
   and that reads/writes still work through the app against
   `PORTAL_BACKEND=supabase`.
2. **Move, never delete.** Copy collection → new sidecar row → verify → only then
   remove from the main blob. Never a blind delete or a whole-blob overwrite.
3. **Back up live** before applying (see the self-managed backup runbook).
4. **Apply through the app's coordinated patch** (compare-and-swap on the row
   version) so it cannot clobber a concurrent write, or apply during a quiet
   window. Verify live read counts before and after.
5. One cluster per change. Diff the smoke failure list by name, not count.

---

## 5. Why a persistent server (Railway) at all

Serverless (Vercel) spins up many isolated instances; each cold-reads the 2.9 MB
blob and, because instances don't share memory, each must re-read for coherence —
turning the blob into a per-request tax and fanning writes across instances into
a worse convoy. A **single always-on instance** keeps one authoritative in-memory
cache (`PORTAL_SINGLE_INSTANCE=true`), so reads are RAM-speed and writes are one
serialised lane. It is the right substrate for this app — and it is also what
makes the render-path non-blocking flush (Cause B fix) correct: the next request
sees the same process's cache, so a render need not wait on the durable write.

Deployment facts are in the `railway-migration-live` memory and
`docs/DEVELOPMENT-HANDOFF.md`: Railway project AquaCRM, service `aquacrm`, root
dir `portal`, region EU-West, GitHub-deployed from `edstorm987/aquacrm@main`,
domain `www.aqua-crm.com`.

---

## 6. One-line summary

One 2.9 MB Postgres row that everything rewrites on every write, hit by
render-time writes and a `person.updated` event flood that was 40% of it, moved
onto a server one ocean away from its database. Latency (region), blocking
(render flush) and volume (event flood) are fixed; the durable fix is to **split
the row into per-domain clusters** using the sidecar machinery that already
exists — rehearsed, one cluster at a time, moving data never deleting it.
