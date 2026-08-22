# Symbol reference — index

← Back to [the map contents page](../WORKSPACE-FILE-TREE.md)

The **function-by-function** map: every exported symbol in every source file, with its real signature and doc-comment. This is the "where is everything" layer — grep it to find any function without opening source.

**Generated** by `scripts/generate-symbol-reference.mjs` (parses the code with the TypeScript compiler — complete and re-runnable; regenerate after code changes). Covers `src/` + `scripts/`.

- **2028** files · **7057** exported symbols.

## Files

- [Engines — `src/engines/`](engines.md) — 75 files, 560 symbols
- [State layer — `src/server/`](server.md) — 56 files, 840 symbols
- [Shared logic — `src/lib/`](lib.md) — 215 files, 1405 symbols
- [Shared components — `src/components/`](components.md) — 89 files, 193 symbols
- [Plugins — `src/built-ins/`](built-ins.md) — 720 files, 3033 symbols
- [App routes & UI — `src/app/`](app.md) — 557 files, 1010 symbols
- [Scripts — `scripts/`](scripts.md) — 311 files, 8 symbols
- [Other `src/`](misc.md) — 5 files, 8 symbols

> For the higher-level "what each area does" prose, see the [chapters](../workspace/). For where-a-feature-lives, the [feature index](../workspace/feature-index.md). This reference is the ground-truth symbol list beneath both.
