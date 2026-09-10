# Plan — Wire the public storage bucket

← [todo.md](../TODO.md) · [development.md](../../development.md) · reference: [database dossier](../../workspace/database.md) · **[HANDOFF »](public-bucket-HANDOFF.md)** (state + the one remaining live verification)

> **SECURITY CORRECTION / LOCAL FOLLOW-ON (2026-09-10).** The DONE record below
> proves the functional publish-to-CDN path, not a complete content-trust
> boundary. The original public writer trusted the declared MIME type and the
> promotion walker failed open; Phase-2 byte inspection covered the separate
> private-upload path only. A corrective candidate on
> `security/public-upload-byte-inspection-20260910`, based on
> `72acac904ba6af88cb1a3d84483b4a4359d03747`, is currently **local, unmerged and
> undeployed**. It adds byte/type agreement, an 8 MiB bound, recursive nested
> media coverage, strict tenant-path identifiers and fail-closed error handling
> for block-tree data URLs; there is no provider-error inline fallback for those
> recursively inspected values. CSS/head/foot stored-code fields remain separate
> security surfaces.
>
> This does not supply an atomic publication transaction, a durable
> public-object/refcount ledger, a durable
> quarantine/release/rescan/purge store, durable off-platform event drain, live
> scanner proof or live CDN response-header proof. Because uploading before the
> page commit can create an unlinked public object and shared keys make safe
> compensation impossible, the branch now refuses every configured app-server
> write through `storePublicUpload` before scanner/provider I/O and contains no
> dormant remote upload implementation. This does not stop direct authenticated,
> dashboard or other service-role Supabase access; the containment migration is
> a separate release gate. Local development and
> publication of already-public URLs remain available. Remote enablement needs
> durable intent, operation-owned keys, atomic page-generation commit, exact
> lineage/refcounts and an idempotent recovery/recall worker. The scanner's
> audited outbound broker also retains a 1 MiB request cap, so the 8 MiB product
> limit cannot be supported when remote writes are later enabled without an
> explicit owner decision to approve larger scanner-data egress or lower the
> product cap. It is also not retroactive:
> pre-existing public-bucket objects and already-published inline payloads need a
> post-merge inventory + scan + safe republish/removal job. Production remains
> **NOT READY**. Treat the historical
> "pure fail-open walker" and "not code gaps" statements below as superseded for
> security readiness, while retaining them as evidence of the 2026-08-19
> functional milestone.
>
> The private/public bucket names are now fixed security-zone identifiers:
> `aquacrm-uploads` and `aquacrm-public`. Startup, readiness and every
> service-role private Storage operation fail closed if they are renamed,
> swapped or shared; a lower-priority Blob credential cannot mask an unsafe
> Supabase configuration. The forward migration and `rls-verify.sql` also
> reject any `storage.objects` INSERT/UPDATE/DELETE/ALL policy aimed at anon,
> authenticated or PUBLIC by effective command and role, so a renamed or
> dashboard-created write policy cannot hide behind an expected policy name.
> This code guard does not replace applying and verifying the containment and
> bucket-hardening migrations against the live project.

**Historical status at 2026-08-19: ✅ DONE (all phases; runtime-verified in
memory, not then browser/live-bucket). Superseded by the red correction above.**
At that checkpoint, `aquacrm-public` was wired end-to-end: approved
website-editor media is promoted to the bucket on publish and the published
site renders the durable CDN URL. **17 behavioural tests** (8 P1 + 9 P2 incl.
the end-to-end capstone); full suite 0-fail; plugin smoke 49/49; typecheck-clean.
- **P1 historical milestone** — the original helper implemented Supabase `getPublicUrl`/`upsert` plus `deleteSupabasePublicUpload`. The current corrective branch removes the dormant remote upload branch and makes the delete helper throw `PublicUploadOwnershipProofError`; only inspected local-development writes remain until the durable lifecycle exists.
- **P2 historical milestone** — auto-public on publish used the additive `publicMedia` foundation port plus a pure fail-open walker. The current corrective implementation makes recursively inspected block-tree data URLs fail closed and stops the higher-level workflow before GitHub on an active-page failure.
- **P3 (gate)** — satisfied by design: the **publish click is the deliberate gate** (Ed's "auto-public on publish"); drafts stay inline, private uploads keep their own separate helper → nothing private leaks. **Active unpublish-deletion deferred** (content-addressed keys are shared across pages, so safe deletion needs refcounting; an unlinked orphan at an unguessable key is not a new exposure — the bytes were already public when published).
- **P4 (renderers)** — verified: both `ImageBlock` (live) and `renderPageHtml` (export) emit `props.src` directly, so the promoted CDN URL flows through with no proxy/placeholder path. The capstone test renders a published page and asserts the CDN URL is served and the `data:` URL is gone.
- **Decisions (Ed):** approved = editor + brand-kit images · auto-public on publish · defer private→public promotion · the `publicMedia` port is additive and worker-owned.
- **Historical remainder (do not execute):** the old note requested a live Supabase-CDN exercise. Remote publication is now deliberately unavailable and must not be re-enabled for a browser check.

---

_Original plan below (kept for the record)._

**Historical starting point (superseded by DONE status above):** the `aquacrm-public` bucket was declared and
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
