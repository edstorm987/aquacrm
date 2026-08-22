# Symbol reference — index

← Back to [the map contents page](../WORKSPACE-FILE-TREE.md)

The **function-by-function** map: every exported symbol in every source file, with its real signature and doc-comment. This is the "where is everything" layer — grep it to find any function without opening source.

**Generated** by `scripts/generate-symbol-reference.mjs` (parses the code with the TypeScript compiler — complete and re-runnable; regenerate after code changes). Covers `src/` + `scripts/`.

- **2051** files · **7193** exported symbols.

## Files

- [Engines — `src/engines/`](engines.md) — 78 files, 638 symbols
- [State layer — `src/server/`](server.md) — 56 files, 840 symbols
- [Shared logic — `src/lib/`](lib.md) — 219 files, 1427 symbols
- [Shared components — `src/components/`](components.md) — 93 files, 201 symbols
- [Plugins — `src/built-ins/`](built-ins.md) — 722 files, 3059 symbols
- [App routes & UI — `src/app/`](app.md) — 558 files, 1012 symbols
- [Scripts — `scripts/`](scripts.md) — 320 files, 8 symbols
- [Other `src/`](misc.md) — 5 files, 8 symbols

> For the higher-level "what each area does" prose, see the [chapters](../workspace/). For where-a-feature-lives, the [feature index](../workspace/feature-index.md). This reference is the ground-truth symbol list beneath both.
