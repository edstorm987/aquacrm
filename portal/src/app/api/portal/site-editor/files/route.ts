import { NextResponse, type NextRequest } from "next/server";
import { lstat, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { accessErrorResponse } from "@/server/accessControl";
import {
  requireDevProjectAccess,
  requireWholeWorkingTreeFounderAccess,
} from "@/lib/server/dev/devProjectAccess";
import { MAX_EDITABLE_BYTES, MAX_READ_BYTES, buildFileTree, describeFile, imageContentType, isHiddenPath } from "@/engines/editor/server/fileTree";
import { hashFile } from "@/engines/editor/server/codeAdapter";
import { readWorkspaceFiles } from "@/engines/editor/server/workspaceFiles";
import { DevPathScopeError, assertPathInScope, devPathScope, isUnrestricted, scopeAllowsListing, type DevPathScope } from "@/lib/server/dev/devPathScope";
import { GitHubNotConfigured, isGitHubNotFound, readRepoFile, readRepoTree, type RepoHead } from "@/engines/editor/server/githubSource";
import { editBranchName } from "@/engines/editor/server/sourceEdit";
import { devProjectGitHubToken } from "@/engines/editor/server/devProjects";
import { resolveIntegrationValues } from "@/lib/server/integrations/integrationConnections";
import type { DevProject } from "@/server/types";

/**
 * The repository's files, for code mode.
 *
 * Reads the working tree rather than GitHub. The GitHub path is the one that
 * will ship, but it needs a connected token and a repository per site, and
 * neither is required to prove the editor works — the files on disk are the
 * same files.
 *
 * Read-only. Saving goes through the shared editing engine and its publish
 * path, which commits to a branch and needs an explicit confirmation; nothing
 * here writes to disk.
 */

/** Everything is resolved inside this. A path that escapes it is refused. */
const ROOT = process.cwd();

function safePath(requested: string): string | null {
  // Resolved and then checked, rather than pattern-matched: `..` can be
  // spelled many ways, and the only reliable question is where it lands.
  if (requested.includes("\0")) return null;
  const target = resolve(ROOT, requested);
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
  const rel = relative(ROOT, target);
  if (rel && isHiddenPath(rel)) return null;
  return target;
}

/**
 * safePath, but proof against symlinks.
 *
 * `resolve()` normalises `..` LEXICALLY; it does not follow links — while
 * stat/readFile/writeFile all do. A link inside the tree pointing outside it
 * was therefore a write-through hole, and this repo genuinely contains
 * symlinks. realpath asks the filesystem where the path ACTUALLY lands, which
 * is the only question worth asking before writing to it.
 */
async function realSafePath(requested: string): Promise<string | null> {
  const target = safePath(requested);
  if (!target) return null;
  try {
    const [realRoot, realTarget] = await Promise.all([realpath(ROOT), realpath(target)]);
    if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) return null;
    const rel = relative(realRoot, realTarget);
    if (rel && isHiddenPath(rel.split(sep).join("/"))) return null;
    return realTarget;
  } catch {
    // Cannot be resolved (missing, or a dangling link) — refuse, never guess.
    return null;
  }
}

/**
 * A fingerprint bound to the PATH as well as the contents.
 *
 * Hashing contents alone answers "does some file have this content", not "is
 * this the file you opened" — and this repo contains byte-identical files (nine
 * copies of safeDate.ts among them). That let a buffer for one file pass the
 * staleness check against a different, identical one.
 */
function fingerprintFor(path: string, contents: string): string {
  return hashFile(`${path}\u0000${contents}`);
}

/**
 * One write at a time per path, in-process.
 *
 * The fingerprint check and the write are two awaits apart, and Next serves
 * concurrent requests in one process — so two saves could both read the same
 * contents, both hash-match, and both write, the second silently destroying
 * the first with ok:true returned to each. Serialising per path closes that
 * window for this server.
 */
const writeLocks = new Map<string, Promise<unknown>>();

function withWriteLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = writeLocks.get(key) ?? Promise.resolve();
  // `then(run, run)` so one caller's failure never strands the queue.
  const result = previous.then(run, run);
  const settled = result.then(() => undefined, () => undefined);
  writeLocks.set(key, settled);
  void settled.finally(() => {
    if (writeLocks.get(key) === settled) writeLocks.delete(key);
  });
  return result;
}

/**
 * The GitHub connection to read a repository with.
 *
 * Resolution order, most specific first:
 *   1. the project's OWN bound connection (multi-project, multi-token)
 *   2. the agency's github connection
 *   3. the environment token (single-tenant deployments)
 *
 * `project` is optional, so callers that pass none behave exactly as before.
 */
function githubSourceFor(
  agencyId: string,
  repository: string,
  ref: string,
  project?: DevProject | null,
  allowSharedCredentials = true,
) {
  const token = (project ? devProjectGitHubToken(agencyId, project) : null)
    || (allowSharedCredentials
      ? resolveIntegrationValues(agencyId, "github").token || process.env.GITHUB_TOKEN?.trim()
      : undefined);
  if (!token) throw new GitHubNotConfigured();
  return { repository, ref, token };
}

export async function GET(request: NextRequest) {
  try {
    const requested = request.nextUrl.searchParams.get("path");
    const projectId = request.nextUrl.searchParams.get("project")?.trim();
    const requestedRepository = request.nextUrl.searchParams.get("repo")?.trim() || "";
    const requestedRef = request.nextUrl.searchParams.get("ref")?.trim() || "";
    let project: DevProject | null = null;
    let agencyId: string;
    let repository: string;
    let ref: string;
    let explicitRef = requestedRef;
    let mayEdit = false;
    let allowSharedCredentials = false;
    let grantedScope: DevPathScope | null = null;

    if (projectId) {
      const access = await requireDevProjectAccess({
        projectId,
        capability: "project.view",
        elementCapability: "element.development.code.view",
      });
      project = access.project;
      agencyId = access.resourceAgencyId;
      // The EFFECTIVE surface — the project's, narrowed by this person's grants.
      // Resolved by `requireDevProjectAccess` so all four file boundaries read
      // the same answer rather than each recomputing it.
      grantedScope = access.pathScope;
      mayEdit = access.resolution.capabilities.includes("project.edit")
        && access.resolution.capabilities.includes("element.development.code.use");
      allowSharedCredentials = access.resolution.ownerBaseline;

      if (project.repository) {
        // A project grant is authority over this configured repository only.
        // Request parameters may select the configured base ref, never swap in
        // another repository or an unrelated branch.
        if (requestedRepository && requestedRepository !== project.repository) {
          return NextResponse.json({ ok: false, error: "That repository is not connected to this project." }, { status: 403 });
        }
        const projectRef = project.ref || "main";
        if (requestedRef && requestedRef !== projectRef) {
          return NextResponse.json({ ok: false, error: "That branch is not connected to this project." }, { status: 403 });
        }
        repository = project.repository;
        ref = projectRef;
      } else {
        // A repository-less project must not become a capability tunnel into
        // Aqua's checkout. Only the local owner can use the working-tree path.
        await requireWholeWorkingTreeFounderAccess();
        repository = requestedRepository;
        ref = requestedRef || "main";
      }
    } else {
      const owner = await requireWholeWorkingTreeFounderAccess();
      agencyId = owner.resourceAgencyId;
      mayEdit = true;
      allowSharedCredentials = true;
      repository = requestedRepository;
      ref = requestedRef || "main";
    }

    // WHAT THIS PROJECT EXPOSES.
    //
    // The editor serves from the working tree, so a project pointed at a large
    // shared repository handed the WHOLE thing to anyone who could open it —
    // Ed, 2026-08-27: *"we can't expose the whole repo in Fulfilment"*. A
    // project with no `allowedPaths` is unrestricted, which is what every
    // existing project is, so this changes nothing until a scope is set.
    //
    // Computed once and applied to BOTH the single-file read and the tree: a
    // guard on the file alone would still hand over a complete listing of the
    // repository, which is most of what an attacker wants anyway.
    // The resolved scope when a project authorised this call; the project's own
    // surface otherwise (the working-tree path, which is owner-only anyway).
    const scope = grantedScope ?? devPathScope(project?.allowedPaths);
    if (requested) assertPathInScope(scope, requested, "read");

    // A repository named means GitHub. Without one the working tree is read,
    // which is the same repository when Aqua is editing itself.
    if (repository) {
      try {
        const source = githubSourceFor(agencyId, repository, ref, project, allowSharedCredentials);
        // THE DRAFT BRANCH IS THE TRUTH once it exists. A repo-backed
        // project's saves and creates are commits on `aqua-editor/<id>` —
        // reading main here while the writes land there made every save look
        // lost, every created file invisible, and every reopened file a
        // stale-fingerprint refusal (the fingerprint of main's copy against a
        // branch that had moved on). So: try the draft branch, fall back to
        // the base ref before the first commit ever lands. An explicit ?ref=
        // still wins — that is the "show me main" affordance — and the
        // response SAYS which one answered, so the UI never claims main while
        // showing a draft.
        const draftBranch = project && project.repository === repository && !explicitRef
          ? editBranchName(project)
          : null;
        if (!requested) {
          let head: RepoHead | null = null;
          let draft = false;
          if (draftBranch) {
            try {
              head = await readRepoTree({ ...source, ref: draftBranch });
              draft = true;
            } catch (error) {
              // Only an absent ref means "no draft yet". Authentication,
              // throttling, network and GitHub 5xx failures must remain errors;
              // showing main after one of those would call stale source truth.
              if (!isGitHubNotFound(error)) throw error;
            }
          }
          if (!head) head = await readRepoTree(source);
          return NextResponse.json({
            ok: true,
            source: "github",
            repository,
            ref: draft && draftBranch ? draftBranch : ref,
            ...(draft && draftBranch ? { draftBranch } : {}),
            sha: head.sha,
            count: head.files.length,
            // Said out loud: a silently half-listed repository is worse than
            // an error, because the missing file looks like it does not exist.
            truncated: head.truncated,
            tree: buildFileTree(head.files.filter(file => scopeAllowsListing(scope, file.path))),
          });
        }
        let repoFile: Awaited<ReturnType<typeof readRepoFile>> | null = null;
        let draft = false;
        if (draftBranch) {
          try {
            repoFile = await readRepoFile({ ...source, ref: draftBranch }, requested);
            draft = true;
          } catch (error) {
            // A missing branch/path can fall back before the first draft
            // commit. Every other failure is an outage, never "no draft".
            if (!isGitHubNotFound(error)) throw error;
          }
        }
        if (!repoFile) repoFile = await readRepoFile(source, requested);
        return NextResponse.json({
          ok: true,
          source: "github",
          ...(draft && draftBranch ? { draftBranch } : {}),
          ...repoFile,
          editable: mayEdit && repoFile.editable !== false,
        });
      } catch (error) {
        if (error instanceof GitHubNotConfigured) {
          return NextResponse.json({
            ok: false,
            needsGitHub: true,
            error: error.message,
            // The editor page renders the inline Connect GitHub panel in its
            // Settings — the fix lives THERE, not on the Company page.
            href: "/portal/dev-team/editor",
          }, { status: 409 });
        }
        return NextResponse.json({
          ok: false,
          error: error instanceof Error ? error.message : "That repository could not be read.",
        }, { status: 502 });
      }
    }

    if (!requested) {
      const files = (await readWorkspaceFiles(ROOT))
        .filter(file => scopeAllowsListing(scope, typeof file === "string" ? file : file.path));
      return NextResponse.json({
        ok: true,
        tree: buildFileTree(files),
        count: files.length,
        // The UI needs to SAY the tree is partial. A silently trimmed listing
        // reads as "the repository is small", and the next person wonders why
        // their file is missing rather than learning it is out of scope.
        scoped: !isUnrestricted(scope) || undefined,
      });
    }

    const target = safePath(requested);
    if (!target) return NextResponse.json({ ok: false, error: "That path cannot be opened." }, { status: 403 });

    const info = await stat(target).catch(() => null);
    if (!info?.isFile()) return NextResponse.json({ ok: false, error: "Not a file." }, { status: 404 });

    const described = describeFile(requested, info.size);

    // An image is shown, not read as characters.
    if (described.kind === "image") {
      if (!described.readable) {
        return NextResponse.json({
          ok: true,
          path: requested,
          editable: false,
          readable: false,
          kind: "image",
          reason: described.reason,
          size: info.size,
        });
      }
      const bytes = await readFile(target);
      return NextResponse.json({
        ok: true, path: requested, editable: false, readable: true, kind: "image",
        dataUrl: `data:${imageContentType(requested)};base64,${bytes.toString("base64")}`,
        size: info.size,
      });
    }

    // Only genuine binaries have nothing to show. Everything else — including
    // a file too large to EDIT — still returns its contents, because rendering
    // an empty pane is what made the editor look like it could not see the
    // repository.
    if (!described.readable) {
      return NextResponse.json({ ok: true, path: requested, editable: false, readable: false, kind: described.kind, reason: described.reason });
    }

    const raw = await readFile(target, "utf-8");
    const truncated = raw.length > MAX_READ_BYTES;
    const contents = truncated ? raw.slice(0, MAX_READ_BYTES) : raw;
    return NextResponse.json({
      ok: true,
      path: requested,
      editable: described.editable,
      readable: true,
      kind: "text",
      reason: described.reason,
      truncatedContents: truncated,
      contents,
      // The same fingerprint the engine checks, so what the editor holds and
      // what a save is judged against cannot drift apart.
      fingerprint: fingerprintFor(requested, contents),
      size: info.size,
    });
  } catch (error) {
    // A scope refusal is a 403 about THIS path, not an access-kernel error —
    // saying "forbidden" without naming what was refused sends the reader to
    // look at their grant when the answer is the project's surface.
    if (error instanceof DevPathScopeError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
    }
    return accessErrorResponse(error);
  }
}

/**
 * Write a file back.
 *
 * This is the one genuinely dangerous thing the editor does, so every guard is
 * deliberate:
 *
 *  • OWNER + LOCAL DEV MODE only. Project repository writes use repo-write;
 *    this handler mutates Aqua's checked-out working tree and is not delegable.
 *  • ORIGIN checked, like every other mutating portal route.
 *  • The path is resolved and then confined to ROOT — `..` can be spelled many
 *    ways, and the only reliable question is where it lands.
 *  • Only files the reader itself calls EDITABLE: text, under the size cap.
 *  • FINGERPRINT match. The editor sends the hash of what it opened; if the
 *    file on disk no longer hashes to that, somebody touched it since and the
 *    save is REFUSED rather than silently overwriting them. This working tree
 *    carries uncommitted work from several places at once — a last-write-wins
 *    editor would destroy it, and that loss is not recoverable.
 *  • Local writes only mean anything where the filesystem is writable. On a
 *    read-only deployment, say so and point at the repository path rather than
 *    failing with a stack trace.
 *
 * A repository-backed project does NOT write here: that path commits to a
 * branch through the engine's publish step, which is a separate confirmed
 * action.
 */
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as
      | { path?: string; contents?: string; fingerprint?: string; project?: string; create?: "file" | "folder" }
      | null;
    // Direct disk mutation is intentionally not delegable. Project access is
    // checked below when a project is named, but the local checkout always
    // keeps this separate owner-only gate as well.
    await requireWholeWorkingTreeFounderAccess();
    const requested = body?.path?.trim();
    if (!requested || (typeof body?.contents !== "string" && !body?.create)) {
      return NextResponse.json({ ok: false, error: "A path and contents are required." }, { status: 400 });
    }
    // Captured after the guard: the narrowing above does not survive into the
    // write closure below, and these must not be re-read from a mutable body.
    const contents: string = typeof body.contents === "string" ? body.contents : "";
    const sentFingerprint = body.fingerprint;

    // A repository-backed project is committed, never written to this disk.
    const projectId = body.project?.trim();
    const projectAccess = projectId
      ? await requireDevProjectAccess({
          projectId,
          capability: "project.edit",
          elementCapability: "element.development.code.use",
        })
      : null;
    const project = projectAccess?.project ?? null;
    if (project?.repository) {
      return NextResponse.json({
        ok: false,
        error: "This project is backed by a repository — changes are committed and published, not written to this workspace.",
      }, { status: 409 });
    }

    // The SAME scope the read side applies. Guarding reads alone would leave a
    // scoped project able to write anywhere it liked — the more dangerous half,
    // and the easier one to forget because the write path resolves its project
    // separately from the read path.
    assertPathInScope(projectAccess?.pathScope ?? devPathScope(project?.allowedPaths), requested, "write");

    // Refuse anything we would not agree to READ back, and cap the size: an
    // uncapped body could truncate a real file and then die part-way through
    // writing it.
    if (Buffer.byteLength(contents, "utf-8") > MAX_EDITABLE_BYTES) {
      return NextResponse.json({ ok: false, error: "That is too large to save here." }, { status: 413 });
    }

    // ── CREATE ────────────────────────────────────────────────────────────
    // A new file or folder cannot be realpath'd (it does not exist yet), so
    // the PARENT is resolved instead and the name appended — same guarantee,
    // asked of the thing that does exist.
    if (body.create === "file" || body.create === "folder") {
      const lexical = safePath(requested);
      if (!lexical) return NextResponse.json({ ok: false, error: "That path cannot be created." }, { status: 403 });

      const parentReal = await realSafePath(dirname(requested) || ".");
      if (!parentReal) {
        return NextResponse.json({ ok: false, error: "That folder does not exist yet — create it first." }, { status: 409 });
      }
      const name = basename(requested);
      if (!name || name === "." || name === "..") {
        return NextResponse.json({ ok: false, error: "Give it a name." }, { status: 400 });
      }
      const created = join(parentReal, name);
      // The parent was proven inside ROOT; confirm the child still is.
      const realRoot = await realpath(ROOT);
      if (created !== realRoot && !created.startsWith(realRoot + sep)) {
        return NextResponse.json({ ok: false, error: "That path cannot be created." }, { status: 403 });
      }
      if (isHiddenPath(relative(realRoot, created).split(sep).join("/"))) {
        return NextResponse.json({ ok: false, error: "That location is not editable here." }, { status: 403 });
      }
      if (await lstat(created).catch(() => null)) {
        return NextResponse.json({ ok: false, error: "Something already exists there." }, { status: 409 });
      }

      return await withWriteLock(created, async () => {
        try {
          if (body.create === "folder") {
            await mkdir(created, { recursive: false });
            return NextResponse.json({ ok: true, path: requested, created: "folder" });
          }
          // A new file must be one the editor would agree to open afterwards.
          if (!describeFile(requested, 0).editable) {
            return NextResponse.json({ ok: false, error: "That file type cannot be edited here." }, { status: 409 });
          }
          // wx: fail if it appeared between the check and the write.
          await writeFile(created, contents, { encoding: "utf-8", flag: "wx" });
          return NextResponse.json({
            ok: true, path: requested, created: "file",
            fingerprint: fingerprintFor(requested, contents),
          });
        } catch (error) {
          const code = (error as NodeJS.ErrnoException)?.code;
          if (code === "EEXIST") return NextResponse.json({ ok: false, error: "Something already exists there." }, { status: 409 });
          if (code === "EROFS" || code === "EACCES" || code === "EPERM") {
            return NextResponse.json({
              ok: false, readOnlyFilesystem: true,
              error: "This deployment's filesystem is read-only. Connect the project to a repository to commit changes instead.",
            }, { status: 409 });
          }
          throw error;
        }
      });
    }

    // Symlink-proof: where does this path ACTUALLY land?
    const target = await realSafePath(requested);
    if (!target) return NextResponse.json({ ok: false, error: "That path cannot be written." }, { status: 403 });

    // Everything from here reads and writes one file, so it runs alone.
    return await withWriteLock(target, async () => {
      const info = await lstat(target).catch(() => null);
      if (!info?.isFile()) return NextResponse.json({ ok: false, error: "Not a file." }, { status: 404 });

      const described = describeFile(requested, info.size);
      if (!described.editable) {
        return NextResponse.json({ ok: false, error: described.reason ?? "That file cannot be edited here." }, { status: 409 });
      }

      const current = await readFile(target, "utf-8");
      if (!sentFingerprint || sentFingerprint !== fingerprintFor(requested, current)) {
        return NextResponse.json({
          ok: false,
          staleFingerprint: true,
          error: "This file changed since you opened it. Reopen it and make the change again — saving now would overwrite somebody else's work.",
        }, { status: 409 });
      }

      // Write beside the target, then RENAME over it. rename() is atomic
      // within a filesystem, so a failure — ENOSPC, a killed dev server, a
      // laptop sleeping mid-write — leaves the original file untouched
      // instead of truncated. Writing in place would destroy it before the
      // first byte of the replacement landed.
      const temporary = `${target}.aqua-tmp-${process.pid}-${Date.now()}`;
      try {
        await writeFile(temporary, contents, "utf-8");
        await rename(temporary, target);
      } catch (error) {
        await unlink(temporary).catch(() => undefined);
        const code = (error as NodeJS.ErrnoException)?.code;
        if (code === "EROFS" || code === "EACCES" || code === "EPERM") {
          return NextResponse.json({
            ok: false,
            readOnlyFilesystem: true,
            error: "This deployment's filesystem is read-only. Connect the project to a repository to commit changes instead.",
          }, { status: 409 });
        }
        throw error;
      }

      return NextResponse.json({
        ok: true,
        path: requested,
        fingerprint: fingerprintFor(requested, contents),
        bytes: Buffer.byteLength(contents, "utf-8"),
      });
    });
  } catch (error) {
    // A scope refusal is a 403 about THIS path, not an access-kernel error —
    // saying "forbidden" without naming what was refused sends the reader to
    // look at their grant when the answer is the project's surface.
    if (error instanceof DevPathScopeError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
    }
    return accessErrorResponse(error);
  }
}
