import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { getDevProject } from "@/engines/editor/server/devProjects";
import {
  SourceEditUnavailable,
  editBranchName,
  findWordsInProject,
  publishWordsEdit,
} from "@/engines/editor/server/sourceEdit";
import { ensureHydrated } from "@/server/storage";

/**
 * Words → source → a commit.
 *
 * The caller `patch.ts` and `publish.ts` never had. Two actions, matching the
 * two steps in `sourceEdit.ts`, and they are separate for the reason the whole
 * feature turns on: FIND guesses (there is no location on a tag selection —
 * see `sourceMatch.ts`), so a human confirms one candidate before PUBLISH
 * commits it.
 *
 * ── The guards, and why each one ────────────────────────────────────────────
 *
 * FOUNDER + DEV MODE, the same layered gate as every dev-team surface and the
 * same one the files route uses for writes. Reading a repository is an
 * agency-role concern; committing to one is not.
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
 * CONFIRM is checked for exactly `true` by `publishEdits`, and this route
 * passes the body's value through rather than coercing it — a truthy `"1"`
 * from somewhere must not be able to commit.
 *
 * POST only. A GET that reads a repository through somebody's token is a
 * request a browser can be made to send from anywhere.
 */

type Body = {
  action?: "find" | "publish";
  project?: string;
  text?: string;
  file?: string;
  line?: number;
  expectedHash?: string;
  commitSha?: string;
  originalText?: string;
  newText?: string;
  confirm?: boolean;
  openPullRequest?: boolean;
  message?: string;
};

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    if (!devDocsAccessible(session)) {
      return NextResponse.json({ ok: false, error: "Dev Mode is required to edit source." }, { status: 403 });
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
      if (body?.action === "publish") {
        const file = body.file?.trim();
        const commitSha = body.commitSha?.trim();
        const expectedHash = body.expectedHash?.trim();
        const originalText = typeof body.originalText === "string" ? body.originalText : "";
        const newText = typeof body.newText === "string" ? body.newText : "";
        if (!file || !commitSha || !expectedHash || !Number.isInteger(body.line) || (body.line ?? 0) < 1) {
          return NextResponse.json({
            ok: false,
            error: "Pick one of the places those words were found before saving.",
          }, { status: 400 });
        }
        if (!originalText.trim()) {
          return NextResponse.json({ ok: false, error: "The original words are required." }, { status: 400 });
        }

        const result = await publishWordsEdit({
          agencyId: session.agencyId,
          project,
          file,
          line: body.line as number,
          expectedHash,
          commitSha,
          originalText,
          newText,
          // Passed through, not coerced: `publishEdits` wants exactly `true`.
          confirm: body.confirm,
          openPullRequest: body.openPullRequest,
          message: body.message,
          actorUserId: session.userId,
        });
        return NextResponse.json({ ok: true, ...result });
      }

      const text = typeof body?.text === "string" ? body.text : "";
      const found = await findWordsInProject({ agencyId: session.agencyId, project, text });
      return NextResponse.json({ ok: true, branch: editBranchName(project), ...found });
    } catch (error) {
      if (error instanceof SourceEditUnavailable) {
        return NextResponse.json({
          ok: false,
          code: error.code,
          error: error.message,
          ...(error.code === "no-token"
            ? { href: "/portal/agency/company?view=connections&integration=github" }
            : {}),
        }, { status: 409 });
      }
      return NextResponse.json({
        ok: false,
        error: error instanceof Error ? error.message : "That repository could not be read.",
      }, { status: 502 });
    }
  } catch (error) {
    return authErrorResponse(error);
  }
}
