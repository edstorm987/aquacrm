# Plan — Wire the public storage bucket

← [todo.md](../todo.md) · [development.md](../../development.md) · reference: [database dossier](../../workspace/database.md) · **[HANDOFF »](public-bucket-HANDOFF.md)** (state + the one remaining live verification)

**Status: ✅ DONE (2026-08-19, all phases; runtime-verified in memory, not yet
browser/live-bucket).** `aquacrm-public` is wired end-to-end: approved
website-editor media is promoted to the bucket on publish and the published
site renders the durable CDN URL. **17 behavioural tests** (8 P1 + 9 P2 incl.
the end-to-end capstone); full suite 0-fail; plugin smoke 49/49; typecheck-clean.
- **P1** — [`publicUploadStorage.ts`](../../../src/lib/server/publicUploadStorage.ts): `storePublicUpload` → durable `getPublicUrl` (Supabase → hard-error-in-prod → local `public/`, no Blob tier, `upsert`) + `deleteSupabasePublicUpload`.
- **P2** — auto-public on publish: the new additive `publicMedia` foundation port ([`publicMediaAdapter.ts`](../../../src/built-ins/runtime/foundation-adapters/publicMediaAdapter.ts)) + a pure fail-open walker ([`publicMediaPromotion.ts`](../../../src/built-ins/modules/website-editor/src/server/publicMediaPromotion.ts)) wired into `publishPage`; brand-kit images ride the same walker.
- **P3 (gate)** — satisfied by design: the **publish click is the deliberate gate** (Ed's "auto-public on publish"); drafts stay inline, private uploads keep their own separate helper → nothing private leaks. **Active unpublish-deletion deferred** (content-addressed keys are shared across pages, so safe deletion needs refcounting; an unlinked orphan at an unguessable key is not a new exposure — the bytes were already public when published).
- **P4 (renderers)** — verified: both `ImageBlock` (live) and `renderPageHtml` (export) emit `props.src` directly, so the promoted CDN URL flows through with no proxy/placeholder path. The capstone test renders a published page and asserts the CDN URL is served and the `data:` URL is gone.
- **Decisions (Ed):** approved = editor + brand-kit images · auto-public on publish · defer private→public promotion · the `publicMedia` port is additive and worker-owned.
- **Remaining (not code gaps):** browser-verify the publish→CDN flow on a live server; exercise the real Supabase-CDN upload against a live bucket (source-shape-pinned today).

---

_Original plan below (kept for the record)._

**Status: PLAN (not wired).** The `aquacrm-public` bucket is declared and
prod-required but **nothing in the code uses it**. Wire it so approved website
media gets real public URLs.

## Where we are (verified)
- Two buckets are configured: `aquacrm-uploads` (private) and **`aquacrm-public`** (env `NEXT_PUBLIC_SUPABASE_PUBLIC_BUCKET`, "approved website media only" per `.env.example`, prod-required in `env.ts`).
- **Private uploads work** — `lib/server/privateUploadStorage.ts` uploads to the private bucket and the app **proxies the bytes** back through itself (no public URL).
- **The public bucket is never touched** — no `.storage.from(public)`, no `getPublicUrl`, no `createSignedUrl` anywhere in the repo. It's declared, required at boot, and unused.

## The gap
Anything that needs a **public, CDN-served URL** — images used on a client's live
public website, brand-kit assets rendered by the website editor — currently has
nowhere to go: private storage is server-proxied (fine for portal files, wrong
for public-site media). So public-site media is either missing or mis-routed.

## Phases
1. ✅ **`publicUploadStorage` helper** — mirror `privateUploadStorage.ts` but target `aquacrm-public` and return **`getPublicUrl`** (the durable public/CDN URL). Same provider-precedence shape (Supabase → error in prod → local in dev).
2. ✅ **Identify what goes public** — approved website-editor assets + brand-kit images that appear on public sites. Route *those* uploads to the public helper; **everything else stays private** (portal files, CVs, recordings, expense attachments).
3. ✅ **Approval gate** — "approved website media only": publishing an asset to the public bucket is a deliberate step (a publish/approve action), so nothing private leaks public by default.
4. ✅ **Wire the renderers** — the website editor / public site rendering uses the public URLs (replaces any server-proxied or placeholder paths for public media).

## Reuse
`privateUploadStorage.ts` (mirror the pattern), the Supabase storage client, the website-editor asset handling (`built-ins/modules/website-editor` assets), the existing bucket env vars.

## Decisions (Ed)
- **What exactly is "approved website media"** — website-editor image assets only, brand-kit images, or all media flagged public?
- The **approval flow** — auto-public on publish, or an explicit "make public" action?
- Any private→public promotion path (an existing private asset the owner later publishes)?

## Done when (runtime-verified)
An approved website image uploads to `aquacrm-public` and **serves via a public
URL on the live site**; private files (portal/CV/recordings) stay private and
server-proxied; nothing private is exposed. Behavioural test on the public vs
private routing.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/lib/server/publicUploadStorage.ts`
- `src/built-ins/runtime/foundation-adapters/publicMediaAdapter.ts`
- `src/built-ins/runtime/foundation-adapters/index.ts`
- `src/built-ins/runtime/_types.ts`
- `src/built-ins/modules/website-editor/src/server/publicMediaPromotion.ts`
- `src/built-ins/modules/website-editor/src/server/pages.ts`
- `src/built-ins/modules/website-editor/src/api/handlers/pages.ts`
- `src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`
- `scripts/smoke-public-upload-storage.test.ts`
- `scripts/smoke-public-media-promotion.test.ts`
- `docs/development/plans/public-bucket.md`
- `docs/development/plans/public-bucket-HANDOFF.md`
