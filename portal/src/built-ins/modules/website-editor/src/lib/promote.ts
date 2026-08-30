"use client";

// One-shot promote-to-GitHub from the admin client. Bundles the per-site
// custom head/body code (stored locally on the Site record) into the
// request so the server can write it into portal.site.json.
//
// Adapted from `02/src/lib/admin/promote.ts`. Plugin-namespaced API
// path. Server handler is currently a Round-1 stub (see
// `src/api/handlers/promote.ts`); the round-2 server side will resolve a
// GitHub app token and open a real PR.
//
// ── The path this used to call ───────────────────────────────────────────
//
// It POSTed to `/api/portal/website-editor/promote/<siteId>`. The route the
// module actually declares is `/promote` (`api/routes.ts`), with `siteId`
// read from the JSON body — so every promote from the editor's publish modal
// 404'd on a path that has never existed, and the modal reported it as a
// promote failure rather than a missing route. The siteId now travels in the
// body, which is where `handlePromote` has always looked for it.

import { getSite } from "./sites";

export interface PromoteResult {
  ok: boolean;
  /**
   * True while the server side is still the Round-1 stub: the request was
   * accepted and nothing was pushed. `ok: true` alone must never be read as
   * "a pull request exists" — the stub answers exactly that.
   */
  pending?: boolean;
  note?: string;
  branch?: string;
  prUrl?: string;
  prNumber?: number;
  error?: string;
  files?: Array<{ path: string; content: string }>;
}

export interface PromoteOptions {
  message?: string;
  includePages?: boolean;
  includeContent?: boolean;
  includeSite?: boolean;
}

export async function promoteSiteToGitHub(siteId: string, opts: PromoteOptions = {}): Promise<PromoteResult> {
  const site = getSite(siteId);
  const res = await fetch("/api/portal/website-editor/promote", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      siteId,
      message: opts.message,
      siteName: site?.name,
      customHead: site?.customHead,
      customBody: site?.customBody,
      includePages: opts.includePages,
      includeContent: opts.includeContent,
      includeSite: opts.includeSite,
    }),
  });
  return res.json() as Promise<PromoteResult>;
}
