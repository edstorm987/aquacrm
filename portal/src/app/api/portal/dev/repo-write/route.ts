import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { getDevProject } from "@/engines/editor/server/devProjects";
import { SourceEditUnavailable } from "@/engines/editor/server/sourceEdit";
import {
  createRepoPath,
  insertElementIntoRepo,
  listInsertTargets,
  mergeProjectPullRequest,
  openProjectPullRequest,
  revertMergedDraft,
  saveRepoFile,
  type RepoWriteRefusal,
} from "@/engines/editor/server/repoWrite";
import { ensureHydrated } from "@/server/storage";

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
 * FOUNDER + DEV MODE, the same layered gate the source-edit route and the
 * files route's write half use. Reading a repository is an agency-role
 * concern; committing to one is not.
 *
 * ORIGIN checked, like every other mutating portal route.
 *
 * The REPOSITORY, the REF and the TOKEN are never read from the body. All
 * three come off the `DevProject` looked up by `getDevProject(session.agencyId,
 * id)` — tenant first, then project — and the token resolves per-request from
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
  action?: "save" | "create" | "publish" | "insert-targets" | "insert" | "merge" | "revert";
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

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    if (!devDocsAccessible(session)) {
      return NextResponse.json({ ok: false, error: "Dev Mode is required to write to a repository." }, { status: 403 });
    }
    if (!validOrigin(request)) {
      return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as Body | null;
    const projectId = body?.project?.trim();
    if (!projectId) {
      return NextResponse.json({ ok: false, error: "A project is required." }, { status: 400 });
    }
    // Tenant before project, everywhere.
    const project = getDevProject(session.agencyId, projectId);
    if (!project) {
      return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });
    }

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
          agencyId: session.agencyId,
          project,
          path,
          contents: body.contents,
          fingerprint: body.fingerprint.trim(),
          // Passed through, not coerced: `publishEdits` wants exactly `true`.
          confirm: body.confirm,
        });
        if (!result.ok) return refusalResponse(result);
        return NextResponse.json(result);
      }

      if (body?.action === "create") {
        const path = body.path?.trim();
        if (!path || (body.kind !== "file" && body.kind !== "folder")) {
          return NextResponse.json({ ok: false, error: "A path and a kind — file or folder — are required." }, { status: 400 });
        }
        const result = await createRepoPath({
          agencyId: session.agencyId,
          project,
          path,
          kind: body.kind,
          contents: typeof body.contents === "string" ? body.contents : undefined,
          confirm: body.confirm,
        });
        if (!result.ok) return refusalResponse(result);
        return NextResponse.json(result);
      }

      if (body?.action === "publish") {
        const result = await openProjectPullRequest({ agencyId: session.agencyId, project });
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
          agencyId: session.agencyId,
          project,
          // Passed through, not coerced: `mergePullRequest` wants exactly `true`.
          confirm: body.confirm,
        });
        if (!result.ok) return refusalResponse(result);
        return NextResponse.json(result);
      }

      if (body?.action === "revert") {
        const result = await revertMergedDraft({
          agencyId: session.agencyId,
          project,
          confirm: body.confirm,
        });
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
        const result = await listInsertTargets({ agencyId: session.agencyId, project });
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
          agencyId: session.agencyId,
          project,
          path,
          code,
          anchor: atEnd ? { type: "end" } : { type: "after-line", line: afterLine as number },
          label: body.label,
          fingerprint: body.fingerprint?.trim() || undefined,
          // Passed through, not coerced: `publishEdits` wants exactly `true`.
          confirm: body.confirm,
        });
        if (!result.ok) return refusalResponse(result);
        return NextResponse.json(result);
      }

      return NextResponse.json({ ok: false, error: "Say what to do: save, create, publish, merge, revert, insert-targets or insert." }, { status: 400 });
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
    return authErrorResponse(error);
  }
}
