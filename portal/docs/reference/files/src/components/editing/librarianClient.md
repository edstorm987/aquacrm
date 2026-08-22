# `src/components/editing/librarianClient.ts`

← [File index](../../../../files-index.md) · Area: Components — src/components/

**What it is:** LIBRARIAN — the browser side of one call: find.  The Librarian FINDS; the Aqua Editor AI EDITS. This module is the find half's wire: one endpoint, one request shape, one response shape. The server side is the file-finding SKILL (`src/lib/server/dev/fileFinding.ts`, built once for ANY assistant) behind `/api/portal/dev/librarian`, which gates (role → Dev Mode → origin) and scopes every call to the SESSION's agency — the browser names a `projectId`, never a tenant, and the server answers a foreign id exactly as it answers an invented one.  The types below are the wire shapes of `FileFindingResult` et al, declared again here rather than imported because `fileFinding.ts` is `server-only` and importing it into a client component would drag the store — and the GitHub token ladder behind it — toward the browser bundle. The same rule as `editorAiClient.ts`: the route's response is the authority; this is its shape.

## Exports (10)

- `LIBRARIAN_ENDPOINT`
- `type LibrarianSource`
- `type LibrarianReasonKind`
- `interface LibrarianReason (3 members)`
- `interface LibrarianHit (6 members)`
- `type LibrarianRepoStatus`
- `interface LibrarianSearched (3 members)`
- `interface LibrarianFindResult (8 members)`
- `type LibrarianFindResponse`
- `async findViaLibrarian(input: { query: string; projectId?: string; limit?: number; }): Promise<LibrarianFindResponse>`

## Used by (1)

- [`src/components/editing/LibrarianPanel.tsx`](./LibrarianPanel.md)

