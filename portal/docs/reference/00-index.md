# Symbol reference — index

← Back to [the map contents page](../WORKSPACE-FILE-TREE.md)

The **function-by-function** map: every exported symbol in every source file, with its real signature and doc-comment. This is the "where is everything" layer — grep it to find any function without opening source.

**Generated** by `scripts/generate-symbol-reference.mjs` (parses the code with the TypeScript compiler — complete and re-runnable; regenerate after code changes). Covers `src/` + `scripts/`.

- **1938** files · **6696** exported symbols.

## Files

- [State layer — `src/server/`](server.md) — 58 files, 847 symbols
- [Shared logic — `src/lib/`](lib.md) — 266 files, 1712 symbols
- [Shared components — `src/components/`](components.md) — 70 files, 101 symbols
- [Plugins — `src/built-ins/`](built-ins.md) — 720 files, 3032 symbols
- [App routes & UI — `src/app/`](app.md) — 545 files, 988 symbols
- [Scripts — `scripts/`](scripts.md) — 274 files, 8 symbols
- [Other `src/`](misc.md) — 5 files, 8 symbols

> For the higher-level "what each area does" prose, see the [chapters](../workspace/). For where-a-feature-lives, the [feature index](../workspace/feature-index.md). This reference is the ground-truth symbol list beneath both.
