# `scripts/smoke-file-finding-skill.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** FILE FINDING — the skill, built once, callable by any assistant.  Ed (dev-editor-finish.md, phase 15): "the librarian … is for files finding make it a skill they can all use as well". This pins the skill itself — `src/lib/server/dev/fileFinding.ts` — NOT any one consumer of it. The Librarian and the Aqua Editor AI mount it later; if their needs diverge, the divergence belongs in the consumer, and these contracts hold.  The five properties the plan names, each from both sides:  1. RANKED — a file NAMED like the query beats a symbol named like it, which beats a doc titled like it, which beats a passing mention; and a hit answering MORE of the query's terms beats them all. 2. CAPPED — `limit` is honoured and the cap is confessed, never silent. 3. TENANT-ISOLATED — another agency's project id throws the same `project_not_found` a made-up id does. No repo, no oracle. 4. DEGRADES, honestly — no repo map → docs + reference still answer, and `searched.repo.status` says so. 5. NO NETWORK WITHOUT A TOKEN — a GitHub-mapped project with no resolvable token searches only the recorded map. Asserted with a tripwired readTree AND a tripwired global fetch.

_No exported symbols (side-effect / internal module)._

## Depends on (6)

- [`src/engines/editor/server/devProjects.ts`](../src/engines/editor/server/devProjects.md)
- [`src/lib/server/dev/devDocs.ts`](../src/lib/server/dev/devDocs.md)
- [`src/lib/server/dev/fileFinding.ts`](../src/lib/server/dev/fileFinding.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/types.ts`](../src/server/types.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

