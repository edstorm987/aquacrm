// LIBRARIAN — the browser side of one call: find.
//
// The Librarian FINDS; the Aqua Editor AI EDITS. This module is the find
// half's wire: one endpoint, one request shape, one response shape. The
// server side is the file-finding SKILL (`src/lib/server/dev/fileFinding.ts`,
// built once for ANY assistant) behind `/api/portal/dev/librarian`, which
// gates (role → Dev Mode → origin) and scopes every call to the SESSION's
// agency — the browser names a `projectId`, never a tenant, and the server
// answers a foreign id exactly as it answers an invented one.
//
// The types below are the wire shapes of `FileFindingResult` et al, declared
// again here rather than imported because `fileFinding.ts` is `server-only`
// and importing it into a client component would drag the store — and the
// GitHub token ladder behind it — toward the browser bundle. The same rule as
// `editorAiClient.ts`: the route's response is the authority; this is its
// shape.

export const LIBRARIAN_ENDPOINT = "/api/portal/dev/librarian";

export type LibrarianSource = "repo" | "reference" | "docs";

/** Why a hit matched — the WHY the panel must show, never swallow. */
export type LibrarianReasonKind = "path" | "symbol" | "doc-title" | "content";

export interface LibrarianReason {
  kind: LibrarianReasonKind;
  term: string;
  detail: string;
}

export interface LibrarianHit {
  source: LibrarianSource;
  path: string;
  title?: string;
  termsMatched: number;
  score: number;
  reasons: LibrarianReason[];
}

/** Which of the four levels the repository half answered from. */
export type LibrarianRepoStatus = "full-tree" | "workspace" | "map-only" | "none";

export interface LibrarianSearched {
  repo: { status: LibrarianRepoStatus; detail: string; filesSearched: number };
  docs: { searched: boolean; total: number; detail?: string };
  reference: { searched: boolean; pages: number; detail?: string };
}

export interface LibrarianFindResult {
  query: string;
  terms: string[];
  hits: LibrarianHit[];
  capped: boolean;
  limit: number;
  reason?: "empty-query";
  detail?: string;
  /** What was and was NOT looked at — rendered, because "not found" is only meaningful for what was searched. */
  searched: LibrarianSearched;
}

export type LibrarianFindResponse =
  | { ok: true; result: LibrarianFindResult }
  | { ok: false; error: string };

/**
 * Ask the Librarian. Network and shape failures come back as `ok: false` with
 * a sentence, so the panel always has something honest to render.
 */
export async function findViaLibrarian(input: {
  query: string;
  projectId?: string;
  limit?: number;
}): Promise<LibrarianFindResponse> {
  try {
    const response = await fetch(LIBRARIAN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await response.json().catch(() => null) as LibrarianFindResponse | null;
    if (!body || typeof body !== "object" || typeof body.ok !== "boolean") {
      return { ok: false, error: "The Librarian did not answer." };
    }
    if (!body.ok && !body.error) return { ok: false, error: "The Librarian could not search." };
    return body;
  } catch {
    return { ok: false, error: "The Librarian could not be reached." };
  }
}
