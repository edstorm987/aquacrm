import { NextResponse, type NextRequest } from "next/server";

import { accessErrorResponse } from "@/server/accessControl";
import { requireDevProjectAccess } from "@/lib/server/dev/devProjectAccess";
import { DevPathScopeError, assertPathInScope } from "@/lib/server/dev/devPathScope";
import { SourceEditUnavailable } from "@/engines/editor/server/sourceEdit";
import { normalisePageSeo } from "@/engines/editor/editing/pageSeo";
import {
  createRepoPath,
  insertElementIntoRepo,
  listInsertTargets,
  mergeProjectPullRequest,
  openProjectPullRequest,
  readPageSeoFromRepo,
  revertMergedDraft,
  saveRepoFile,
  writePageSeoToRepo,
  type RepoWriteRefusal,
} from "@/engines/editor/server/repoWrite";
import type { AccessCapability } from "@/server/types";

/**
 * The write path for a repository-backed project: save, create, publish.
 *
 * The files route refuses these projects by design — local disk is not the
 * repo. This is the GitHub alternative that refusal always pointed at: a save
 * is a commit on the project's draft branch (`aqua-editor/<projectId>`), a new
 * file or folder is a commit of a blob (or a `.gitkeep`), and publish opens —
 * or finds — the branch's pull request. Everything runs through the words
 * editor's proven machinery (`publishEdits` / `openPullRequest`); nothing here
 * is a second GitHub client.
 *
 * ── The guards, and why each one ────────────────────────────────────────────
 *
 * Project access is action-specific: repository reads require project/code
 * view; content writes require project edit/code use; PR, revert and merge
 * use their dedicated release capabilities plus the publish element. The
 * owner keeps these through the canonical baseline; scoped collaborators
 * receive only the project and actions they were granted.
 *
 * ORIGIN checked, like every other mutating portal route.
 *
 * The REPOSITORY, the REF and the TOKEN are never read from the body. All
 * three come off the tenant-resolved `DevProject` — tenant first, then
 * project — and the token resolves per-request from
 * the encrypted vault inside `devProjectGitHubToken`. Nothing secret is in the
 * request and nothing secret is in the response: the shapes below carry a
 * branch, a commit sha and a pull request URL, none of which is a credential.
 *
 * CONFIRM is passed through, not coerced — `publishEdits` wants exactly
 * `true`, and a truthy `"1"` from somewhere must not be able to commit.
 *
 * POST only. A GET that reads a repository through somebody's token is a
 * request a browser can be made to send from anywhere.
 */

type Body = {
  action?: "save" | "create" | "publish" | "insert-targets" | "insert" | "merge" | "revert" | "seo-read" | "seo-write";
  project?: string;
  path?: string;
  contents?: string;
  fingerprint?: string;
  kind?: "file" | "folder";
  confirm?: boolean;
  // ── the element-insert pair (phase 7) ──
  /** The emitted element source. Code, not a secret — same standing as `contents`. */
  code?: string;
  /** Exactly one of the two: a 1-based line to insert after, or the file end. */
  anchor?: { afterLine?: number; atEnd?: boolean };
  /** Names the element in the commit message. Cosmetic. */
  label?: string;
  // ── per-page SEO, the Website surface (phase 9) ──
  /**
   * The operator's SEO values. Passed through `normalisePageSeo` before it
   * reaches anything, so an unknown key, a wrong type or a missing field is a
   * valid `PageSeo` rather than a 500 — the same shape-first rule the portal
   * document's own `normalisePortalDesign` follows.
   */
  seo?: unknown;
};

/**
 * Refusals to statuses. 409 is the default — "the repository disagrees with
 * you" — with the two genuinely different cases split out: a path we refuse to
 * touch at all is 403, an oversized body is 413, and a pull request GitHub
 * itself failed to open is a 502 from upstream, not a conflict.
 */
const REFUSAL_STATUS: Record<RepoWriteRefusal["reason"], number> = {
  "bad-path": 403,
  "not-editable": 409,
  "too-large": 413,
  unreadable: 409,
  "stale-fingerprint": 409,
  "no-change": 409,
  exists: 409,
  "nothing-to-publish": 409,
  "pull-request-failed": 502,
  // ── the element-insert path (phase 7) ──
  // 409s like the rest: "that spot cannot take it" is the file disagreeing
  // with the request, except empty code, which is a malformed request.
  "not-mappable": 409,
  "empty-code": 400,
  "line-missing": 409,
  "unknown-context": 409,
  "no-safe-end": 409,
  // ── the in-editor merge + revert (phase 14) ──
  // 409s: "no PR to merge" and "nothing merged to take back" are the
  // repository disagreeing with the request; a merge GitHub itself refused
  // (conflict, protection rule) is the same disagreement, reported verbatim.
  "no-pull-request": 409,
  "merge-failed": 409,
  "nothing-to-revert": 409,
  // ── per-page SEO (phase 9) ──
  // 409 for the three "this page cannot take it" cases — the file disagreeing
  // with the request, same standing as an insert into an unreadable spot — and
  // 400 for values the operator got wrong, which is a malformed request they
  // can fix in the form in front of them.
  "seo-unsupported": 409,
  "seo-no-head": 409,
  "seo-conflict": 409,
  "seo-invalid": 400,
};

function refusalResponse(refusal: RepoWriteRefusal) {
  return NextResponse.json({
    ok: false,
    reason: refusal.reason,
    // The key the code canvas already knows from the local save path, so one
    // handler shows the one honest sentence for both.
    ...(refusal.reason === "stale-fingerprint" ? { staleFingerprint: true } : {}),
    error: refusal.error,
  }, { status: REFUSAL_STATUS[refusal.reason] });
}

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function accessForAction(action: Body["action"]): {
  capability: AccessCapability;
  elementCapability: AccessCapability;
} {
  if (action === "insert-targets" || action === "seo-read") {
    return {
      capability: "project.view",
      elementCapability: "element.development.code.view",
    };
  }
  if (action === "publish") {
    return {
      capability: "project.pull-request",
      elementCapability: "element.development.publish.use",
    };
  }
  if (action === "merge") {
    // On this deployment merging the release PR is the deploy boundary.
    return {
      capability: "project.deploy",
      elementCapability: "element.development.publish.use",
    };
  }
  if (action === "revert") {
    // Revert prepares a new release on the draft branch. It does not deploy
    // until a later merge, but it is still a publish-level operation.
    return {
      capability: "project.publish",
      elementCapability: "element.development.publish.use",
    };
  }
  return {
    capability: "project.edit",
    elementCapability: "element.development.code.use",
  };
}

export async function POST(request: NextRequest) {
  try {
    if (!validOrigin(request)) {
      return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as Body | null;
    const projectId = body?.project?.trim();
    if (!projectId) {
      return NextResponse.json({ ok: false, error: "A project is required." }, { status: 400 });
    }
    const requiredAccess = accessForAction(body?.action);
    const access = await requireDevProjectAccess({
      projectId,
      ...requiredAccess,
    });
    const { project } = access;
    const agencyId = access.resourceAgencyId;
    const sourceDeps = { allowSharedCredentials: access.resolution.ownerBaseline };

    // THE PATH SCOPE, once, for every action that names a path.
    //
    // This is the repository write path — the files route refuses repo-backed
    // projects by design — so without this a project scoped to its portal files
    // could still COMMIT anywhere in the repository. Placed here rather than in
    // each branch because `save` and `create` both take a path and a third
    // action taking one later would otherwise be born unguarded.
    const requestedPath = typeof body?.path === "string" ? body.path.trim() : "";
    if (requestedPath) assertPathInScope(access.pathScope, requestedPath, "write");

    try {
      if (body?.action === "save") {
        const path = body.path?.trim();
        if (!path || typeof body.contents !== "string" || !body.fingerprint?.trim()) {
          return NextResponse.json({
            ok: false,
            error: "A path, the contents and the fingerprint the file was opened at are required.",
          }, { status: 400 });
        }
        const result = await saveRepoFile({
          agencyId,
          project,
          path,
          contents: body.contents,
          fingerprint: body.fingerprint.trim(),
          // Passed through, not coerced: `publishEdits` wants exactly `true`.
          confirm: body.confirm,
        }, sourceDeps);
        if (!result.ok) return refusalResponse(result);
        return NextResponse.json(result);
      }

      if (body?.action === "create") {
        const path = body.path?.trim();
        if (!path || (body.kind !== "file" && body.kind !== "folder")) {
          return NextResponse.json({ ok: false, error: "A path and a kind — file or folder — are required." }, { status: 400 });
        }
        const result = await createRepoPath({
          agencyId,
          project,
          path,
          kind: body.kind,
          contents: typeof body.contents === "string" ? body.contents : undefined,
          confirm: body.confirm,
        }, sourceDeps);
        if (!result.ok) return refusalResponse(result);
        return NextResponse.json(result);
      }

      if (body?.action === "publish") {
        const result = await openProjectPullRequest({ agencyId, project }, sourceDeps);
        if (!result.ok) return refusalResponse(result);
        return NextResponse.json(result);
      }

      // ── The in-editor merge + revert (phase 14) ──────────────────────────
      // Ed: "no everything inside the editor thats the whole point of it".
      // Merge finds the branch's OPEN pull request itself (a number from the
      // body could name somebody else's PR) and is a DRY RUN unless
      // `confirm === true` — on this deployment the merge IS the deploy.
      // Revert never touches the base branch: it commits the pre-draft
      // contents back onto the DRAFT branch, so taking something back goes
      // through the same publish → PR → merge as putting it up did.

      if (body?.action === "merge") {
        const result = await mergeProjectPullRequest({
          agencyId,
          project,
          // Passed through, not coerced: `mergePullRequest` wants exactly `true`.
          confirm: body.confirm,
        }, sourceDeps);
        if (!result.ok) return refusalResponse(result);
        return NextResponse.json(result);
      }

      if (body?.action === "revert") {
        const result = await revertMergedDraft({
          agencyId,
          project,
          confirm: body.confirm,
        }, sourceDeps);
        if (!result.ok) return refusalResponse(result);
        return NextResponse.json(result);
      }

      // ── The element-insert pair (phase 7) ────────────────────────────────
      // "insert-targets" lists where an element can go; "insert" without
      // `confirm` is the dry-run preview, and with `confirm: true` AND the
      // preview's fingerprint it commits. The two-step is enforced here: a
      // confirm that never saw a preview has no fingerprint, and gets a 400
      // rather than a commit nobody read.

      if (body?.action === "insert-targets") {
        const result = await listInsertTargets({ agencyId, project }, sourceDeps);
        if (!result.ok) return refusalResponse(result);
        return NextResponse.json(result);
      }

      if (body?.action === "insert") {
        const path = body.path?.trim();
        const code = typeof body.code === "string" ? body.code : "";
        const afterLine = body.anchor?.afterLine;
        const atEnd = body.anchor?.atEnd === true;
        const anchorValid = atEnd
          ? afterLine === undefined
          : typeof afterLine === "number" && Number.isInteger(afterLine) && afterLine >= 1;
        if (!path || !code.trim() || !anchorValid) {
          return NextResponse.json({
            ok: false,
            error: "A path, the code and one insert point — a line to insert after, or the end of the file — are required.",
          }, { status: 400 });
        }
        if (body.confirm === true && !body.fingerprint?.trim()) {
          return NextResponse.json({
            ok: false,
            error: "Preview first. Committing needs the fingerprint the preview returned, so a file that changed in between refuses instead of writing.",
          }, { status: 400 });
        }
        const result = await insertElementIntoRepo({
          agencyId,
          project,
          path,
          code,
          anchor: atEnd ? { type: "end" } : { type: "after-line", line: afterLine as number },
          label: body.label,
          fingerprint: body.fingerprint?.trim() || undefined,
          // Passed through, not coerced: `publishEdits` wants exactly `true`.
          confirm: body.confirm,
        }, sourceDeps);
        if (!result.ok) return refusalResponse(result);
        return NextResponse.json(result);
      }

      // ── Per-page SEO, the Website surface (phase 9) ──────────────────────
      // "seo-read" says what the page's head currently says; "seo-write"
      // without `confirm` is the dry-run preview and with `confirm: true` AND
      // the preview's fingerprint it commits. The two-step is enforced here
      // exactly as the insert's is: a page title is something a client reads
      // on Google, and it does not get committed by a form nobody confirmed.

      if (body?.action === "seo-read") {
        const path = body.path?.trim();
        if (!path) {
          return NextResponse.json({ ok: false, error: "A page file is required." }, { status: 400 });
        }
        const result = await readPageSeoFromRepo({ agencyId, project, path }, sourceDeps);
        if (!result.ok) return refusalResponse(result);
        return NextResponse.json(result);
      }

      if (body?.action === "seo-write") {
        const path = body.path?.trim();
        if (!path) {
          return NextResponse.json({ ok: false, error: "A page file is required." }, { status: 400 });
        }
        if (body.confirm === true && !body.fingerprint?.trim()) {
          return NextResponse.json({
            ok: false,
            error: "Preview first. Committing needs the fingerprint the preview returned, so a page that changed in between refuses instead of writing.",
          }, { status: 400 });
        }
        const result = await writePageSeoToRepo({
          agencyId,
          project,
          path,
          // Shape-first: whatever arrived becomes a valid `PageSeo` here, so
          // nothing downstream has to defend against a missing field.
          seo: normalisePageSeo(body.seo),
          fingerprint: body.fingerprint?.trim() || undefined,
          // Passed through, not coerced: `publishEdits` wants exactly `true`.
          confirm: body.confirm,
        }, sourceDeps);
        if (!result.ok) return refusalResponse(result);
        return NextResponse.json(result);
      }

      return NextResponse.json({ ok: false, error: "Say what to do: save, create, publish, merge, revert, insert-targets, insert, seo-read or seo-write." }, { status: 400 });
    } catch (error) {
      if (error instanceof SourceEditUnavailable) {
        return NextResponse.json({
          ok: false,
          code: error.code,
          error: error.message,
          // The Connect GitHub panel lives in the editor's Settings tab.
          ...(error.code === "no-token" ? { href: "/portal/dev-team/editor" } : {}),
        }, { status: 409 });
      }
      return NextResponse.json({
        ok: false,
        error: error instanceof Error ? error.message : "That repository could not be written to.",
      }, { status: 502 });
    }
  } catch (error) {
    if (error instanceof DevPathScopeError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
    }
    return accessErrorResponse(error);
  }
}
