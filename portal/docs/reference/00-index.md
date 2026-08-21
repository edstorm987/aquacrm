# Symbol reference — index

← Back to [the map contents page](../WORKSPACE-FILE-TREE.md)

The **function-by-function** map: every exported symbol in every source file, with its real signature and doc-comment. This is the "where is everything" layer — grep it to find any function without opening source.

**Generated** by `scripts/generate-symbol-reference.mjs` (parses the code with the TypeScript compiler — complete and re-runnable; regenerate after code changes). Covers `src/` + `scripts/`.

- **1954** files · **6728** exported symbols.

## Files

- [State layer — `src/server/`](server.md) — 56 files, 829 symbols
- [Shared logic — `src/lib/`](lib.md) — 214 files, 1390 symbols
- [Shared components — `src/components/`](components.md) — 72 files, 111 symbols
- [Plugins — `src/built-ins/`](built-ins.md) — 720 files, 3032 symbols
- [App routes & UI — `src/app/`](app.md) — 548 files, 1000 symbols
- [Scripts — `scripts/`](scripts.md) — 284 files, 8 symbols
- [Other `src/`](misc.md) — 60 files, 358 symbols

> For the higher-level "what each area does" prose, see the [chapters](../workspace/). For where-a-feature-lives, the [feature index](../workspace/feature-index.md). This reference is the ground-truth symbol list beneath both.
