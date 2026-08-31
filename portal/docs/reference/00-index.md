# Symbol reference — index

← Back to [the map contents page](../WORKSPACE-FILE-TREE.md)

The **consolidated source map**: every source file, exported symbol, internal dependency and dependant in eight large volumes. This is the "where is everything" layer — grep it to find any file or function without opening source.

**Generated** by `scripts/generate-symbol-reference.mjs` (parses the code with the TypeScript compiler — complete and re-runnable; regenerate after code changes). Covers `src/` + `scripts/`.

- **2539** files · **8756** exported symbols.

- **8** large source-reference volumes · **1** master file index · **0** per-source Markdown stubs.

## Volumes

- [Engines — `src/engines/`](engines.md) — 83 files, 671 symbols
- [State layer — `src/server/`](server.md) — 70 files, 1102 symbols
- [Shared logic — `src/lib/`](lib.md) — 325 files, 2090 symbols
- [Shared components — `src/components/`](components.md) — 126 files, 306 symbols
- [Plugins — `src/built-ins/`](built-ins.md) — 754 files, 3329 symbols
- [App routes & UI — `src/app/`](app.md) — 641 files, 1221 symbols
- [Scripts — `scripts/`](scripts.md) — 534 files, 26 symbols
- [Other `src/`](misc.md) — 6 files, 11 symbols

- [Master source-file index](files-index.md) — every path linked directly to its anchored entry in the correct volume.

> For the higher-level "what each area does" prose, see the [chapters](../workspace/). For where-a-feature-lives, the [feature index](../workspace/feature-index.md). These volumes are the ground-truth source graph beneath both.
