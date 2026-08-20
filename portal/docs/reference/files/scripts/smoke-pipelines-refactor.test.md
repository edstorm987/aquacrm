# `scripts/smoke-pipelines-refactor.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** T1 R034 smoke — multi-pipeline kanban refactor. Run via `npm run smoke:pipelines-refactor` (tsx --test).  Surface: - Pipeline CRUD (create / read / update / delete + cascade). - Default seed (idempotent fulfilment + leads + sales). - Multi-pipeline reads (sortOrder + per-agency scoping). - Slug uniqueness within an agency (clash → numeric suffix). - Card add — kind enforcement via allowedCardKinds. - Client → fulfilment-card projection (read-only). - Migration runner (idempotent on second run). - PortalState type carries `pipelines` + `pipelineCards` keys. - Source-marker checks: hub page, [slug] view, sidebar nav, bootstrap wire-up, default column packs.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

