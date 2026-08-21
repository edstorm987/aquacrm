# Editor write path — edit + save, create, upload (queue #2-3)

**Status:** PLAN — captured 2026-08-21, autonomous loop. Writing to a real repo/FS is the
high-risk step Ed flagged; nothing here is built until he nods at the shape. Queue #1's
dev-project entity (selector + per-project connection tokens) landed first and this builds
directly on it.

## Proven current state (checked against source, not docs)

The write machinery **exists end-to-end as a library and has ZERO API callers** — grep
`publishEdits|planPatches` matches only `src/engines/editor/server/{publish,patch}.ts`
themselves. Nothing anywhere can write yet. What exists:

- **Line-grain patches:** `server/patch.ts` — `applyPatch`/`planPatches` refuse on
  registry-stale / unknown-file / line-missing / line-changed (hash) / no-change; typed
  rejections; all-or-nothing plans (patch.ts:119-143).
- **File-grain adapter:** `server/codeAdapter.ts` — `codeEditAdapter` puts whole files on
  the SAME editing loop; fingerprint = `hashFile` (sha256/16) of the whole file
  (codeAdapter.ts:25-27). The files route already returns that fingerprint with every
  file read (files/route.ts:146), so the UI already holds what a save must present.
- **The shared loop:** `editing/engine.ts` — `planEdits` (fingerprint conflict check) →
  `isPublishable` → `runEdits`; dry-run default; `confirm !== true` never writes.
  `editing/leases.ts` — advisory 2-minute edit leases ("Ed is editing") so collisions
  mostly don't happen; fingerprints catch the ones that do.
- **The GitHub write:** `server/publish.ts` — `publishEdits`: dry-run default (publish.ts:106),
  branch-only (never the default branch), create-branch-from-mapped-sha, one tree + one
  commit, `force: false` on the ref update (publish.ts:143-146), refuses partial plans.
  Commits land on a branch that Vercel can preview and Ed can merge or abandon.
- **Read path:** `/api/portal/site-editor/files` GET — working tree (Aqua editing itself)
  or GitHub via `?repo=`/`?project=` (queue #1). Read-only by design; `.env`-style paths
  refused (`isHiddenPath`) even when asked for directly.
- **Gates that already exist:** founder + Dev Mode (`devDocsAccessible`) on the dev-team
  editor page; `AGENCY_ROLES` on the files route; owner/manager on project writes.

**Genuinely missing:** an editable buffer in `_CodeWorkspace.tsx` (it renders `<pre>`),
a save/publish API route, create-file/folder, binary/upload handling, and any decision
about WHERE a save lands.

## The decision Ed owns: where does a save land?

### Option A — GitHub-commit only (recommended)
Every save = `publishEdits` to a branch of the project's repo, using the project's bound
connection token (queue #1's `resolveDevProjectGitHubSource`). Dry-run preview → typed
confirm → commit to `aqua/edit-<date>` branch. Never touches the default branch; never
touches local disk.

- **Not clobbering the shared tree:** it *can't* — no FS writes at all. The uncommitted
  work in Ed's checkout is unreachable by construction.
- Works identically in dev and prod, for Aqua's own repo and client repos.
- Cost: saving to "the repo Aqua is running from" doesn't update the running checkout —
  the branch must be pulled/merged to be seen locally. That is a feature, not a bug:
  it is exactly how the loop's own guardrail ("never push to main, Ed merges") works.

### Option B — local-FS writes in dev
Write through to the working tree when editing the self-repo in dev mode.
- Instant feedback (Turbopack hot-reloads the change).
- **Rejected as the default:** the working tree is SHARED — Ed's uncommitted work and
  any running agent's edits live there. A stray editor save can silently interleave with
  in-flight work; git status noise becomes unattributable; and the blast radius of a bad
  save is the live dev instance everyone is using. If Ed wants it later, it must be:
  founder + dev-mode + memory/file backend only (same ladder as `/dev`), path-confined,
  fingerprint-checked against disk, and refused when `git status` shows the target file
  already dirty (someone's uncommitted work) — the same "reject, don't overwrite" rule
  the patch engine already enforces per line.

### Option C — hybrid (A now, B behind a second explicit gate later)
Ship A; revisit B only if branch-preview round-trips prove too slow for Ed's flow.

**Recommendation: A, then C if needed.** The GitHub path is already built, tested
(smoke-site-editor-publish), branch-only, and force-push-free. It needs an API route and
UI, not new machinery.

## Phases (build plan — when Ed approves)

1. **Save route** `/api/portal/site-editor/save` (POST): body {projectId | repo+ref,
   path, contents, fingerprint, message?, confirm}. Gate: founder + Dev Mode
   (`devDocsAccessible`), NOT plain AGENCY_ROLES — writes are a tier above reads. Server:
   re-read file via project source → `hashFile` check against submitted fingerprint
   (reject "file changed since you opened it") → `publishEdits` with a whole-file plan on
   branch `aqua/edit-{yyyymmdd}-{user}`; `confirm !== true` → dry-run diff back.
2. **UI:** `_CodeWorkspace.tsx` file pane becomes an editable textarea behind an "Edit"
   toggle (only when `editable && fingerprint`); Save opens the dry-run diff (before/after
   from the route) + branch name + commit message field; Confirm publishes; success shows
   the commit sha + branch. Read-only remains the default posture for non-founder roles.
3. **Create file/folder (#3):** same route, `create: true` — no fingerprint (the check
   becomes "must NOT exist"); folders are a UI affordance (git tracks files, so creating
   a folder = naming the path of its first file, `.gitkeep` offered). The git trees API
   already creates new paths — `publishEdits` needs no change beyond allowing a plan
   entry with no prior fingerprint.
4. **Upload/binary (#3/#4):** extend the plan entry with `encoding: "base64"` and pass
   blobs via the git blobs API (`content` + `encoding` on blob creation), size-capped
   (`MAX_EDITABLE_BYTES` for text; a separate, larger cap for uploads). Image preview on
   the read side is queue #4 (data-URL from the contents route for image extensions).
5. **Leases:** surface `editing/leases.ts` in the workspace header ("Ed is editing this
   file") — advisory, cheap, already written.
6. **Tests to pin:** save route refuses without founder+devMode; refuses stale
   fingerprint; refuses hidden paths; dry-run never writes; confirm-string strictness;
   create refuses existing path; branch never equals the default branch.

## Risks
- **Token scope:** publishing needs a token with contents:write. Project-bound
  connections make this per-repo; the catalog copy already tells Ed to grant minimal
  repository permissions. Nothing changes for read-only tokens except a clear 403 surface.
- **Two editors, one file:** covered twice (lease + fingerprint), same as the visual editor.
- **Secrets:** `isHiddenPath` refusal stays on both read AND write.
- **Runaway writes:** branch-only + no-force + all-or-nothing means the worst case is a
  bad commit on a throwaway branch.
