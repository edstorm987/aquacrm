# Symbol reference — index

← Back to [the map contents page](../WORKSPACE-FILE-TREE.md)

The **consolidated source map**: every source file, exported symbol, internal dependency and dependant in eight large volumes. This is the "where is everything" layer — grep it to find any file or function without opening source.

**Generated** by `scripts/generate-symbol-reference.mjs` (parses the code with the TypeScript compiler — complete and re-runnable; regenerate after code changes). Covers `src/` + `scripts/`.

- **2462** files · **8408** exported symbols.

- **8** large source-reference volumes · **1** master file index · **0** per-source Markdown stubs.

## Volumes

- [Engines — `src/engines/`](engines.md) — 83 files, 669 symbols
- [State layer — `src/server/`](server.md) — 66 files, 1054 symbols
- [Shared logic — `src/lib/`](lib.md) — 303 files, 1924 symbols
- [Shared components — `src/components/`](components.md) — 120 files, 297 symbols
- [Plugins — `src/built-ins/`](built-ins.md) — 748 files, 3263 symbols
- [App routes & UI — `src/app/`](app.md) — 628 files, 1167 symbols
- [Scripts — `scripts/`](scripts.md) — 509 files, 26 symbols
- [Other `src/`](misc.md) — 5 files, 8 symbols

- [Master source-file index](files-index.md) — every path linked directly to its anchored entry in the correct volume.

> For the higher-level "what each area does" prose, see the [chapters](../workspace/). For where-a-feature-lives, the [feature index](../workspace/feature-index.md). These volumes are the ground-truth source graph beneath both.
