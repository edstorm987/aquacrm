# Handoff — Public bucket (`aquacrm-public`)

> 🗄 **Dated worker debrief — the PLAN is the authority on status.** For where `public-bucket` stands, read [public-bucket.md](public-bucket.md) and its Status line; for where the project stands, [checklist.md](../checklist.md); for what changed, the one log [updates.md](../updates.md). This file is the story — what was built, what broke, what is left — and is kept for that, not as a second status page.
>
> *It stays in `plans/` rather than moving to [archive/](archive/README.md) for two reasons: `smoke-dev-tasks-parse.test.ts` pins it by name in the set of plans that parse to zero phases, and `archive/README.md` says not to archive a handoff another plan still points at as its brief.*

← [plan](public-bucket.md) · [updates.md](../updates.md) · [status.md](../status.md) · [database.md §3](../../workspace/database.md)

**One-liner:** `aquacrm-public` went from *declared-but-dead* → **wired end-to-end**.
Approved website-editor media is promoted to the public CDN bucket **on publish**
and the published site renders durable public URLs instead of inline base64.

**State (2026-08-19):** ✅ **code-complete, all 4 phases; runtime-verified in
memory (17 behavioural tests incl. an end-to-end capstone).** The **only**
outstanding item is a **live browser publish→CDN walk** — blocked this session by
the shared dev-server environment (details below), not by the code.

---

## What shipped

### Phase 1 — the storage helper (owned)
- **`src/lib/server/publicUploadStorage.ts`** (new) — mirror of `privateUploadStorage.ts` for the **public** bucket. `storePublicUpload` uploads to `aquacrm-public` and returns a durable **`getPublicUrl`** CDN link (vs. private, which stores a key and proxies bytes). Precedence: **Supabase → hard-error-in-prod → local `public/uploads-public/`** (no Vercel-Blob tier, `upsert:true` for stable URLs). Plus `deleteSupabasePublicUpload` + config predicates + `PublicUploadStorageError`.

### Phase 2 — auto-public on publish
**Shared foundation (additive — Ed-approved flag):**
- **`src/built-ins/runtime/_types.ts`** — new `PublicMediaPort` + `PublicMediaStoreInput`/`StoredPublicMedia`, and an **optional** `publicMedia?` field on `PluginServices` (optional ⇒ no existing plugin/mock breaks).
- **`src/built-ins/runtime/foundation-adapters/publicMediaAdapter.ts`** (new) — decodes the `data:` URI, gives it a **content-addressed** key (`website-media/<agency>/<client>/<site>/<sha>.<ext>` — identical bytes → stable URL), hands off to `storePublicUpload`.
- **`src/built-ins/runtime/foundation-adapters/index.ts`** — registers `publicMedia: publicMediaAdapter` in the one shared `FOUNDATION_SERVICES`.

**Plugin (owned — website-editor):**
- **`.../src/lib/aquaPluginTypes.ts`** — vendored mirror of the port types + optional `publicMedia?` on its `PluginServices`.
- **`.../src/server/publicMediaPromotion.ts`** (new) — a **pure** walker: rewrites every `data:image/`·`data:video/` prop across the block tree (children + variants), **dedups** identical bytes, and is **fail-open** (a storage error keeps the inline URL, so a publish never blocks).
- **`.../src/server/pages.ts`** — `publishPage` gains an **optional** `{ publicMedia }` param; when present it runs the walker over the blocks being published (absent ⇒ publishes exactly as before).
- **`.../src/api/handlers/pages.ts`** — `handlePublishPage` threads `ctx.services.publicMedia` into `publishPage`.
- **Brand-kit images** need no separate path — they surface as image blocks and ride the same walker (the website-editor brand-kit handler is colours/fonts only).

### Phases 3–4 — gate + renderers (verified, no new code)
- **P3 gate:** satisfied by Ed's **auto-public-on-publish** — the publish click is the deliberate gate; drafts stay inline, private uploads keep their own helper, nothing private leaks. **Active unpublish-deletion deliberately deferred** (content-addressed keys are shared across pages ⇒ safe deletion needs refcounting; an unlinked orphan at an unguessable key isn't a *new* exposure). `deleteSupabasePublicUpload` is ready for a future refcount-aware cleanup.
- **P4 renderers:** audited — both the live `ImageBlock` and the export `renderPageHtml` emit `props.src` directly, so promoted CDN URLs flow through with **no proxy/placeholder path to change**.

### Tests (owned)
- **`scripts/smoke-public-upload-storage.test.ts`** — 8, hermetic (local write, prod fail-closed, predicates, guardrails).
- **`scripts/smoke-public-media-promotion.test.ts`** — 10, hermetic (walker promote/dedup/recurse/fail-open, adapter `parseDataUrl`/`publicMediaKey`, `publishPage` with/without port, foundation wiring, **end-to-end capstone**: draft `data:` → publish → `renderPageHtml` serves the CDN URL, `data:` gone).
- **All hermetic** (fake port/storage, injected env — no global `process.env`/`fetch` mutation; the suite runs files concurrently in one process, so global mutation would pollute neighbours — see [[aquacrm-suite-runs-files-concurrently]]).

### Ed's decisions (locked)
Approved media = **editor + brand-kit images** · approval = **auto-public on publish** · **defer** private→public promotion · the `publicMedia` port is **additive and worker-owned**.

---

## Verification status

| Level | State |
|---|---|
| Typecheck | ✅ my files clean (only transient errors seen were the KPI worker's in-flight `_CommandIntelligenceWorkspace.tsx`, not mine) |
| Full suite (`scripts/*.test.ts`) | ✅ 0-fail on last run (1607 tests). ⚠️ the suite is **flaky run-to-run** in the inbox/enquiry cluster (a separate pre-existing `websiteSources` issue) — re-run if it's red and confirm the failures reproduce with my files removed |
| Plugin smoke (`website-editor/src/__smoke__/*`) | ✅ 49/49 (run **without** `--conditions react-server` — its client components need the client React condition) |
| Live server, app + portal boot | ✅ browser-verified on `:3032` earlier this session — app + full authenticated portal + Radar all render with the new `publicMedia` port HMR'd in, **zero console errors** (proves the shared-foundation change is runtime-safe live) |
| **Live publish→CDN walk** | ❌ **NOT done — the remaining task** (see below) |

---

## The one remaining task: live publish→CDN walk

Prove the plan's "Done when" on a real server: **publish a website-editor page that
has an inline `data:` image, then confirm the published `<img src>` is a public
URL** (and the `data:` blob is gone).

### Why it wasn't done this session
1. The shared `:3032` server was **thrashing on constant recompiles** (~5 workers editing simultaneously), then went **fully down** (`ERR_CONNECTION_REFUSED`).
2. `preview_start` for my own `aquacrm-verify` server is **blocked by a stale folder-lock** — the tooling still tracks the commander chat's dead `aquacrm-portal` server on `:3032` and won't launch a second server in the folder (and can't stop another chat's).

### To do it (whoever has a clean server)
1. **Get a server up:** restart `:3032` from the chat that owns it, **or** free the stale lock and `preview_start` `aquacrm-verify` (auto-port), **or** `npm run dev:verify` (auto-port) if Bash is sanctioned in that chat.
2. **Sign in:** navigate to **`/dev`** (zero-cred founder sign-in) → lands in the portal.
3. **Reach the website editor:** Fulfilment → *Client workspaces* (or a client's *Website* service) → the editor (Editor / Pages / Assets).
4. **Have an inline image:** add an image via the editor's asset picker/upload (it stores a `data:` URL), or use a draft page that already has one.
5. **Publish** the page.
6. **Verify the published render** — inspect the `<img src>`:
   - **Supabase configured** (the `.env` here has it): `https://<project>.supabase.co/storage/v1/object/public/aquacrm-public/website-media/<agency>/<client>/<site>/<sha>.<ext>`
   - **Local-only fallback:** `/uploads-public/website-media/…`
   - …and confirm the giant `data:` URL is **gone**.
7. **(Optional) confirm the object** exists — Supabase dashboard → `aquacrm-public`, or the local file under `public/uploads-public/`.

### ⚠️ Live-bucket note
This `.env` has Supabase configured, so a real publish **writes the image to the
live `aquacrm-public` bucket** (there is no local Supabase sandbox — see
[[aquacrm-local-writes-to-live-supabase]]). That's fine — it's the *strongest*
verification (it exercises the real Supabase-CDN path, the one gap the tests only
pin by shape), all data here is Ed's pre-launch test data, and the object is
deletable (dashboard or `deleteSupabasePublicUpload`). Use an obvious test image
and **delete it after** if you don't want the artifact.

---

## Also non-code, for later
- **Unpublish/erasure cleanup** of public objects (refcount-aware) — deliberately deferred; `deleteSupabasePublicUpload` is the hook.
- The **flaky inbox/enquiry suite cluster** + the KPI worker's transient `tsc` errors are **other workers' lanes**, not this plan.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `docs/development/plans/public-bucket-HANDOFF.md`
