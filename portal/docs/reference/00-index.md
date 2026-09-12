# Symbol reference — index

← Back to [the map contents page](../WORKSPACE-FILE-TREE.md)

The **consolidated source map**: every source file, exported symbol, internal dependency and dependant in eight large volumes. This is the "where is everything" layer — grep it to find any file or function without opening source.

**Generated** by `scripts/generate-symbol-reference.mjs` (parses the code with the TypeScript compiler — complete and re-runnable; regenerate after code changes). Covers `src/` + `scripts/`.

- **2844** files · **9765** exported symbols.

- **8** large source-reference volumes · **1** master file index · **0** per-source Markdown stubs.

## Volumes

- [Engines — `src/engines/`](engines.md) — 89 files, 746 symbols
- [State layer — `src/server/`](server.md) — 76 files, 1218 symbols
- [Shared logic — `src/lib/`](lib.md) — 400 files, 2678 symbols
- [Shared components — `src/components/`](components.md) — 132 files, 324 symbols
- [Plugins — `src/built-ins/`](built-ins.md) — 774 files, 3445 symbols
- [App routes & UI — `src/app/`](app.md) — 686 files, 1315 symbols
- [Scripts — `scripts/`](scripts.md) — 681 files, 26 symbols
- [Other `src/`](misc.md) — 6 files, 13 symbols

- [Master source-file index](files-index.md) — every path linked directly to its anchored entry in the correct volume.

> For the higher-level "what each area does" prose, see the [chapters](../workspace/). For where-a-feature-lives, the [feature index](../workspace/feature-index.md). These volumes are the ground-truth source graph beneath both.
