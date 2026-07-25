// GitHub PR promote — Round-1 handler is a SHIM. Wiring the real
// GitHub-PR-publish flow requires the Postgres migration flagged in
// `04-architecture.md` §13. Round-1 returns a deterministic stub
// response so the editor's publish-modal flow can be exercised end-to-
// end without erroring.
//
// **TODO** Round 2: lift the GitHub Octokit + branch/PR creation logic
// from `02/src/app/api/portal/promote/[siteId]/route.ts`.

import type { PluginCtx } from "../../lib/aquaPluginTypes";
import { fail, ok, readJsonBody, requireClientScope } from "../helpers";

export async function handlePromote(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ siteId?: string; branch?: string }>(req);
  if (!body?.siteId) return fail("siteId required", 400);
  return ok({
    pending: true,
    note: "Round-1 stub — GitHub PR promote arrives in Round 2 after Postgres migration. See 04-architecture.md §13.",
    branch: body.branch ?? "main",
    siteId: body.siteId,
  });
}
